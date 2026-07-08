/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { AgentExternalAuditLogsRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { QueryService } from '@/core/QueryService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { agentExternalAuditStatuses } from '@/models/AgentExternalAuditLog.js';
import { escapeIlikePattern } from '../_utils.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: { type: 'array', optional: false, nullable: false, items: { type: 'object', additionalProperties: true } },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id', nullable: true },
		sessionId: { type: 'string', format: 'misskey:id', nullable: true },
		modelId: { type: 'string', nullable: true },
		status: { type: 'string', enum: [...agentExternalAuditStatuses], nullable: true },
		blockCode: { type: 'string', nullable: true },
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
		@Inject(DI.agentExternalAuditLogsRepository)
		private agentExternalAuditLogsRepository: AgentExternalAuditLogsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private agentService: AgentService,
		private queryService: QueryService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			let q = this.agentExternalAuditLogsRepository.createQueryBuilder('log')
				.leftJoinAndSelect('log.session', 'session')
				.leftJoinAndSelect('log.character', 'character');
			if (ps.userId) q = q.andWhere('log.userId = :userId', { userId: ps.userId });
			if (ps.sessionId) q = q.andWhere('log.sessionId = :sessionId', { sessionId: ps.sessionId });
			if (ps.modelId) q = q.andWhere('log.modelId = :modelId', { modelId: ps.modelId });
			if (ps.status) q = q.andWhere('log.status = :status', { status: ps.status });
			if (ps.blockCode) q = q.andWhere('log.blockCode = :blockCode', { blockCode: ps.blockCode.trim() });
			if (ps.query) {
				const pattern = `%${escapeIlikePattern(ps.query)}%`;
				q = q.andWhere('(log.userText ILIKE :pattern ESCAPE \'\\\' OR log.assistantText ILIKE :pattern ESCAPE \'\\\' OR log.reason ILIKE :pattern ESCAPE \'\\\')', { pattern });
			}
			q = this.queryService.makePaginationQuery(q, ps.sinceId ?? null, ps.untilId ?? null);
			const rows = await q.take(ps.limit ?? 40).getMany();
			const userIds = [...new Set(rows.map(r => r.userId).filter((id): id is string => typeof id === 'string'))];
			const users = userIds.length > 0 ? await this.usersRepository.findBy({ id: In(userIds) }) : [];
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));
			return rows.map(r => ({
				id: r.id,
				createdAt: r.createdAt.toISOString(),
				completedAt: r.completedAt?.toISOString() ?? null,
				durationMs: r.durationMs,
				userId: r.userId,
				user: r.userId ? userById.get(r.userId) ?? null : null,
				sessionId: r.sessionId,
				sessionName: r.session?.name ?? null,
				characterId: r.characterId,
				characterName: r.character?.name ?? '',
				dialogueStyleId: r.dialogueStyleId,
				modelId: r.modelId,
				modelName: r.modelName,
				apiModelName: r.apiModelName,
				baseUrl: r.baseUrl,
				priority: r.priority,
				attemptIndex: r.attemptIndex,
				status: r.status,
				blockCode: r.blockCode,
				category: r.category,
				reason: r.reason,
				confidence: r.confidence,
				userText: r.userText,
				assistantText: r.assistantText,
				responseText: r.responseText,
				errorCode: r.errorCode,
				errorMessage: r.errorMessage,
			}));
		});
	}
}
