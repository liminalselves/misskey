/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Brackets, In } from 'typeorm';
import type { AgentMessagesRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { QueryService } from '@/core/QueryService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { agentMessageRoles } from '@/models/AgentMessage.js';
import { escapeIlikePattern, packMessageGovernanceRow } from '../_utils.js';

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
		userId: { type: 'string', minLength: 1, maxLength: 128, nullable: true },
		sessionId: { type: 'string', minLength: 1, maxLength: 128, nullable: true },
		characterId: { type: 'string', minLength: 1, maxLength: 128, nullable: true },
		role: { type: 'string', enum: [...agentMessageRoles], nullable: true },
		query: { type: 'string', maxLength: 512, nullable: true },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 40 },
		sinceId: { type: 'string', format: 'misskey:id', nullable: true },
		untilId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private agentService: AgentService,
		private queryService: QueryService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			let q = this.agentMessagesRepository.createQueryBuilder('m')
				.innerJoinAndSelect('m.session', 's')
				.leftJoinAndSelect('s.character', 'c')
				.leftJoin('s.user', 'u');
			if (ps.userId) q = q.andWhere('s.userId = :userId', { userId: ps.userId });
			if (ps.sessionId) q = q.andWhere('m.sessionId = :sessionId', { sessionId: ps.sessionId });
			if (ps.characterId) q = q.andWhere('s.characterId = :characterId', { characterId: ps.characterId });
			if (ps.role) q = q.andWhere('m.role = :role', { role: ps.role });
			if (ps.query) {
				const keyword = ps.query.trim();
				const pattern = `%${escapeIlikePattern(keyword)}%`;
				q = q.andWhere(new Brackets(qb => {
					qb
						.where('m.content ILIKE :pattern ESCAPE \'\\\'')
						.orWhere('s.name ILIKE :pattern ESCAPE \'\\\'')
						.orWhere('c.name ILIKE :pattern ESCAPE \'\\\'')
						.orWhere('u.username ILIKE :pattern ESCAPE \'\\\'')
						.orWhere('u.name ILIKE :pattern ESCAPE \'\\\'')
						.orWhere('m.id = :keyword')
						.orWhere('m.sessionId = :keyword')
						.orWhere('s.userId = :keyword')
						.orWhere('s.characterId = :keyword');
				}), { pattern, keyword });
			}
			q = this.queryService.makePaginationQuery(q, ps.sinceId ?? null, ps.untilId ?? null);
			const rows = await q.take(ps.limit ?? 40).getMany();

			const userIds = [...new Set(rows.map(m => m.session?.userId).filter((id): id is string => typeof id === 'string'))];
			const users = userIds.length > 0 ? await this.usersRepository.findBy({ id: In(userIds) }) : [];
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));
			const mapped = rows.map(m => packMessageGovernanceRow(m, m.session?.userId ? userById.get(m.session.userId) ?? null : null));
			if (ps.sinceId && !ps.untilId) mapped.reverse();
			return mapped;
		});
	}
}
