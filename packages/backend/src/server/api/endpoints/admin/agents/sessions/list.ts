/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { AgentSessionsRepository, AgentCharactersRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { AgentService } from '@/core/AgentService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

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
				createdAt: { type: 'string', format: 'date-time' },
				updatedAt: { type: 'string', format: 'date-time' },
				userId: { type: 'string', format: 'misskey:id' },
				name: { type: 'string' },
				characterId: { type: 'string', format: 'misskey:id' },
				dialogueStyleId: { type: 'string', format: 'misskey:id', nullable: true },
				sessionKind: { type: 'string', enum: ['draft_test', 'community'] },
				lastMessageAt: { type: 'string', format: 'date-time', nullable: true },
				agentReplyPending: { type: 'boolean' },
				characterName: { type: 'string' },
				user: { type: 'object', ref: 'UserLite' },
			},
		},
	},
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

			const qbSelect = [
				's.id', 's.createdAt', 's.updatedAt', 's.userId', 's.name',
				's.characterId', 's.dialogueStyleId', 's.sessionKind',
				's.lastMessageAt', 's.agentReplyPending',
			] as const;

			if (ps.sessionId) {
				const row = await this.agentSessionsRepository.findOne({
					where: { id: ps.sessionId },
					select: {
						id: true,
						createdAt: true,
						updatedAt: true,
						userId: true,
						name: true,
						characterId: true,
						dialogueStyleId: true,
						sessionKind: true,
						lastMessageAt: true,
						agentReplyPending: true,
					},
				});
				if (!row) return [];
				const users = await this.usersRepository.findBy({ id: row.userId });
				const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
				const user = packedUsers[0];
				if (!user) return [];

				const ch = await this.agentCharactersRepository.findOne({
					where: { id: row.characterId },
					select: ['id', 'name'],
				});

				return [{
					id: row.id,
					createdAt: row.createdAt.toISOString(),
					updatedAt: row.updatedAt.toISOString(),
					userId: row.userId,
					name: row.name,
					characterId: row.characterId,
					dialogueStyleId: row.dialogueStyleId,
					sessionKind: row.sessionKind,
					lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
					agentReplyPending: row.agentReplyPending,
					characterName: ch?.name ?? '',
					user,
				}];
			}

			const q = this.queryService.makePaginationQuery(
				this.agentSessionsRepository.createQueryBuilder('s')
					.select([...qbSelect]),
				null,
				ps.untilId ?? null,
			).take(ps.limit ?? 30);

			if (ps.userId) {
				q.andWhere('s.userId = :userId', { userId: ps.userId });
			}

			const rows = await q.getMany();
			if (rows.length === 0) return [];

			const charIds = [...new Set(rows.map(r => r.characterId))];
			const chars = charIds.length > 0
				? await this.agentCharactersRepository.find({
					where: { id: In(charIds) },
					select: ['id', 'name'],
				})
				: [];
			const charMap = new Map(chars.map(c => [c.id, c.name]));

			const userIds = [...new Set(rows.map(r => r.userId))];
			const users = await this.usersRepository.findBy({ id: In(userIds) });
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));

			return rows.map(r => ({
				id: r.id,
				createdAt: r.createdAt.toISOString(),
				updatedAt: r.updatedAt.toISOString(),
				userId: r.userId,
				name: r.name,
				characterId: r.characterId,
				dialogueStyleId: r.dialogueStyleId,
				sessionKind: r.sessionKind,
				lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
				agentReplyPending: r.agentReplyPending,
				characterName: charMap.get(r.characterId) ?? '',
				user: userById.get(r.userId)!,
			}));
		});
	}
}
