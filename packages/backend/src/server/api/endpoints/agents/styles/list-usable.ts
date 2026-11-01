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
import { agentPreviewText } from '@/core/agent-preview-text.js';
import {
	batchPlazaRatingsByStyleIds,
	batchCommunitySessionCountByStyleIds,
	batchCommunityAssistantReplyCountByStyleIds,
} from '@/core/agent-plaza-display-stats.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'read:chat',
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

export const paramDef = { type: 'object', properties: {}, required: [] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		@Inject(DI.agentUserStyleSubscriptionsRepository)
		private agentUserStyleSubscriptionsRepository: AgentUserStyleSubscriptionsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.agentPlazaReviewsRepository)
		private agentPlazaReviewsRepository: AgentPlazaReviewsRepository,

		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		private agentService: AgentService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const mine = await this.agentDialogueStylesRepository.find({
				where: { userId: me.id },
				order: { updatedAt: 'DESC' },
				select: { id: true, userId: true, name: true, isPublished: true, body: true, summary: true, reviewStatus: true, publishedVersion: true, createdAt: true, updatedAt: true },
				take: 200,
			});
			// 订阅不设任意上限（原先 take:500 会静默截断第 501 个起的订阅）
			const subs = await this.agentUserStyleSubscriptionsRepository.find({
				where: { userId: me.id },
				select: { styleId: true },
			});
			const subIds = subs.map(s => s.styleId).filter(Boolean);
			let subscribedRows: typeof mine = [];
			if (subIds.length > 0) {
				subscribedRows = await this.agentDialogueStylesRepository.find({
					where: { id: In(subIds), isPublished: true },
					select: { id: true, userId: true, name: true, isPublished: true, body: true, summary: true, publishedSnapshot: true, createdAt: true, updatedAt: true },
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
					bodyPreview: agentPreviewText(r.body, { maxLength: 200 }),
					summary: r.summary,
					reviewStatus: r.reviewStatus,
					publishedVersion: r.publishedVersion,
					createdAt: r.createdAt.toISOString(),
					updatedAt: r.updatedAt.toISOString(),
				});
			}
			for (const r of subscribedRows) {
				if (r.userId === me.id) continue;
				if (!byId.has(r.id)) {
					const d = this.agentService.stylePlazaDisplayFields(r as MiAgentDialogueStyle);
					byId.set(r.id, {
						id: r.id,
						name: d.name,
						isPublished: r.isPublished,
						isMine: false,
						subscribed: true,
						userId: r.userId,
						bodyPreview: agentPreviewText(d.body, { maxLength: 200 }),
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
			// 混合（自有+订阅）排序：updatedAt 主序 + id 决胜，保证顺序确定
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
				.sort((a, b) => {
					const byTime = b.updatedAt.localeCompare(a.updatedAt);
					return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
				});
		});
	}
}
