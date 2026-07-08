/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { AgentCharactersRepository, AgentSessionsRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { AgentService } from '@/core/AgentService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { packSessionGovernanceRow } from '../_utils.js';

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
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		untilId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private queryService: QueryService,
		private agentService: AgentService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const select = ['s.id', 's.createdAt', 's.updatedAt', 's.userId', 's.name', 's.characterId', 's.dialogueStyleId', 's.sessionKind', 's.lastMessageAt', 's.agentReplyPending', 's.moderationBanned'] as const;

			const q = ps.sessionId
				? this.agentSessionsRepository.createQueryBuilder('s').select([...select]).where('s.id = :sessionId', { sessionId: ps.sessionId }).take(1)
				: this.queryService.makePaginationQuery(
					this.agentSessionsRepository.createQueryBuilder('s').select([...select]),
					null,
					ps.untilId ?? null,
				).take(ps.limit ?? 30);
			if (!ps.sessionId && ps.userId) q.andWhere('s.userId = :userId', { userId: ps.userId });

			const rows = await q.getMany();
			if (rows.length === 0) return [];

			const charIds = [...new Set(rows.map(r => r.characterId))];
			const chars = await this.agentCharactersRepository.find({ where: { id: In(charIds) }, select: ['id', 'name'] });
			const charMap = new Map(chars.map(c => [c.id, c.name]));
			const userIds = [...new Set(rows.map(r => r.userId))];
			const users = await this.usersRepository.findBy({ id: In(userIds) });
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));

			return rows.map(r => packSessionGovernanceRow(r, userById.get(r.userId) ?? null, charMap.get(r.characterId) ?? ''));
		});
	}
}
