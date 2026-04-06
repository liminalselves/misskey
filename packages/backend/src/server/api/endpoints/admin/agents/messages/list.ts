/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { AgentMessagesRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { QueryService } from '@/core/QueryService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { agentMessageRoles } from '@/models/AgentMessage.js';

function escapeIlikePattern(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export const meta = {
	tags: ['admin'],
	requireCredential: true,
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
				role: { type: 'string', enum: [...agentMessageRoles] },
				content: { type: 'string' },
				createdAt: { type: 'string', format: 'date-time' },
				sessionId: { type: 'string', format: 'misskey:id' },
				sessionName: { type: 'string' },
				sessionKind: { type: 'string', enum: ['draft_test', 'community'] },
				userId: { type: 'string', format: 'misskey:id' },
				user: { type: 'object', ref: 'UserLite', nullable: true },
				characterId: { type: 'string', format: 'misskey:id' },
				characterName: { type: 'string' },
				dialogueStyleId: { type: 'string', format: 'misskey:id' },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id', nullable: true },
		sessionId: { type: 'string', format: 'misskey:id', nullable: true },
		characterId: { type: 'string', format: 'misskey:id', nullable: true },
		role: { type: 'string', enum: [...agentMessageRoles], nullable: true },
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
				.leftJoinAndSelect('s.character', 'c');

			if (ps.userId) {
				q = q.andWhere('s.userId = :userId', { userId: ps.userId });
			}
			if (ps.sessionId) {
				q = q.andWhere('m.sessionId = :sessionId', { sessionId: ps.sessionId });
			}
			if (ps.characterId) {
				q = q.andWhere('s.characterId = :characterId', { characterId: ps.characterId });
			}
			if (ps.role) {
				q = q.andWhere('m.role = :role', { role: ps.role });
			}
			if (ps.query) {
				const pattern = `%${escapeIlikePattern(ps.query)}%`;
				q = q.andWhere('m.content ILIKE :pattern ESCAPE \'\\\'', { pattern });
			}

			q = this.queryService.makePaginationQuery(q, ps.sinceId ?? null, ps.untilId ?? null);
			const rows = await q.take(ps.limit ?? 40).getMany();

			const userIds = [...new Set(rows.map(m => m.session!.userId))];
			const users = userIds.length > 0 ? await this.usersRepository.findBy({ id: In(userIds) }) : [];
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));

			const mapped = rows.map(m => {
				const s = m.session!;
				const ch = s.character;
				return {
					id: m.id,
					role: m.role,
					content: m.content,
					createdAt: m.createdAt.toISOString(),
					sessionId: m.sessionId,
					sessionName: s.name,
					sessionKind: s.sessionKind,
					userId: s.userId,
					user: userById.get(s.userId) ?? null,
					characterId: s.characterId,
					characterName: ch?.name ?? '',
					dialogueStyleId: s.dialogueStyleId,
				};
			});

			if (ps.sinceId && !ps.untilId) {
				mapped.reverse();
			}
			return mapped;
		});
	}
}
