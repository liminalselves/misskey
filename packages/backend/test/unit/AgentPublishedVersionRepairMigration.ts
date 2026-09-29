/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { RepairAgentPublishedVersions1784100000000 } from '../../migration/1784100000000-RepairAgentPublishedVersions.js';

type QueryCall = { sql: string; params: unknown[] };

function createQueryRunner(characterRows: Record<string, unknown>[], styleRows: Record<string, unknown>[] = []) {
	const calls: QueryCall[] = [];
	const queryRunner = {
		query: jest.fn(async (sql: string, params: unknown[] = []) => {
			calls.push({ sql, params });
			if (sql.includes('SELECT "id"') && sql.includes('FROM "agent_character"')) return characterRows.map(row => ({ id: row.id }));
			if (sql.includes('SELECT "id"') && sql.includes('FROM "agent_dialogue_style"')) return styleRows.map(row => ({ id: row.id }));
			if (sql.includes('FROM "agent_character" m')) return characterRows.filter(row => row.id === params[1]);
			if (sql.includes('FROM "agent_dialogue_style" m')) return styleRows.filter(row => row.id === params[1]);
			return [];
		}),
	};
	return { calls, queryRunner };
}

describe('RepairAgentPublishedVersions migration', () => {
	test('re-reads locked rows and appends mismatched snapshots after the highest archived version', async () => {
		const { calls, queryRunner } = createQueryRunner([{
			id: 'character-id', userId: 'user-id', reviewStatus: 'published', isPublished: true,
			publishedVersion: 0, publishedSnapshot: { name: 'current character' },
			archivedSnapshot: { name: 'old character' }, archiveMatchesMain: false, maxVersion: 4,
		}]);

		await new RepairAgentPublishedVersions1784100000000().up(queryRunner as never);

		expect(calls[0]?.sql).toContain('SET LOCAL statement_timeout = 0');
		expect(calls.some(call => call.sql.includes('ORDER BY "id"') && call.sql.includes('FOR UPDATE'))).toBe(true);
		const insert = calls.find(call => call.sql.includes('INSERT INTO "agent_published_version"'));
		const update = calls.find(call => call.sql.includes('UPDATE "agent_character"') && call.sql.includes('"publishedVersion" = $1'));
		expect(insert?.params.slice(1)).toEqual(['character', 'character-id', 'user-id', 5, { name: 'current character' }]);
		expect(String(insert?.params[0])).toMatch(/^[0-9a-f]{32}$/);
		expect(update?.params).toEqual([5, { name: 'current character' }, 'character-id']);
		expect(calls.some(call => /UPDATE\s+"agent_published_version"/i.test(call.sql))).toBe(false);
		expect(calls.some(call => /DELETE\s+FROM\s+"agent_published_version"/i.test(call.sql))).toBe(false);
	});

	test('restores a missing main snapshot from the matching archive', async () => {
		const archived = { name: 'published character' };
		const { calls, queryRunner } = createQueryRunner([{
			id: 'character-id', userId: 'user-id', reviewStatus: 'draft', isPublished: false,
			publishedVersion: 3, publishedSnapshot: null,
			archivedSnapshot: archived, archiveMatchesMain: false, maxVersion: 3,
		}]);

		await new RepairAgentPublishedVersions1784100000000().up(queryRunner as never);

		expect(calls.some(call => call.sql.includes('INSERT INTO "agent_published_version"'))).toBe(false);
		const update = calls.find(call => call.sql.includes('UPDATE "agent_character"') && call.sql.includes('"publishedVersion" = $1'));
		expect(update?.params).toEqual([3, archived, 'character-id']);
	});

	test('clears orphaned snapshots and listing flags when no published version exists', async () => {
		const { calls, queryRunner } = createQueryRunner([{
			id: 'character-id', userId: 'user-id', reviewStatus: 'published', isPublished: true,
			publishedVersion: null, publishedSnapshot: { name: 'orphan' },
			archivedSnapshot: null, archiveMatchesMain: false, maxVersion: 2,
		}]);

		await new RepairAgentPublishedVersions1784100000000().up(queryRunner as never);

		const cleanup = calls.find(call => call.sql.includes('SET "publishedSnapshot" = NULL'));
		expect(cleanup?.params).toEqual(['character-id']);
		expect(calls.some(call => call.sql.includes('INSERT INTO "agent_published_version"'))).toBe(false);
	});

	test('stops instead of publishing draft fields when both snapshots are missing', async () => {
		const { queryRunner } = createQueryRunner([{
			id: 'character-id', userId: 'user-id', reviewStatus: 'published', isPublished: true,
			publishedVersion: 3, publishedSnapshot: null,
			archivedSnapshot: null, archiveMatchesMain: false, maxVersion: 2,
		}]);

		await expect(new RepairAgentPublishedVersions1784100000000().up(queryRunner as never))
			.rejects.toThrow('published version 3 has no snapshot');
	});

	test('does not rewrite a healthy published version', async () => {
		const snapshot = { name: 'healthy character' };
		const { calls, queryRunner } = createQueryRunner([{
			id: 'character-id', userId: 'user-id', reviewStatus: 'published', isPublished: true,
			publishedVersion: 2, publishedSnapshot: snapshot,
			archivedSnapshot: snapshot, archiveMatchesMain: true, maxVersion: 2,
		}]);

		await new RepairAgentPublishedVersions1784100000000().up(queryRunner as never);

		expect(calls.some(call => call.sql.includes('INSERT INTO "agent_published_version"'))).toBe(false);
		const update = calls.find(call => call.sql.includes('UPDATE "agent_character"') && call.sql.includes('"publishedVersion" = $1'));
		expect(update?.params).toEqual([2, snapshot, 'character-id']);
	});
});
