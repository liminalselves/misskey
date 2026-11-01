/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentDialogueStylesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { agentPreviewText } from '@/core/agent-preview-text.js';

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
				summary: { type: 'string', nullable: true },
				isPublished: { type: 'boolean' },
				isMine: { type: 'boolean' },
				subscribed: { type: 'boolean' },
				userId: { type: 'string', format: 'misskey:id' },
				bodyPreview: { type: 'string' },
				reviewStatus: { type: 'string', optional: true },
				publishedVersion: { type: 'integer', nullable: true, optional: true },
				reviewRejectReason: { type: 'string', nullable: true, optional: true },
				reviewRejectMessage: { type: 'string', nullable: true, optional: true },
				createdAt: { type: 'string', format: 'date-time' },
				updatedAt: { type: 'string', format: 'date-time' },
				user: { type: 'object', ref: 'UserLite' },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
		untilId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		private agentService: AgentService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const limit = ps.limit ?? 100;
			const qb = this.agentDialogueStylesRepository.createQueryBuilder('s')
				.where('s.userId = :userId', { userId: me.id })
				.select(['s.id', 's.userId', 's.name', 's.body', 's.summary', 's.isPublished', 's.reviewStatus', 's.publishedVersion', 's.reviewRejectReason', 's.reviewRejectMessage', 's.createdAt', 's.updatedAt'])
				.orderBy('s.updatedAt', 'DESC')
				.addOrderBy('s.id', 'DESC')
				.take(limit);
			if (ps.untilId != null) {
				// (updatedAt, id) 复合游标：updatedAt 相同的并列行按 id 决胜，避免翻页丢行/重行
				const cursor = await this.agentDialogueStylesRepository.findOne({
					where: { id: ps.untilId, userId: me.id },
					select: { id: true, updatedAt: true },
				});
				if (cursor) {
					qb.andWhere('(s.updatedAt < :cursorUpdatedAt OR (s.updatedAt = :cursorUpdatedAt AND s.id < :cursorId))', {
						cursorUpdatedAt: cursor.updatedAt,
						cursorId: cursor.id,
					});
				}
			}
			const rows = await qb.getMany();
			const userLite = await this.userEntityService.pack(me, me, { schema: 'UserLite' });
			return rows.map(r => ({
				id: r.id,
				name: r.name,
				summary: r.summary,
				isPublished: r.isPublished,
				isMine: true,
				subscribed: false,
				userId: r.userId,
				bodyPreview: agentPreviewText(r.body, { maxLength: 200 }),
				reviewStatus: r.reviewStatus,
				publishedVersion: r.publishedVersion,
				reviewRejectReason: r.reviewRejectReason,
				reviewRejectMessage: r.reviewRejectMessage,
				createdAt: r.createdAt.toISOString(),
				updatedAt: r.updatedAt.toISOString(),
				user: userLite,
			}));
		});
	}
}
