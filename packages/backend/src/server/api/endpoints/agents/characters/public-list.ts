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

function shuffleArray<T>(array: T[]): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

function weightedSampleFromGroup(items: { id: string; score: number }[], count: number): { id: string; score: number }[] {
	if (items.length <= count) return [...items];

	const maxScore = 60;
	const remaining = items.map(item => ({ ...item, cappedScore: Math.min(item.score, maxScore) }));
	const selected: { id: string; score: number }[] = [];

	for (let i = 0; i < count && remaining.length > 0; i++) {
		const total = remaining.reduce((sum, item) => sum + item.cappedScore, 0);
		if (total <= 0) {
			const idx = Math.floor(Math.random() * remaining.length);
			const [chosen] = remaining.splice(idx, 1);
			selected.push({ id: chosen.id, score: chosen.score });
			continue;
		}
		let r = Math.random() * total;
		let chosenIndex = 0;
		for (let j = 0; j < remaining.length; j++) {
			r -= remaining[j].cappedScore;
			if (r <= 0) { chosenIndex = j; break; }
		}
		const [chosen] = remaining.splice(chosenIndex, 1);
		selected.push({ id: chosen.id, score: chosen.score });
	}

	return selected;
}

function weightedRandomSample(items: { id: string; score: number }[], count: number): { id: string; score: number }[] {
	if (items.length <= count) return shuffleArray([...items]);
	const sorted = [...items].sort((a, b) => b.score - a.score);
	const mid = Math.floor(sorted.length / 2);
	const high = sorted.slice(0, mid);
	const low = sorted.slice(mid);
	const highCount = Math.ceil(count * 0.7);
	const lowCount = count - highCount;
	const pickedHigh = weightedSampleFromGroup(high, highCount);
	const lowShuffled = shuffleArray([...low]).slice(0, lowCount);
	return shuffleArray([...pickedHigh, ...lowShuffled]);
}

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
				hasWorldbook: { type: 'boolean' },
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
		offset: { type: 'integer', minimum: 0, default: 0 },
		sort: { type: 'string', enum: ['recommended', 'heat', 'rating', 'latest'], default: 'recommended' },
		excludeIds: { type: 'array', items: { type: 'string', format: 'misskey:id' }, default: [] },
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
			const limit = ps.limit ?? 30;
			const sort = ps.sort ?? 'recommended';

			let q = this.agentCharactersRepository.createQueryBuilder('c')
				.where('c.isPublished = true')
				.andWhere('c.moderationBanned = false')
				.select(['c.id', 'c.userId', 'c.name', 'c.summary', 'c.avatarFileId', 'c.publishedSnapshot', 'c.publishedVersion', 'c.createdAt', 'c.updatedAt']);

			// For stable pagination with non-id ordering, use offset-based paging.
			// sinceId/untilId is kept for backward compatibility on latest(id) style.
			if (sort === 'latest') {
				q = q.orderBy('c.updatedAt', 'DESC').addOrderBy('c.id', 'DESC');
				if (ps.sinceId || ps.untilId) {
					q = this.queryService.makePaginationQuery(q, ps.sinceId ?? null, ps.untilId ?? null);
				} else {
					q = q.offset(ps.offset ?? 0);
				}
			} else {
				q = q
					.leftJoin(qb => qb
						.select('r.characterId', 'character_id')
						.addSelect('AVG(r.stars)', 'avg')
						.addSelect('COUNT(*)', 'cnt')
						.from('agent_plaza_review', 'r')
						.where('r.characterId IS NOT NULL')
						.groupBy('r.characterId'), 'rt', 'rt.character_id = c.id')
					.leftJoin(qb => qb
						.select('s.characterId', 'character_id')
						.addSelect('COUNT(*)', 'cnt')
						.from('agent_session', 's')
						.where('s.sessionKind = :kind', { kind: 'community' })
						.groupBy('s.characterId'), 'ct', 'ct.character_id = c.id')
					.addSelect('COALESCE(ct.cnt, 0)', 'conv_count')
					.addSelect('COALESCE(rt.avg, 0)', 'rating_avg')
					.addSelect('COALESCE(rt.cnt, 0)', 'rating_cnt')
					.offset(ps.offset ?? 0);

				if (sort === 'heat') {
					q = q.orderBy('conv_count', 'DESC').addOrderBy('c.updatedAt', 'DESC').addOrderBy('c.id', 'DESC');
				} else if (sort === 'rating') {
					q = q.orderBy('rating_avg', 'DESC').addOrderBy('rating_cnt', 'DESC').addOrderBy('c.updatedAt', 'DESC').addOrderBy('c.id', 'DESC');
				} else {
					// recommended: score + weighted random sampling (discover-like)
					// Bayesian rating mean to avoid small-sample dominance.
					const scoreExpr = [
						`((COALESCE(rt.avg, 0) * COALESCE(rt.cnt, 0) + 3.5 * 5) / (COALESCE(rt.cnt, 0) + 5)) * 10`, // 0..50
						`LN(1 + COALESCE(ct.cnt, 0)) * 2`, // ~0..14
						`(1 / (1 + (EXTRACT(EPOCH FROM (NOW() - c.updatedAt)) / 86400))) * 1`, // 0..1
					].join(' + ');

					const candidateLimit = 1200;
					const raw = await q
						.addSelect(`(${scoreExpr})`, 'recommended_score')
						.orderBy('recommended_score', 'DESC')
						.addOrderBy('c.id', 'DESC')
						.offset(0)
						.limit(candidateLimit)
						.getRawMany<{ c_id: string; recommended_score: string | number }>();

					const exclude = new Set(ps.excludeIds ?? []);
					const candidates = raw
						.map(r => ({ id: r.c_id, score: typeof r.recommended_score === 'string' ? Number(r.recommended_score) : (r.recommended_score ?? 0) }))
						.filter(x => !exclude.has(x.id));

					if (candidates.length === 0) return [];
					const picked = weightedRandomSample(candidates, Math.min(limit, candidates.length));
					const pickedIds = picked.map(x => x.id);

					// Replace entity query: load only picked ids, keep sampled order
				const pickedRows = await this.agentCharactersRepository.createQueryBuilder('c')
					.where('c.isPublished = true')
					.andWhere('c.moderationBanned = false')
					.andWhere('c.id IN (:...ids)', { ids: pickedIds })
					.select(['c.id', 'c.userId', 'c.name', 'c.summary', 'c.avatarFileId', 'c.publishedSnapshot', 'c.publishedVersion', 'c.createdAt', 'c.updatedAt'])
					.getMany();

					// Stable output order following sampled ids
					const rowById = new Map(pickedRows.map(r => [r.id, r]));
					const ordered = pickedIds.map(id => rowById.get(id)).filter((r): r is typeof pickedRows[number] => r != null);

					// Continue with the common packing logic using ordered rows
					const rows = ordered;
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
							hasWorldbook: d.hasWorldbook,
							user: userById.get(r.userId)!,
							avatar: avatarId ? avatarMap.get(avatarId) ?? null : null,
							rating: { average: agg.average, count: agg.count },
							conversationCount: convs.get(r.id) ?? 0,
							aiReplyCount: aiReplies.get(r.id) ?? 0,
						};
					});
				}
			}

			// Recommended sort returns early above; only heat/rating/latest reach here.
			q = q.limit(limit);

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
					hasWorldbook: d.hasWorldbook,
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
