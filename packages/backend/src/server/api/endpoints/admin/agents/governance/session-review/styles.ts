/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentDialogueStylesRepository, AgentUserStyleSubscriptionsRepository, UsersRepository, AgentPlazaReviewsRepository, AgentSessionsRepository, AgentMessagesRepository } from '@/models/_.js';
import type { MiAgentDialogueStyle } from '@/models/AgentDialogueStyle.js';
import { In } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import {
	batchPlazaRatingsByStyleIds,
	batchCommunitySessionCountByStyleIds,
	batchCommunityAssistantReplyCountByStyleIds,
} from '@/core/agent-plaza-display-stats.js';
import { loadSessionForReview } from './_utils.js';

function previewBody(body: string, max = 200): string {
	const t = body.replace(/\s+/g, ' ').trim();
	if (t.length <= max) return t;
	return `${t.slice(0, max)}…`;
}

// 镜像 agents/styles/list-usable：以会话属主身份计算其可用文风列表
export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: { type: 'string', format: 'misskey:id' },
				name: { type: 'string' },
				isPublished: { type: 'boolean' },
				isMine: { type: 'boolean' },
				subscribed: { type: 'boolean' },
				userId: { type: 'string', format: 'misskey:id' },
				bodyPreview: { type: 'string' },
				summary: { type: 'string', nullable: true, optional: true },
				reviewStatus: { type: 'string', optional: true },
				publishedVersion: { type: 'integer', nullable: true, optional: true },
				createdAt: { type: 'string', format: 'date-time' },
				updatedAt: { type: 'string', format: 'date-time' },
				user: { type: 'object', ref: 'UserLite' },
				rating: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						average: { type: 'number', nullable: true },
						count: { type: 'number' },
					},
					required: ['average', 'count'],
				},
				conversationCount: { type: 'number' },
				aiReplyCount: { type: 'number' },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { sessionId: { type: 'string', format: 'misskey:id' } },
	required: ['sessionId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		@Inject(DI.agentUserStyleSubscriptionsRepository)
		private agentUserStyleSubscriptionsRepository: AgentUserStyleSubscriptionsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.agentPlazaReviewsRepository)
		private agentPlazaReviewsRepository: AgentPlazaReviewsRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		private agentService: AgentService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await loadSessionForReview(this.agentSessionsRepository, ps.sessionId);
			const ownerId = session.userId;
			const mine = await this.agentDialogueStylesRepository.find({
				where: { userId: ownerId },
				order: { updatedAt: 'DESC' },
				select: ['id', 'userId', 'name', 'isPublished', 'body', 'summary', 'reviewStatus', 'publishedVersion', 'createdAt', 'updatedAt'],
				take: 200,
			});
			const subs = await this.agentUserStyleSubscriptionsRepository.find({
				where: { userId: ownerId },
				select: ['styleId'],
				take: 500,
			});
			const subIds = subs.map(s => s.styleId).filter(Boolean);
			let subscribedRows: typeof mine = [];
			if (subIds.length > 0) {
				subscribedRows = await this.agentDialogueStylesRepository.find({
					where: { id: In(subIds), isPublished: true },
					select: ['id', 'userId', 'name', 'isPublished', 'body', 'summary', 'publishedSnapshot', 'createdAt', 'updatedAt'],
				});
			}
			const byId = new Map<string, {
				id: string;
				name: string;
				isPublished: boolean;
				isMine: boolean;
				subscribed: boolean;
				userId: string;
				bodyPreview: string;
				summary?: string | null;
				reviewStatus?: string;
				publishedVersion?: number | null;
				createdAt: string;
				updatedAt: string;
			}>();
			for (const r of mine) {
				byId.set(r.id, {
					id: r.id,
					name: r.name,
					isPublished: r.isPublished,
					isMine: true,
					subscribed: false,
					userId: r.userId,
					bodyPreview: previewBody(r.body),
					summary: r.summary,
					reviewStatus: r.reviewStatus,
					publishedVersion: r.publishedVersion,
					createdAt: r.createdAt.toISOString(),
					updatedAt: r.updatedAt.toISOString(),
				});
			}
			for (const r of subscribedRows) {
				if (r.userId === ownerId) continue;
				if (!byId.has(r.id)) {
					const d = this.agentService.stylePlazaDisplayFields(r as MiAgentDialogueStyle);
					byId.set(r.id, {
						id: r.id,
						name: d.name,
						isPublished: r.isPublished,
						isMine: false,
						subscribed: true,
						userId: r.userId,
						bodyPreview: previewBody(d.body),
						summary: d.summary,
						createdAt: r.createdAt.toISOString(),
						updatedAt: r.updatedAt.toISOString(),
					});
				}
			}
			const values = Array.from(byId.values());
			const styleIds = values.map(v => v.id);
			const [ratings, convs, aiReplies] = await Promise.all([
				batchPlazaRatingsByStyleIds(this.agentPlazaReviewsRepository, styleIds),
				batchCommunitySessionCountByStyleIds(this.agentSessionsRepository, styleIds),
				batchCommunityAssistantReplyCountByStyleIds(this.agentMessagesRepository, styleIds),
			]);
			const userIds = [...new Set(values.map(v => v.userId))];
			const users = await this.usersRepository.findBy({ id: In(userIds) });
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));
			return values
				.map(v => {
					const r = ratings.get(v.id) ?? { average: null, count: 0 };
					return {
						...v,
						user: userById.get(v.userId)!,
						rating: { average: r.average, count: r.count },
						conversationCount: convs.get(v.id) ?? 0,
						aiReplyCount: aiReplies.get(v.id) ?? 0,
					};
				})
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		});
	}
}
