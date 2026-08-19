/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { AgentCharactersRepository, AgentDialogueStylesRepository, AgentMessagesRepository, AgentPlazaReviewsRepository, AgentSessionsRepository, UsersRepository } from '@/models/_.js';
import type { MiAgentCharacter } from '@/models/AgentCharacter.js';
import type { MiAgentDialogueStyle } from '@/models/AgentDialogueStyle.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import {
	batchPlazaRatingsByCharacterIds,
	batchPlazaRatingsByStyleIds,
	batchCommunitySessionCountByCharacterIds,
	batchCommunitySessionCountByStyleIds,
	batchCommunityAssistantReplyCountByCharacterIds,
	batchCommunityAssistantReplyCountByStyleIds,
} from '@/core/agent-plaza-display-stats.js';

function escapeIlikePattern(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
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
		type: 'object',
		optional: false, nullable: false,
		properties: {
			characters: {
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
			styles: {
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
		},
		required: ['characters', 'styles'],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string', minLength: 1, maxLength: 200 },
		limit: { type: 'integer', minimum: 1, maximum: 60, default: 30 },
	},
	required: ['query'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

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

		private agentService: AgentService,
		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const limit = ps.limit ?? 30;
			const keywords = ps.query.trim().split(/\s+/).filter(k => k.length > 0).slice(0, 10);
			if (keywords.length === 0) return { characters: [], styles: [] };

			// --- Search characters ---
			const charScores = await this.searchCharacters(keywords, limit);
			// --- Search styles ---
			const styleScores = await this.searchStyles(keywords, limit);

			// Collect all user IDs needed
			const allUserIds = [...new Set([
				...charScores.map(r => r.userId),
				...styleScores.map(r => r.userId),
			])];
			const users = allUserIds.length > 0 ? await this.usersRepository.findBy({ id: In(allUserIds) }) : [];
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));

			// Pack characters
			const charIds = charScores.map(r => r.id);
			let charRows: MiAgentCharacter[] = [];
			if (charIds.length > 0) {
				charRows = await this.agentCharactersRepository.findBy({ id: In(charIds) });
			}
			const charRowById = new Map(charRows.map(r => [r.id, r]));

			const avatarIds = [...new Set(charRows.map(r => r.avatarFileId).filter((id): id is string => id != null))];
			const avatarMap = avatarIds.length > 0
				? await this.driveFileEntityService.packManyByIdsMap(avatarIds, {})
				: new Map();

			const [charRatings, charConvs, charAiReplies] = charIds.length > 0
				? await Promise.all([
					batchPlazaRatingsByCharacterIds(this.agentPlazaReviewsRepository, charIds),
					batchCommunitySessionCountByCharacterIds(this.agentSessionsRepository, charIds),
					batchCommunityAssistantReplyCountByCharacterIds(this.agentMessagesRepository, charIds),
				])
				: [new Map(), new Map(), new Map()];

			const characters = charScores.map(({ id }) => {
				const r = charRowById.get(id)!;
				const d = this.agentService.characterPlazaDisplayFields(r);
				const avatarId = d.avatarFileId;
				const agg = charRatings.get(id) ?? { average: null, count: 0 };
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
					conversationCount: charConvs.get(id) ?? 0,
					aiReplyCount: charAiReplies.get(id) ?? 0,
				};
			}).filter(c => c.user != null);

			// Pack styles
			const styleIds = styleScores.map(r => r.id);
			let styleRows: MiAgentDialogueStyle[] = [];
			if (styleIds.length > 0) {
				styleRows = await this.agentDialogueStylesRepository.findBy({ id: In(styleIds) });
			}
			const styleRowById = new Map(styleRows.map(r => [r.id, r]));

			const [styleRatings, styleConvs, styleAiReplies] = styleIds.length > 0
				? await Promise.all([
					batchPlazaRatingsByStyleIds(this.agentPlazaReviewsRepository, styleIds),
					batchCommunitySessionCountByStyleIds(this.agentSessionsRepository, styleIds),
					batchCommunityAssistantReplyCountByStyleIds(this.agentMessagesRepository, styleIds),
				])
				: [new Map(), new Map(), new Map()];

			const styles = styleScores.map(({ id }) => {
				const r = styleRowById.get(id)!;
				const d = this.agentService.stylePlazaDisplayFields(r);
				const agg = styleRatings.get(id) ?? { average: null, count: 0 };
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
					conversationCount: styleConvs.get(id) ?? 0,
					aiReplyCount: styleAiReplies.get(id) ?? 0,
				};
			}).filter(s => s.user != null);

			return { characters, styles };
		});
	}

	/**
	 * Search published characters by keywords.
	 * Scoring: name match = 10 per keyword, summary match = 5, author name/username match = 3.
	 * All keywords must produce at least one match for a result to appear (AND logic).
	 */
	private async searchCharacters(keywords: string[], limit: number): Promise<{ id: string; userId: string; score: number }[]> {
		// Build a query that joins users for author search
		const qb = this.agentCharactersRepository.createQueryBuilder('c')
			.innerJoin('c.user', 'u')
			.where('c.isPublished = true')
			.andWhere('c.moderationBanned = false')
			.select('c.id', 'id')
			.addSelect('c.userId', 'userId');

		// For each keyword, add a condition group (AND between keywords)
		const params: Record<string, string> = {};
		let scoreExpr = '0';

		for (let i = 0; i < keywords.length; i++) {
			const pName = `kw${i}`;
			params[pName] = `%${escapeIlikePattern(keywords[i])}%`;
			// Each keyword must match at least one field
			qb.andWhere(
				`(c.name ILIKE :${pName} ESCAPE '\\' OR c.summary ILIKE :${pName} ESCAPE '\\' OR u.name ILIKE :${pName} ESCAPE '\\' OR u.username ILIKE :${pName} ESCAPE '\\')`,
			);
			// Accumulate score
			scoreExpr += ` + (CASE WHEN c.name ILIKE :${pName} ESCAPE '\\' THEN 10 ELSE 0 END)`;
			scoreExpr += ` + (CASE WHEN c.summary ILIKE :${pName} ESCAPE '\\' THEN 5 ELSE 0 END)`;
			scoreExpr += ` + (CASE WHEN u.name ILIKE :${pName} ESCAPE '\\' OR u.username ILIKE :${pName} ESCAPE '\\' THEN 3 ELSE 0 END)`;
		}

		qb.addSelect(scoreExpr, 'score')
			.setParameters(params)
			.orderBy('score', 'DESC')
			.addOrderBy('c.updatedAt', 'DESC')
			.limit(limit);

		const raw = await qb.getRawMany<{ id: string; userId: string; score: string | number }>();
		return raw.map(r => ({
			id: r.id,
			userId: r.userId,
			score: typeof r.score === 'string' ? Number(r.score) : (r.score ?? 0),
		}));
	}

	/**
	 * Search published styles by keywords.
	 * Scoring: name match = 10 per keyword, summary match = 5, author name/username match = 3.
	 */
	private async searchStyles(keywords: string[], limit: number): Promise<{ id: string; userId: string; score: number }[]> {
		const qb = this.agentDialogueStylesRepository.createQueryBuilder('s')
			.innerJoin('s.user', 'u')
			.where('s.isPublished = true')
			.select('s.id', 'id')
			.addSelect('s.userId', 'userId');

		const params: Record<string, string> = {};
		let scoreExpr = '0';

		for (let i = 0; i < keywords.length; i++) {
			const pName = `kw${i}`;
			params[pName] = `%${escapeIlikePattern(keywords[i])}%`;
			qb.andWhere(
				`(s.name ILIKE :${pName} ESCAPE '\\' OR s.summary ILIKE :${pName} ESCAPE '\\' OR u.name ILIKE :${pName} ESCAPE '\\' OR u.username ILIKE :${pName} ESCAPE '\\')`,
			);
			scoreExpr += ` + (CASE WHEN s.name ILIKE :${pName} ESCAPE '\\' THEN 10 ELSE 0 END)`;
			scoreExpr += ` + (CASE WHEN s.summary ILIKE :${pName} ESCAPE '\\' THEN 5 ELSE 0 END)`;
			scoreExpr += ` + (CASE WHEN u.name ILIKE :${pName} ESCAPE '\\' OR u.username ILIKE :${pName} ESCAPE '\\' THEN 3 ELSE 0 END)`;
		}

		qb.addSelect(scoreExpr, 'score')
			.setParameters(params)
			.orderBy('score', 'DESC')
			.addOrderBy('s.updatedAt', 'DESC')
			.limit(limit);

		const raw = await qb.getRawMany<{ id: string; userId: string; score: string | number }>();
		return raw.map(r => ({
			id: r.id,
			userId: r.userId,
			score: typeof r.score === 'string' ? Number(r.score) : (r.score ?? 0),
		}));
	}
}
