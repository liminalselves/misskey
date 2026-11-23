/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { describe, expect, test, vi } from 'vitest';
import { AgentService } from '@/core/AgentService.js';
import PlazaSearch from '@/server/api/endpoints/agents/plaza-search.js';

describe('agents/plaza-search publishedSnapshot handling', () => {
	test('collects avatarIds from publishedSnapshot and searches/scores COALESCE snapshot name & summary', async () => {
		const charWhereClauses: string[] = [];
		const charAddSelects: Array<[string, string | undefined]> = [];

		const createCharQb = () => {
			const qb: Record<string, unknown> = {
				innerJoin: () => qb,
				where: () => qb,
				andWhere: (sql: string) => {
					charWhereClauses.push(sql);
					return qb;
				},
				select: () => qb,
				addSelect: (expr: string, alias?: string) => {
					charAddSelects.push([expr, alias]);
					return qb;
				},
				setParameters: () => qb,
				orderBy: () => qb,
				addOrderBy: () => qb,
				limit: () => qb,
				getRawMany: vi.fn(async () => [{ id: 'char1', userId: 'author1', score: '15' }]),
			};
			return qb;
		};

		const createEmptyRawQb = () => {
			const qb: Record<string, unknown> = {
				innerJoin: () => qb,
				where: () => qb,
				andWhere: () => qb,
				select: () => qb,
				addSelect: () => qb,
				groupBy: () => qb,
				setParameters: () => qb,
				orderBy: () => qb,
				addOrderBy: () => qb,
				limit: () => qb,
				getRawMany: vi.fn(async () => []),
			};
			return qb;
		};

		const publishedAvatar = { id: 'pub-avatar-id', url: 'https://example.com/pub.png' };
		const draftAvatar = { id: 'draft-avatar-id', url: 'https://example.com/draft.png' };
		const packManyByIdsMap = vi.fn(async (ids: string[]) => {
			const map = new Map<string, unknown>();
			for (const id of ids) {
				if (id === 'pub-avatar-id') map.set(id, publishedAvatar);
				if (id === 'draft-avatar-id') map.set(id, draftAvatar);
			}
			return map;
		});

		const publishedCharacter = {
			id: 'char1',
			userId: 'author1',
			name: 'Draft Name',
			summary: 'Draft Summary',
			avatarFileId: 'draft-avatar-id',
			worldbook: [],
			createdAt: new Date('2026-10-01T00:00:00.000Z'),
			updatedAt: new Date('2026-10-02T00:00:00.000Z'),
			publishedVersion: 2,
			publishedSnapshot: {
				name: 'Published Name',
				summary: 'Published Summary',
				personality: 'p',
				background: 'b',
				speakingStyle: 's',
				greeting: 'g',
				exampleDialogue: '',
				forbiddenBehavior: '',
				avatarFileId: 'pub-avatar-id',
				worldbook: [{
					id: 'wb1',
					title: 'Lore',
					content: 'World detail',
					keywords: ['lore'],
					triggerMode: 'keyword',
					priority: 1,
					enabled: true,
					revision: 1,
				}],
				regexRules: [],
				rules: [],
				stickers: [],
				draftRevision: 2,
			},
		};

		const realAgent = Object.create(AgentService.prototype) as AgentService;
		const agentService = {
			assertAgentsEnabled: vi.fn(),
			characterPlazaDisplayFields: realAgent.characterPlazaDisplayFields,
			stylePlazaDisplayFields: realAgent.stylePlazaDisplayFields,
		} as unknown as AgentService;

		const endpoint = new PlazaSearch(
			{
				createQueryBuilder: createCharQb,
				findBy: vi.fn(async () => [publishedCharacter]),
			} as never,
			{ createQueryBuilder: createEmptyRawQb, findBy: vi.fn(async () => []) } as never,
			{ findBy: vi.fn(async () => [{ id: 'author1' }]) } as never,
			{ createQueryBuilder: createEmptyRawQb } as never,
			{ createQueryBuilder: createEmptyRawQb } as never,
			{ createQueryBuilder: createEmptyRawQb } as never,
			agentService,
			{ packMany: vi.fn(async () => [{ id: 'author1', username: 'author' }]) } as never,
			{ packManyByIdsMap } as never,
		);

		const result = await endpoint.exec({ query: 'Published' }, { id: 'viewer1' } as never, null);

		expect(packManyByIdsMap).toHaveBeenCalledWith(['pub-avatar-id'], {});
		expect(result.characters).toHaveLength(1);
		expect(result.characters[0]).toMatchObject({
			id: 'char1',
			name: 'Published Name',
			summary: 'Published Summary',
			hasWorldbook: true,
			avatar: publishedAvatar,
		});

		expect(charWhereClauses.some(sql =>
			sql.includes(`COALESCE(c."publishedSnapshot"->>'name', c.name) ILIKE`)
			&& sql.includes(`COALESCE(c."publishedSnapshot"->>'summary', c.summary) ILIKE`),
		)).toBe(true);
		const scoreExpr = charAddSelects.find(([, alias]) => alias === 'score')?.[0] ?? '';
		expect(scoreExpr).toContain(`COALESCE(c."publishedSnapshot"->>'name', c.name) ILIKE`);
		expect(scoreExpr).toContain(`COALESCE(c."publishedSnapshot"->>'summary', c.summary) ILIKE`);
	});
});
