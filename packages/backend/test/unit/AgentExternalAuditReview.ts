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

type PageRow = { userId: string; sessionId: string | null; blockCount: string; latestBlockAt: Date; reviewUntilId: string };

/**
 * 用真实 TypeORM 生成 PostgreSQL SQL，只把「待复审组页查询」的返回行作为夹具注入。
 * 这样验证的是查询本身的结构（分区键、阈值、分组、参数），而不是被模拟的资格结论。
 */
async function harness(triggerRules = rules, pageRows?: PageRow[]) {
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
	const logs = ['2026-10-30T00:12:00+08:00', '2026-10-30T00:24:00+08:00', '2026-10-30T00:26:00+08:00'].map((date, i) => ({
		id: `log${i}`, userId: 'owner', sessionId: null, createdAt: new Date(date),
		status: 'block', reviewIgnoredAt: null, session: null, character: null,
	}));
	const page: PageRow[] = pageRows ?? [{ userId: 'owner', sessionId: null, blockCount: '3', latestBlockAt: logs[2].createdAt, reviewUntilId: 'log2' }];
	const queries: { sql: string; parameters: unknown[] }[] = [];
	const details: { sql: string; parameters: unknown[] }[] = [];
	const buildQuery = (qb: ReturnType<typeof repository.createQueryBuilder>) => {
		vi.spyOn(qb, 'getRawMany').mockImplementation(async () => {
			const [sql, parameters] = qb.getQueryAndParameters();
			queries.push({ sql, parameters });
			if (sql.includes('MAX("log"."createdAt")')) return page;
			if (sql.includes('AS "userReviewUntilId"')) return [{ userId: 'owner', userReviewUntilId: 'log2' }];
			return [];
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
	return { endpoint, queries, details, logs, auditLogs, page, source, repository };
}

/** 只生成待复审组 SQL（不执行），用于直接断言查询结构 */
async function queryFor(triggerRules: MiAgentReviewTriggerRule[], filterUserId: string | null = null) {
	const { pendingReviewGroupsQuery } = await import('@/server/api/endpoints/admin/agents/governance/external-audit/_review-qualification.js');
	const h = await harness(triggerRules, []);
	const qb = pendingReviewGroupsQuery(h.repository as never, triggerRules, filterUserId);
	return qb.getQueryAndParameters();
}

afterEach(() => vi.useRealTimers());

describe('external audit review eligibility', () => {
	test('rules partition the window by user and session and match qualified groups', async () => {
		const [sql, parameters] = await queryFor([rules[0]]);
		expect(sql).toMatch(/COUNT\(\*\) OVER \(PARTITION BY "log"\."userId", "log"\."sessionId" ORDER BY "log"\."createdAt"/);
		expect(sql).toContain('EXISTS (');
		expect(sql).toContain('"peaks"."sessionId" IS NOT DISTINCT FROM "log"."sessionId"');
		expect(sql).toContain('GROUP BY "log"."userId", "log"."sessionId"');
		expect(parameters).toContain(60);
		expect(parameters).toContain(3);
	});

	test('each rule gets its own window and threshold parameters', async () => {
		const [sql, parameters] = await queryFor(rules);
		expect(sql.match(/COUNT\(\*\) OVER/g)).toHaveLength(2);
		expect(parameters).toContain(60);
		expect(parameters).toContain(1440);
		expect(parameters).toContain(3);
		expect(parameters).toContain(5);
		expect(sql.match(/"peaks"\."blockCount" >= \$\d+/g)).toHaveLength(2);
	});

	test('includes the three blocks shown in the report', async () => {
		const h = await harness();
		const rows = await h.endpoint.exec({}, moderator as never, null);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ userId: 'owner', sessionId: null, blockCount: 3, reviewUntilId: 'log2', userReviewUntilId: 'log2' });
		expect(rows[0].logs.map((l: { id: string }) => l.id)).toEqual(['log0', 'log1', 'log2']);
	});

	test('returns one card per user and session group', async () => {
		const h = await harness(rules, [
			{ userId: 'owner', sessionId: 'a', blockCount: '3', latestBlockAt: new Date(), reviewUntilId: 'log2' },
			{ userId: 'owner', sessionId: 'b', blockCount: '1', latestBlockAt: new Date(), reviewUntilId: 'log1' },
		]);
		const rows = await h.endpoint.exec({}, moderator as never, null);
		expect(rows.map((r: PageRow) => [r.userId, r.sessionId, r.blockCount])).toEqual([['owner', 'a', 3], ['owner', 'b', 1]]);
		expect(h.details[0].sql).toContain('"l"."sessionId" IN (');
	});

	test('caps evidence details at 50 per group in one query while blockCount keeps the full total', async () => {
		const h = await harness();
		await h.endpoint.exec({}, moderator as never, null);
		expect(h.details).toHaveLength(1);
		expect(h.queries.find(q => q.sql.includes('AS "reviewUntilId"'))!.sql).toContain('MAX("log"."id") AS "reviewUntilId"');
		// Run the emitted ranking subquery itself to prove the cap is per group, not global.
		const detail = h.details[0];
		const ranked = detail.sql.match(/IN \(\s*(SELECT "ranked"\."id"[\s\S]*"ranked"\."rank" <= \$\d+)\s*\)/)![1];
		const parameters = Object.fromEntries(detail.parameters.map((value, i) => [`$${i + 1}`, value as SQLInputValue]));
		const used = new Set([...ranked.matchAll(/\$\d+/g)].map(m => m[0]));
		const db = new DatabaseSync(':memory:');
		try {
			db.exec('CREATE TABLE agent_external_audit_log (id TEXT, userId TEXT, createdAt INTEGER, status TEXT, reviewIgnoredAt INTEGER, sessionId TEXT)');
			const insert = db.prepare('INSERT INTO agent_external_audit_log VALUES (?, ?, ?, ?, ?, ?)');
			// The second, newer user would take every slot under a global rank, so this pins PARTITION BY userId+sessionId.
			for (let i = 0; i < 80; i++) insert.run(`a${String(i).padStart(3, '0')}`, 'owner', i, 'block', null, null);
			for (let i = 0; i < 60; i++) insert.run(`z${String(i).padStart(3, '0')}`, 'peer', 1000 + i, 'block', null, null);
			insert.run('b000', 'owner', 200, 'block', 1, null);
			insert.run('c000', 'owner', 201, 'allow', null, null);
			// 另一个会话不在本页，其记录不得混入本组明细
			for (let i = 0; i < 60; i++) insert.run(`s${String(i).padStart(3, '0')}`, 'owner', i, 'block', null, 'other-session');
			const userParam = Object.entries(parameters).find(([, value]) => value === 'owner')![0];
			const twoUsers = ranked.replace(`IN (${userParam})`, `IN (${userParam}, $peer)`);
			expect(twoUsers).not.toBe(ranked);
			const bound = { ...Object.fromEntries(Object.entries(parameters).filter(([k]) => used.has(k))), $peer: 'peer' };
			const rows = db.prepare(twoUsers).all(bound).map(row => String(row.id));
			const owner = rows.filter(id => id.startsWith('a'));
			const peer = rows.filter(id => id.startsWith('z'));
			const other = rows.filter(id => id.startsWith('s'));
			expect(owner).toHaveLength(50);
			expect(peer).toHaveLength(50);
			expect(owner).toContain('a079');
			expect(owner).not.toContain('a029');
			expect(other).toHaveLength(0);
			expect(rows).not.toContain('b000');
			expect(rows).not.toContain('c000');
		} finally {
			db.close();
		}
	});

	test('counts pending groups per user and session, not per user', async () => {
		const { countPendingReviewSessions } = await import('@/server/api/endpoints/admin/agents/governance/external-audit/_review-qualification.js');
		const h = await harness();
		const sqls: string[] = [];
		const manager = h.auditLogs.manager.createQueryBuilder();
		const proto = Object.getPrototypeOf(manager);
		vi.spyOn(proto, 'getRawOne').mockImplementation(async function (this: { getQuery: () => string }) {
			sqls.push(this.getQuery());
			return { count: '2' };
		});
		const repo = { ...h.auditLogs, target: 'AuditLog', manager: { createQueryBuilder: () => h.auditLogs.manager.createQueryBuilder() } };
		expect(await countPendingReviewSessions(repo as never, rules)).toBe(2);
		expect(sqls[0]).toMatch(/COUNT\(\*\) AS "count" FROM \(SELECT "log"\."userId" AS "userId", "log"\."sessionId" AS "sessionId"/);
		expect(sqls[0]).toMatch(/GROUP BY "log"\."userId", "log"\."sessionId"\) "groups"/);
		expect(sqls[0]).toContain('"reviewIgnoredAt" IS NULL');
		vi.restoreAllMocks();
	});

	test('uses a historical sliding window, not the lifetime total or the current clock', async () => {
		const [sql, parameters] = await queryFor([rules[0]]);
		expect(sql).toMatch(/MAX\("windows"\."blockCount"\)/);
		expect(sql).toContain("INTERVAL '1 minute'");
		expect(sql).toContain('PRECEDING AND CURRENT ROW');
		expect(sql).toContain('"reviewIgnoredAt" IS NULL');
		expect(parameters).toContain(60);
	});

	test('treats an omitted enabled flag exactly like the settings page', async () => {
		const { enabled: _, ...rule } = rules[0];
		const h = await harness([rule as MiAgentReviewTriggerRule]);
		const rows = await h.endpoint.exec({}, moderator as never, null);
		expect(rows).toHaveLength(1);
	});

	test('returns no candidates when all rules are explicitly disabled', async () => {
		const h = await harness(rules.map(r => ({ ...r, enabled: false })));
		expect(await h.endpoint.exec({}, moderator as never, null)).toEqual([]);
		expect(h.auditLogs.createQueryBuilder).not.toHaveBeenCalled();
	});

	test('applies user filtering and pagination on the group query', async () => {
		const h = await harness();
		await h.endpoint.exec({ userId: '2937163793', limit: 31, offset: 30 }, moderator as never, null);
		const page = h.queries.find(q => q.sql.includes('AS "reviewUntilId"'))!;
		expect(page.sql).toContain('"reviewIgnoredAt" IS NULL');
		expect(page.sql).toContain('LIMIT 31 OFFSET 30');
		expect(page.parameters).toContain('owner');
		expect(page.parameters.every(p => !(p instanceof Date))).toBe(true);
	});

	test('executes the full pending-group query: only qualified sessions appear, including no-session groups', async () => {
		// 在 SQLite 中执行真实生成的查询（仅替换 interval 语法为毫秒），验证口径而不是 SQL 字符串
		const { pendingReviewGroupsQuery } = await import('@/server/api/endpoints/admin/agents/governance/external-audit/_review-qualification.js');
		const h = await harness([rules[0]], []);
		const qb = pendingReviewGroupsQuery(h.repository as never, [rules[0]], null);
		const [rawSql, parameters] = qb.getQueryAndParameters();
		const sql = rawSql.replace(/\$\d+ \* INTERVAL '1 minute'/, String(60 * 60000));
		const used = new Set([...sql.matchAll(/\$\d+/g)].map(m => m[0]));
		const bound = Object.fromEntries(parameters.map((value, i) => [`$${i + 1}`, value as SQLInputValue]).filter(([k]) => used.has(k as string)));
		const db = new DatabaseSync(':memory:');
		try {
			db.exec('CREATE TABLE agent_external_audit_log (id TEXT, userId TEXT, sessionId TEXT, createdAt INTEGER, status TEXT, reviewIgnoredAt INTEGER)');
			const insert = db.prepare('INSERT INTO agent_external_audit_log VALUES (?, ?, ?, ?, ?, ?)');
			let seq = 0;
			const add = (user: string, session: string | null, minutes: number[], status = 'block', reviewed = false) => {
				for (const minute of minutes) insert.run(`log${seq++}`, user, session, minute * 60000, status, reviewed ? 1 : null);
			};
			add('u', 'a', [12, 24, 26]); // 同会话 3 次达标
			add('u', 'b', [0]); // 同用户另一会话只有 1 次，不应出现
			add('spread', 'a', [0]); // 分散在两个会话、合计 3 次，但单会话不达标
			add('spread', 'b', [1, 2]);
			add('nosession', null, [12, 24, 26]); // 无会话组同样要进入复审
			add('spreadtime', 'a', [0, 61, 122]); // 跨窗口，不达标
			add('reviewed', 'a', [12, 24, 26], 'block', true);
			const rows = db.prepare(sql).all(bound).map(r => `${r.userId}:${r.sessionId ?? ''}:${r.blockCount}`);
			expect(rows).toEqual(['nosession::3', 'u:a:3']);
		} finally {
			db.close();
		}
	});

	test('executes the emitted sliding-window SQL against independent in-memory fixtures', async () => {
		// 只取单条规则的窗口子查询，在 SQLite 中验证语义（PostgreSQL 的 interval 语法替换为毫秒）
		const { pendingReviewGroupsQuery } = await import('@/server/api/endpoints/admin/agents/governance/external-audit/_review-qualification.js');
		const h = await harness([rules[0]], []);
		const qb = pendingReviewGroupsQuery(h.repository as never, [rules[0]], null);
		const full = qb.getQuery();
		const start = full.indexOf('(SELECT "log"."userId" AS "userId", "log"."sessionId" AS "sessionId", COUNT(*) OVER');
		expect(start).toBeGreaterThanOrEqual(0);
		const end = full.indexOf('"reviewIgnoredAt" IS NULL)', start);
		const windowSql = full.slice(start + 1, end + '"reviewIgnoredAt" IS NULL'.length);
		const sql = windowSql.replace(/:rule0WindowMinutes \* INTERVAL '1 minute'/, String(60 * 60000));
		const db = new DatabaseSync(':memory:');
		try {
			db.exec('CREATE TABLE agent_external_audit_log (userId TEXT, sessionId TEXT, createdAt INTEGER, status TEXT, reviewIgnoredAt INTEGER)');
			const insert = db.prepare('INSERT INTO agent_external_audit_log VALUES (?, ?, ?, ?, ?)');
			const add = (user: string, session: string | null, minutes: number[], status = 'block', reviewed = false) => {
				for (const minute of minutes) insert.run(user, session, minute * 60000, status, reviewed ? 1 : null);
			};
			add('u', 'a', [12, 24, 26]);
			add('u', 'b', [0]);
			add('u2', 'a', [0, 61, 122]);
			add('u3', 'a', [12, 24, 26], 'block', true);
			add('u4', 'a', [12, 24, 26], 'allow');
			add('u5', 'a', [12, 12, 12]);
			const rows = db.prepare(sql).all({ status: 'block' });
			const keys = new Set(rows.map(r => `${r.userId}:${r.sessionId}:${r.blockCount}`));
			// 同一用户两个会话各自计数；跨用户不合并；已审阅/放行不计
			expect(keys).toContain('u:a:3');
			expect(keys).toContain('u:b:1');
			expect(keys).toContain('u2:a:1');
			expect(keys).toContain('u5:a:3');
			expect([...keys].some(k => k.startsWith('u3:'))).toBe(false);
			expect([...keys].some(k => k.startsWith('u4:'))).toBe(false);
		} finally {
			db.close();
		}
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
