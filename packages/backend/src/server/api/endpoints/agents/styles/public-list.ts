/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { AgentDialogueStylesRepository, AgentMessagesRepository, AgentPlazaReviewsRepository, AgentSessionsRepository, UsersRepository } from '@/models/_.js';
import type { MiAgentDialogueStyle } from '@/models/AgentDialogueStyle.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { AgentService } from '@/core/AgentService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import {
	batchPlazaRatingsByStyleIds,
	batchCommunitySessionCountByStyleIds,
	batchCommunityAssistantReplyCountByStyleIds,
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

function previewBody(body: string, max = 200): string {
	const t = body.replace(/\s+/g, ' ').trim();
	if (t.length <= max) return t;
	return `${t.slice(0, max)}…`;
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
				bodyPreview: { type: 'string' },
				createdAt: { type: 'string', format: 'date-time' },
				updatedAt: { type: 'string', format: 'date-time' },
				publishedVersion: { type: 'integer', nullable: true },
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
		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

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
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const limit = ps.limit ?? 30;
			const sort = ps.sort ?? 'recommended';

			let q = this.agentDialogueStylesRepository.createQueryBuilder('s')
				.where('s.isPublished = true')
				.select(['s.id', 's.userId', 's.name', 's.body', 's.summary', 's.publishedSnapshot', 's.publishedVersion', 's.createdAt', 's.updatedAt']);

			if (sort === 'latest') {
				q = q.orderBy('s.updatedAt', 'DESC').addOrderBy('s.id', 'DESC');
				if (ps.sinceId || ps.untilId) {
					q = this.queryService.makePaginationQuery(q, ps.sinceId ?? null, ps.untilId ?? null);
				} else {
					q = q.offset(ps.offset ?? 0);
				}
			} else {
				const styleKeyExpr = 'COALESCE(ss.plazaStatsDialogueStyleId, ss.dialogueStyleId)';
				q = q
					.leftJoin(qb => qb
						.select('r.styleId', 'style_id')
						.addSelect('AVG(r.stars)', 'avg')
						.addSelect('COUNT(*)', 'cnt')
						.from('agent_plaza_review', 'r')
						.where('r.styleId IS NOT NULL')
						.groupBy('r.styleId'), 'rt', 'rt.style_id = s.id')
					.leftJoin(qb => qb
						.select(styleKeyExpr, 'style_key')
						.addSelect('COUNT(*)', 'cnt')
						.from('agent_session', 'ss')
						.where('ss.sessionKind = :kind', { kind: 'community' })
						.andWhere(`${styleKeyExpr} IS NOT NULL`)
						.groupBy(styleKeyExpr), 'ct', 'ct.style_key = s.id')
					.addSelect('COALESCE(ct.cnt, 0)', 'conv_count')
					.addSelect('COALESCE(rt.avg, 0)', 'rating_avg')
					.addSelect('COALESCE(rt.cnt, 0)', 'rating_cnt')
					.offset(ps.offset ?? 0);

				if (sort === 'heat') {
					q = q.orderBy('conv_count', 'DESC').addOrderBy('s.updatedAt', 'DESC').addOrderBy('s.id', 'DESC');
				} else if (sort === 'rating') {
					q = q.orderBy('rating_avg', 'DESC').addOrderBy('rating_cnt', 'DESC').addOrderBy('s.updatedAt', 'DESC').addOrderBy('s.id', 'DESC');
				} else {
					const scoreExpr = [
						`((COALESCE(rt.avg, 0) * COALESCE(rt.cnt, 0) + 3.5 * 5) / (COALESCE(rt.cnt, 0) + 5)) * 10`,
						`LN(1 + COALESCE(ct.cnt, 0)) * 2`,
						`(1 / (1 + (EXTRACT(EPOCH FROM (NOW() - s.updatedAt)) / 86400))) * 1`,
					].join(' + ');

					const candidateLimit = 1200;
					const raw = await q
						.addSelect(`(${scoreExpr})`, 'recommended_score')
						.orderBy('recommended_score', 'DESC')
						.addOrderBy('s.id', 'DESC')
						.offset(0)
						.limit(candidateLimit)
						.getRawMany<{ s_id: string; recommended_score: string | number }>();

					const exclude = new Set(ps.excludeIds ?? []);
					const candidates = raw
						.map(r => ({ id: r.s_id, score: typeof r.recommended_score === 'string' ? Number(r.recommended_score) : (r.recommended_score ?? 0) }))
						.filter(x => !exclude.has(x.id));

					if (candidates.length === 0) return [];
					const picked = weightedRandomSample(candidates, Math.min(limit, candidates.length));
					const pickedIds = picked.map(x => x.id);

					const pickedRows = await this.agentDialogueStylesRepository.createQueryBuilder('s')
						.where('s.isPublished = true')
						.andWhere('s.id IN (:...ids)', { ids: pickedIds })
						.select(['s.id', 's.userId', 's.name', 's.body', 's.summary', 's.publishedSnapshot', 's.publishedVersion', 's.createdAt', 's.updatedAt'])
						.getMany();

					const rowById = new Map(pickedRows.map(r => [r.id, r]));
					const rows = pickedIds.map(id => rowById.get(id)).filter((r): r is typeof pickedRows[number] => r != null);
					if (rows.length === 0) return [];

					const userIds = [...new Set(rows.map(r => r.userId))];
					const users = await this.usersRepository.findBy({ id: In(userIds) });
					const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
					const userById = new Map(packedUsers.map(u => [u.id, u]));

					const styleIds = rows.map(r => r.id);
					const [ratings, convs, aiReplies] = await Promise.all([
						batchPlazaRatingsByStyleIds(this.agentPlazaReviewsRepository, styleIds),
						batchCommunitySessionCountByStyleIds(this.agentSessionsRepository, styleIds),
						batchCommunityAssistantReplyCountByStyleIds(this.agentMessagesRepository, styleIds),
					]);

					return rows.map(r => {
						const d = this.agentService.stylePlazaDisplayFields(r as MiAgentDialogueStyle);
						const agg = ratings.get(r.id) ?? { average: null, count: 0 };
						return {
							id: r.id,
							userId: r.userId,
							name: d.name,
							summary: d.summary,
							bodyPreview: previewBody(d.body),
							createdAt: r.createdAt.toISOString(),
							updatedAt: r.updatedAt.toISOString(),
							publishedVersion: r.publishedVersion,
							user: userById.get(r.userId)!,
							rating: { average: agg.average, count: agg.count },
							conversationCount: convs.get(r.id) ?? 0,
							aiReplyCount: aiReplies.get(r.id) ?? 0,
						};
					});
				}
			}

			if (sort !== 'recommended') q = q.limit(limit);

			const rows = await q.getMany();
			if (rows.length === 0) return [];

			const userIds = [...new Set(rows.map(r => r.userId))];
			const users = await this.usersRepository.findBy({ id: In(userIds) });
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));

			const styleIds = rows.map(r => r.id);
			const [ratings, convs, aiReplies] = await Promise.all([
				batchPlazaRatingsByStyleIds(this.agentPlazaReviewsRepository, styleIds),
				batchCommunitySessionCountByStyleIds(this.agentSessionsRepository, styleIds),
				batchCommunityAssistantReplyCountByStyleIds(this.agentMessagesRepository, styleIds),
			]);

			return rows.map(r => {
				const d = this.agentService.stylePlazaDisplayFields(r as MiAgentDialogueStyle);
				const agg = ratings.get(r.id) ?? { average: null, count: 0 };
				return {
					id: r.id,
					userId: r.userId,
					name: d.name,
					summary: d.summary,
					bodyPreview: previewBody(d.body),
					createdAt: r.createdAt.toISOString(),
					updatedAt: r.updatedAt.toISOString(),
					publishedVersion: r.publishedVersion,
					user: userById.get(r.userId)!,
					rating: { average: agg.average, count: agg.count },
					conversationCount: convs.get(r.id) ?? 0,
					aiReplyCount: aiReplies.get(r.id) ?? 0,
				};
			});
		});
	}
}
