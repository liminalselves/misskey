/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { AgentImageGenerationsRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { QueryService } from '@/core/QueryService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

function escapeIlikePattern(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export const meta = {
	tags: ['admin'],
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
			properties: {
				id: { type: 'string', format: 'misskey:id' },
				createdAt: { type: 'string', format: 'date-time' },
				updatedAt: { type: 'string', format: 'date-time' },
				userId: { type: 'string', format: 'misskey:id' },
				user: { type: 'object', ref: 'UserLite', nullable: true },
				sessionId: { type: 'string', format: 'misskey:id' },
				messageId: { type: 'string', format: 'misskey:id', nullable: true },
				placeholderIndex: { type: 'integer' },
				tag: { type: 'string' },
				size: { type: 'string' },
				provider: { type: 'string' },
				imageModelId: { type: 'string' },
				status: { type: 'string' },
				fileId: { type: 'string', nullable: true },
				url: { type: 'string', nullable: true },
				errorCode: { type: 'string', nullable: true },
				cost: { type: 'number' },
				isBlocked: { type: 'boolean' },
				blockedReason: { type: 'string', nullable: true },
				autoCleanedAt: { type: 'string', format: 'date-time', nullable: true },
				autoCleanedReason: { type: 'string', nullable: true },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id', nullable: true },
		sessionId: { type: 'string', format: 'misskey:id', nullable: true },
		messageId: { type: 'string', format: 'misskey:id', nullable: true },
		status: { type: 'string', nullable: true },
		blocked: { type: 'boolean', nullable: true },
		query: { type: 'string', minLength: 1, maxLength: 512, nullable: true },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 40 },
		sinceId: { type: 'string', format: 'misskey:id', nullable: true },
		untilId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentImageGenerationsRepository)
		private agentImageGenerationsRepository: AgentImageGenerationsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private agentService: AgentService,
		private queryService: QueryService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			let q = this.agentImageGenerationsRepository.createQueryBuilder('g');
			if (ps.userId) q = q.andWhere('g.userId = :userId', { userId: ps.userId });
			if (ps.sessionId) q = q.andWhere('g.sessionId = :sessionId', { sessionId: ps.sessionId });
			if (ps.messageId) q = q.andWhere('g.messageId = :messageId', { messageId: ps.messageId });
			if (ps.status) q = q.andWhere('g.status = :status', { status: ps.status });
			if (ps.blocked != null) q = q.andWhere('g.isBlocked = :blocked', { blocked: ps.blocked });
			if (ps.query) {
				const pattern = `%${escapeIlikePattern(ps.query)}%`;
				q = q.andWhere('g.tag ILIKE :pattern ESCAPE \'\\\'', { pattern });
			}
			q = this.queryService.makePaginationQuery(q, ps.sinceId ?? null, ps.untilId ?? null);
			const rows = await q.take(ps.limit ?? 40).getMany();
			const userIds = [...new Set(rows.map(r => r.userId))];
			const users = userIds.length > 0 ? await this.usersRepository.findBy({ id: In(userIds) }) : [];
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));
			return rows.map(r => ({
				id: r.id,
				createdAt: r.createdAt.toISOString(),
				updatedAt: r.updatedAt.toISOString(),
				userId: r.userId,
				user: userById.get(r.userId) ?? null,
				sessionId: r.sessionId,
				messageId: r.messageId,
				placeholderIndex: r.placeholderIndex,
				tag: r.tag,
				size: r.size,
				provider: r.provider,
				imageModelId: r.imageModelId,
				status: r.status,
				fileId: r.fileId,
				url: r.isBlocked ? null : r.url,
				errorCode: r.errorCode,
				cost: r.cost,
				isBlocked: r.isBlocked,
				blockedReason: r.blockedReason,
				autoCleanedAt: r.autoCleanedAt?.toISOString() ?? null,
				autoCleanedReason: r.autoCleanedReason,
			}));
		});
	}
}
