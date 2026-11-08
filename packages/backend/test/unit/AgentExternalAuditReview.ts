/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import { DataSource, EntitySchema, In, IsNull, LessThanOrEqual } from 'typeorm';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { MiAgentReviewTriggerRule } from '@/models/Meta.js';

vi.mock('@/core/AgentService.js', () => ({ AgentService: class {} }));
vi.mock('@/core/entities/UserEntityService.js', () => ({ UserEntityService: class {} }));
vi.mock('@/core/MetaService.js', () => ({ MetaService: class {} }));
vi.mock('@/core/ModerationLogService.js', () => ({ ModerationLogService: class {} }));
vi.mock('@/core/NotificationService.js', () => ({ NotificationService: class {} }));
vi.mock('@/core/UserSuspendService.js', () => ({ UserSuspendService: class {} }));
vi.mock('@/core/RoleService.js', () => ({ RoleService: class {} }));

const { default: ReviewList } = await import('@/server/api/endpoints/admin/agents/governance/external-audit/review-list.js');
const { default: QuickAction } = await import('@/server/api/endpoints/admin/agents/governance/quick-action.js');
const { default: ReviewIgnore } = await import('@/server/api/endpoints/admin/agents/governance/external-audit/review-ignore.js');

const rules: MiAgentReviewTriggerRule[] = [
	{ id: 'hour', timeWindowMinutes: 60, blockThreshold: 3, enabled: true },
	{ id: 'day', timeWindowMinutes: 1440, blockThreshold: 5, enabled: true },
];
const moderator = { id: 'moderator' };

class OfflineDataSource extends DataSource {
	public prepareMetadata() {
		return this.buildMetadatas();
	}
}

async function harness(triggerRules = rules) {
	const source = new OfflineDataSource({
		type: 'postgres',
		entities: [new EntitySchema({
			name: 'AuditLog',
			tableName: 'agent_external_audit_log',
			columns: {
				id: { type: String, primary: true },
				userId: { type: String, nullable: true },
				sessionId: { type: String, nullable: true },
				status: { type: String },
				createdAt: { type: Date },
				reviewIgnoredAt: { type: Date, nullable: true },
			},
		})],
	});
	await source.prepareMetadata();
	const repository = source.getRepository('AuditLog');
	const queries: { sql: string; parameters: unknown[] }[] = [];
	const details: { sql: string; parameters: unknown[] }[] = [];
	const counts = new Map([['hour', 3], ['day', 3]]);
	const logs = ['2026-10-30T00:12:00+08:00', '2026-10-30T00:24:00+08:00', '2026-10-30T00:26:00+08:00'].map((date, i) => ({
		id: `log${i}`, userId: 'owner', sessionId: null, createdAt: new Date(date),
		status: 'block', reviewIgnoredAt: null, session: null, character: null,
	}));
	const buildQuery = (qb: ReturnType<typeof repository.createQueryBuilder>) => {
		vi.spyOn(qb, 'getRawMany').mockImplementation(async () => {
			const [sql, parameters] = qb.getQueryAndParameters();
			queries.push({ sql, parameters });
			if (sql.includes('MAX("log"."createdAt")')) {
				return [{ userId: 'owner', sessionId: null, blockCount: '3', latestBlockAt: logs[2].createdAt, reviewUntilId: 'log2' }];
			}
			const window = qb.getParameters().timeWindowMinutes as number;
			const rule = triggerRules.find(r => r.timeWindowMinutes === window);
			const count = counts.get(rule?.id ?? '') ?? 0;
			return count > 0 ? [{ userId: 'owner', blockCount: String(count) }] : [];
		});
		vi.spyOn(qb, 'leftJoinAndSelect').mockReturnValue(qb);
		vi.spyOn(qb, 'getMany').mockImplementation(async () => {
			const [sql, parameters] = qb.getQueryAndParameters();
			details.push({ sql, parameters });
			return logs;
		});
		return qb;
	};
	const auditLogs = {
		createQueryBuilder: vi.fn((alias?: string) => buildQuery(repository.createQueryBuilder(alias))),
		manager: { createQueryBuilder: vi.fn(() => buildQuery(source.manager.createQueryBuilder())) },
	};
	const users = { findOne: vi.fn().mockResolvedValue({ id: 'owner' }), findBy: vi.fn().mockResolvedValue([{ id: 'owner', isSuspended: false }]) };
	const endpoint = new ReviewList(
		auditLogs as never,
		users as never,
		{ findBy: vi.fn().mockResolvedValue([]) } as never,
		{ findBy: vi.fn().mockResolvedValue([]) } as never,
		{ assertAgentsEnabled: vi.fn() } as never,
		{ packMany: vi.fn().mockResolvedValue([{ id: 'owner', username: '2937163793' }]) } as never,
		{ fetch: vi.fn().mockResolvedValue({ agentReviewTriggerRules: triggerRules }) } as never,
	);
	return { endpoint, queries, details, counts, logs, auditLogs };
}

afterEach(() => vi.useRealTimers());

describe('external audit review eligibility', () => {
	test('includes the three blocks shown in the report and matches only the hourly rule', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-30T00:28:00+08:00') });
		const h = await harness();
		const rows = await h.endpoint.exec({}, moderator as never, null);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ userId: 'owner', blockCount: 3, reviewUntilId: 'log2', triggeredRules: [{ id: 'hour', timeWindowMinutes: 60, blockThreshold: 3 }] });
		expect(rows[0].logs.map((l: { id: string }) => l.id)).toEqual(['log0', 'log1', 'log2']);
	});

	test('caps evidence details at 50 per user in one query while blockCount keeps the full total', async () => {
		const h = await harness();
		await h.endpoint.exec({}, moderator as never, null);
		expect(h.details).toHaveLength(1);
		expect(h.queries.find(q => q.sql.includes('AS "reviewUntilId"'))!.sql).toContain('MAX("log"."id") AS "reviewUntilId"');
		// Run the emitted ranking subquery itself to prove the cap is per user, not global.
		const detail = h.details[0];
		const ranked = detail.sql.match(/IN \(\s*(SELECT "ranked"\."id"[\s\S]*"ranked"\."rank" <= \$\d+)\s*\)/)![1];
		const parameters = Object.fromEntries(detail.parameters.map((value, i) => [`$${i + 1}`, value as SQLInputValue]));
		const used = new Set([...ranked.matchAll(/\$\d+/g)].map(m => m[0]));
		const db = new DatabaseSync(':memory:');
		try {
			db.exec('CREATE TABLE agent_external_audit_log (id TEXT, userId TEXT, createdAt INTEGER, status TEXT, reviewIgnoredAt INTEGER, sessionId TEXT)');
			const insert = db.prepare('INSERT INTO agent_external_audit_log VALUES (?, ?, ?, ?, ?, NULL)');
			// The second, newer user would take every slot under a global rank, so this pins PARTITION BY userId.
			for (let i = 0; i < 80; i++) insert.run(`a${String(i).padStart(3, '0')}`, 'owner', i, 'block', null);
			for (let i = 0; i < 60; i++) insert.run(`z${String(i).padStart(3, '0')}`, 'peer', 1000 + i, 'block', null);
			insert.run('b000', 'owner', 200, 'block', 1);
			insert.run('c000', 'owner', 201, 'allow', null);
			const userParam = Object.entries(parameters).find(([, value]) => value === 'owner')![0];
			const twoUsers = ranked.replace(`IN (${userParam})`, `IN (${userParam}, $peer)`);
			expect(twoUsers).not.toBe(ranked);
			const bound = { ...Object.fromEntries(Object.entries(parameters).filter(([k]) => used.has(k))), $peer: 'peer' };
			const rows = db.prepare(twoUsers).all(bound).map(row => String(row.id));
			const owner = rows.filter(id => id.startsWith('a'));
			const peer = rows.filter(id => id.startsWith('z'));
			expect(owner).toHaveLength(50);
			expect(peer).toHaveLength(50);
			expect(owner).toContain('a079');
			expect(owner).not.toContain('a029');
			expect(rows).not.toContain('b000');
			expect(rows).not.toContain('c000');
		} finally {
			db.close();
		}
	});

	test('groups the page query and detail ranking by user and session', async () => {
		const h = await harness();
		const rows = await h.endpoint.exec({}, moderator as never, null);
		expect(h.queries.find(q => q.sql.includes('MAX("log"."createdAt")'))!.sql).toMatch(/GROUP BY "log"\."userId", "log"\."sessionId"/);
		expect(h.details[0].sql).toContain('PARTITION BY "l"."userId", "l"."sessionId"');
		expect(rows[0]).toMatchObject({ userId: 'owner', sessionId: null, userReviewUntilId: 'log2' });
	});

	test('keeps a triggered review and its evidence after every configured window expires', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-31T10:00:00+08:00') });
		const h = await harness();
		const rows = await h.endpoint.exec({}, moderator as never, null);
		expect(rows).toHaveLength(1);
		expect(rows[0].logs).toHaveLength(3);
		expect(h.queries.every(q => q.parameters.every(p => !(p instanceof Date)))).toBe(true);
	});

	test('uses a historical sliding window, not the lifetime total or the current clock', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-30T00:28:00+08:00') });
		const h = await harness();
		await h.endpoint.exec({}, moderator as never, null);
		for (const [i, rule] of rules.entries()) {
			const query = h.queries[i];
			expect(query.sql).toMatch(/MAX\(.+"blockCount"\)/);
			expect(query.sql).toMatch(/COUNT\(\*\) OVER \(PARTITION BY .+"userId" ORDER BY .+"createdAt"\s+RANGE BETWEEN/);
			expect(query.sql).toContain("INTERVAL '1 minute'");
			expect(query.sql).toContain('PRECEDING AND CURRENT ROW');
			expect(query.sql).toContain('"reviewIgnoredAt" IS NULL');
			expect(query.parameters).toContain(rule.timeWindowMinutes);
		}
	});

	test('treats an omitted enabled flag exactly like the settings page', async () => {
		const { enabled: _, ...rule } = rules[0];
		const h = await harness([rule as MiAgentReviewTriggerRule]);
		const rows = await h.endpoint.exec({}, moderator as never, null);
		expect(rows).toHaveLength(1);
	});

	test('does not qualify a user whose separate window counts stay below every threshold', async () => {
		const h = await harness();
		h.counts.set('hour', 2);
		h.counts.set('day', 4);
		expect(await h.endpoint.exec({}, moderator as never, null)).toEqual([]);
	});

	test('allows either rule to trigger independently', async () => {
		const h = await harness();
		h.counts.set('hour', 1);
		h.counts.set('day', 5);
		const rows = await h.endpoint.exec({}, moderator as never, null);
		expect(rows[0].triggeredRules).toEqual([{ id: 'day', timeWindowMinutes: 1440, blockThreshold: 5 }]);
	});

	test('returns no candidates when all rules are explicitly disabled', async () => {
		const h = await harness(rules.map(r => ({ ...r, enabled: false })));
		expect(await h.endpoint.exec({}, moderator as never, null)).toEqual([]);
		expect(h.auditLogs.createQueryBuilder).not.toHaveBeenCalled();
	});

	test('applies user and reviewed-state filtering before pagination without silently hiding banned evidence', async () => {
		const h = await harness();
		await h.endpoint.exec({ userId: '2937163793', limit: 31, offset: 30 }, moderator as never, null);
		expect(h.queries[0].parameters).toContain('owner');
		const page = h.queries[2];
		expect(page.sql).not.toContain('"isSuspended" = true');
		expect(page.sql).toContain('"reviewIgnoredAt" IS NULL');
		expect(page.sql).not.toContain('"moderationBanned", false) = false');
		expect(page.sql).toContain('LIMIT 31 OFFSET 30');
		expect(page.parameters.every(p => !(p instanceof Date))).toBe(true);
	});

	test('executes the emitted sliding-window SQL against independent in-memory fixtures', async () => {
		const h = await harness();
		await h.endpoint.exec({}, moderator as never, null);
		const query = h.queries[0];
		// SQLite stores timestamps as milliseconds; keep the emitted query, replacing only interval syntax.
		const sql = query.sql.replace("INTERVAL '1 minute'", '60000');
		const parameters = Object.fromEntries(query.parameters.map((value, i) => [`$${i + 1}`, value as SQLInputValue]));
		const db = new DatabaseSync(':memory:');
		try {
			db.exec('CREATE TABLE agent_external_audit_log (userId TEXT, createdAt INTEGER, status TEXT, reviewIgnoredAt INTEGER)');
			const insert = db.prepare('INSERT INTO agent_external_audit_log VALUES (?, ?, ?, ?)');
			const add = (user: string, minutes: number[], status = 'block', reviewed = false) => {
				for (const minute of minutes) insert.run(user, minute * 60000, status, reviewed ? 1 : null);
			};
			add('screenshot', [12, 24, 26]);
			add('spread', [0, 61, 122]);
			add('reviewed', [12, 24, 26], 'block', true);
			add('failed', [12, 24, 26], 'failed');
			add('allowed', [12, 24, 26], 'allow');
			add('same-time', [12, 12, 12]);
			const counts = new Map(db.prepare(sql).all(parameters).map(row => [row.userId, Number(row.blockCount)]));
			expect(counts.get('screenshot')).toBe(3);
			expect(counts.get('same-time')).toBe(3);
			expect(counts.get('spread')).toBe(1);
			expect(counts.has('reviewed')).toBe(false);
			expect(counts.has('failed')).toBe(false);
			expect(counts.has('allowed')).toBe(false);
		} finally {
			db.close();
		}
	});

	test('evaluates rules independently even when their stored IDs are duplicated', async () => {
		const h = await harness([rules[0], { ...rules[1], id: rules[0].id }]);
		const rows = await h.endpoint.exec({}, moderator as never, null);
		expect(rows[0].triggeredRules).toEqual([{ id: 'hour', timeWindowMinutes: 60, blockThreshold: 3 }]);
	});
});

type Evidence = { id: string; sessionId: string; status: string; reviewIgnoredAt: Date | null };

// Evaluates the TypeORM where object against in-memory rows, honouring the operators these endpoints use.
function matches(log: Evidence & { userId: string }, where: Record<string, unknown>) {
	return Object.entries(where).every(([key, condition]) => {
		const value = (log as Record<string, unknown>)[key];
		if (condition instanceof Object && 'type' in condition) {
			const op = condition as { type: string; value: unknown };
			if (op.type === 'isNull') return value == null;
			if (op.type === 'in') return (op.value as unknown[]).includes(value);
			if (op.type === 'lessThanOrEqual') return String(value) <= String(op.value);
			throw new Error(`unsupported operator ${op.type}`);
		}
		return value === condition;
	});
}

function actionHarness() {
	const events: string[] = [];
	const evidence: (Evidence & { userId: string })[] = [
		{ id: 'log1', userId: 'owner', sessionId: 'selected', status: 'block', reviewIgnoredAt: null },
		{ id: 'log2', userId: 'owner', sessionId: 'other', status: 'block', reviewIgnoredAt: null },
	];
	const query = {
		update: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(),
		execute: vi.fn(async () => {
			events.push('ban');
			evidence.push({ id: 'log3', userId: 'owner', sessionId: 'selected', status: 'block', reviewIgnoredAt: null });
		}),
	};
	const auditLogs = {
		findOne: vi.fn(async (options: { where: Record<string, unknown> }) => {
			events.push('bound');
			return evidence.filter(log => matches(log, options.where)).sort((a, b) => b.id.localeCompare(a.id))[0] ?? null;
		}),
		update: vi.fn(async (where: Record<string, unknown>, values: { reviewIgnoredAt: Date }) => {
			events.push('reviewed');
			for (const log of evidence) if (matches(log, where)) log.reviewIgnoredAt = values.reviewIgnoredAt;
		}),
	};
	const users = {
		findOneBy: vi.fn().mockResolvedValue({ id: 'owner', isSuspended: false }),
		findOne: vi.fn().mockResolvedValue({ username: 'owner', host: null }),
	};
	const endpoint = new QuickAction(
		{ findBy: vi.fn().mockResolvedValue([{ id: 'selected', userId: 'owner', moderationBanned: false }]), createQueryBuilder: () => query } as never,
		users as never,
		{ findOneBy: vi.fn().mockResolvedValue(null) } as never,
		auditLogs as never,
		{ assertAgentsEnabled: vi.fn() } as never,
		{ logSafely: vi.fn() } as never,
		{ createNotification: vi.fn() } as never,
		{ suspend: vi.fn() } as never,
		{ isModerator: vi.fn().mockResolvedValue(false) } as never,
	);
	const pending = () => evidence.filter(log => log.reviewIgnoredAt == null).map(log => log.id);
	return { endpoint, auditLogs, evidence, events, pending };
}

describe('External audit quick-action evidence', () => {
	test('resolves only selected sessions and leaves concurrent new evidence unreviewed', async () => {
		const h = actionHarness();
		await h.endpoint.exec({ sessionIds: ['selected'], violationCategory: 'test' }, moderator as never, null);
		expect(h.pending()).toEqual(['log2', 'log3']);
		expect(h.events).toEqual(['bound', 'ban', 'reviewed']);
		expect(h.auditLogs.update.mock.calls[0][0]).toMatchObject({ sessionId: In(['selected']), id: LessThanOrEqual('log1') });
	});

	test('resolves every session when suspending, but not blocks arriving during the operation', async () => {
		const h = actionHarness();
		await h.endpoint.exec({ sessionIds: ['selected'], violationCategory: 'test', suspendDurationHours: 24 }, moderator as never, null);
		expect(h.auditLogs.update.mock.calls[0][0]).not.toHaveProperty('sessionId');
		expect(h.pending()).toEqual(['log3']);
	});

	test('uses the review list upper id instead of looking one up', async () => {
		const h = actionHarness();
		await h.endpoint.exec({ sessionIds: ['selected'], violationCategory: 'test', suspendDurationHours: 24, reviewUntilId: 'log1' }, moderator as never, null);
		expect(h.auditLogs.findOne).not.toHaveBeenCalled();
		expect(h.pending()).toEqual(['log2', 'log3']);
	});

	test('skips the update when the selected sessions have no unreviewed evidence', async () => {
		const h = actionHarness();
		h.evidence.length = 0;
		await h.endpoint.exec({ sessionIds: ['selected'], violationCategory: 'test' }, moderator as never, null);
		expect(h.auditLogs.update).not.toHaveBeenCalled();
		expect(h.pending()).toEqual(['log3']);
	});
});

describe('External audit review ignore', () => {
	function ignoreHarness() {
		const evidence: (Evidence & { userId: string })[] = [
			{ id: 'log1', userId: 'owner', sessionId: 's', status: 'block', reviewIgnoredAt: null },
			{ id: 'log5', userId: 'owner', sessionId: 's', status: 'block', reviewIgnoredAt: null },
			{ id: 'log7', userId: 'owner', sessionId: 's', status: 'allow', reviewIgnoredAt: null },
			{ id: 'log9', userId: 'owner', sessionId: 's', status: 'block', reviewIgnoredAt: null },
			{ id: 'log2', userId: 'other', sessionId: 's', status: 'block', reviewIgnoredAt: null },
		];
		const auditLogs = {
			update: vi.fn(async (where: Record<string, unknown>, values: { reviewIgnoredAt: Date }) => {
				let affected = 0;
				for (const log of evidence) {
					if (!matches(log, where)) continue;
					log.reviewIgnoredAt = values.reviewIgnoredAt;
					affected++;
				}
				return { affected };
			}),
		};
		const log = { logSafely: vi.fn() };
		const endpoint = new ReviewIgnore(auditLogs as never, { assertAgentsEnabled: vi.fn() } as never, log as never);
		const pending = () => evidence.filter(l => l.reviewIgnoredAt == null).map(l => l.id);
		return { endpoint, auditLogs, log, pending };
	}

	test('ignores every unreviewed block of the user up to the upper id with one bounded update', async () => {
		const h = ignoreHarness();
		await expect(h.endpoint.exec({ userId: 'owner', untilId: 'log5' }, moderator as never, null)).resolves.toEqual({ ok: true, ignored: 2 });
		expect(h.auditLogs.update).toHaveBeenCalledOnce();
		expect(h.pending()).toEqual(['log7', 'log9', 'log2']);
		expect(h.log.logSafely).toHaveBeenCalledWith(moderator, 'ignoreAgentExternalAuditReview', { ids: [], userId: 'owner', untilId: 'log5', count: 2 });
	});

	test('keeps the explicit id mode', async () => {
		const h = ignoreHarness();
		await h.endpoint.exec({ ids: ['log9'] }, moderator as never, null);
		expect(h.pending()).toEqual(['log1', 'log5', 'log7', 'log2']);
		expect(h.log.logSafely).toHaveBeenCalledWith(moderator, 'ignoreAgentExternalAuditReview', { ids: ['log9'], count: 1 });
	});

	test.each([{}, { userId: 'owner' }, { untilId: 'log9' }, { ids: [] }])('rejects incomplete targets %j', async params => {
		const h = ignoreHarness();
		await expect(h.endpoint.exec(params, moderator as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(h.auditLogs.update).not.toHaveBeenCalled();
	});
});
