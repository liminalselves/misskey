/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { AgentCharactersRepository, AgentMessagesRepository, AgentPlazaReviewsRepository, AgentSessionsRepository, UsersRepository } from '@/models/_.js';
import type { MiAgentCharacter } from '@/models/AgentCharacter.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { AgentService } from '@/core/AgentService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import {
	batchPlazaRatingsByCharacterIds,
	batchCommunitySessionCountByCharacterIds,
	batchCommunityAssistantReplyCountByCharacterIds,
} from '@/core/agent-plaza-display-stats.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
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
				userId: { type: 'string', format: 'misskey:id' },
				name: { type: 'string' },
				summary: { type: 'string', nullable: true },
				createdAt: { type: 'string', format: 'date-time' },
				updatedAt: { type: 'string', format: 'date-time' },
				publishedVersion: { type: 'integer', nullable: true },
				user: { type: 'object', ref: 'UserLite' },
				avatar: { type: 'object', ref: 'DriveFile', nullable: true },
				rating: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						average: { type: 'number', nullable: true },
						count: { type: 'number' },
					},
					required: ['average', 'count'],
				},
				conversationCount: { type: 'integer' },
				aiReplyCount: { type: 'integer' },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		sinceId: { type: 'string', format: 'misskey:id', nullable: true },
		untilId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.agentPlazaReviewsRepository)
		private agentPlazaReviewsRepository: AgentPlazaReviewsRepository,

		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		private queryService: QueryService,
		private agentService: AgentService,
		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const q = this.queryService.makePaginationQuery(
				this.agentCharactersRepository.createQueryBuilder('c')
					.where('c.isPublished = true')
					.select(['c.id', 'c.userId', 'c.name', 'c.summary', 'c.avatarFileId', 'c.publishedSnapshot', 'c.publishedVersion', 'c.createdAt', 'c.updatedAt']),
				ps.sinceId ?? null,
				ps.untilId ?? null,
			).take(ps.limit ?? 30);

			const rows = await q.getMany();
			if (rows.length === 0) return [];

			const userIds = [...new Set(rows.map(r => r.userId))];
			const users = await this.usersRepository.findBy({ id: In(userIds) });
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));

			const avatarIds = [...new Set(rows.map(r => r.avatarFileId).filter((id): id is string => id != null))];
			const avatarMap = avatarIds.length > 0
				? await this.driveFileEntityService.packManyByIdsMap(avatarIds, {})
				: new Map();

			const charIds = rows.map(r => r.id);
			const [ratings, convs, aiReplies] = await Promise.all([
				batchPlazaRatingsByCharacterIds(this.agentPlazaReviewsRepository, charIds),
				batchCommunitySessionCountByCharacterIds(this.agentSessionsRepository, charIds),
				batchCommunityAssistantReplyCountByCharacterIds(this.agentMessagesRepository, charIds),
			]);

			return rows.map(r => {
				const d = this.agentService.characterPlazaDisplayFields(r as MiAgentCharacter);
				const avatarId = d.avatarFileId;
				const agg = ratings.get(r.id) ?? { average: null, count: 0 };
				return {
					id: r.id,
					userId: r.userId,
					name: d.name,
					summary: d.summary,
					createdAt: r.createdAt.toISOString(),
					updatedAt: r.updatedAt.toISOString(),
					publishedVersion: r.publishedVersion,
					user: userById.get(r.userId)!,
					avatar: avatarId ? avatarMap.get(avatarId) ?? null : null,
					rating: { average: agg.average, count: agg.count },
					conversationCount: convs.get(r.id) ?? 0,
					aiReplyCount: aiReplies.get(r.id) ?? 0,
				};
			});
		});
	}
}
