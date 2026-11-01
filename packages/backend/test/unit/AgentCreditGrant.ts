/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { MiAgentModelUsageLog } from '@/models/AgentModelUsageLog.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { fetchAgentBillingPage } from '@/server/api/endpoints/agents/_billing-logs.js';

vi.doMock('../../src/core/AgentService.js', () => ({ AgentService: class {} }));
vi.doMock('../../src/core/MetaService.js', () => ({ MetaService: class {} }));
vi.doMock('../../src/core/NotificationService.js', () => ({ NotificationService: class {} }));
const { default: IssueBatch, meta } = await import('../../src/server/api/endpoints/admin/agents/credits/issue-batch.js');
const { default: IssueReward } = await import('../../src/server/api/endpoints/admin/agents/credits/issue-reward.js');

const moderator = { id: 'moderator1' };
const reward = { kind: 'reward', userRef: 'user1', amount: 1.25 };
const compensation = { kind: 'compensation', userRef: '@bob', amount: 2.5, reason: '计费差额补偿' };

type GrantLog = { userId: string; usageKind: string; cost: number; errorCode: string | null };

function harness(opts: { insertFailure?: string; readFailure?: string; notificationFailure?: boolean } = {}) {
	const users = [
		{ id: 'user1', usernameLower: 'alice', host: null },
		{ id: 'user2', usernameLower: 'bob', host: null },
		{ id: 'remote1', usernameLower: 'alice', host: 'remote.example' },
		{ id: 'missingprofile', usernameLower: 'orphan', host: null },
	];
	const usersRepository = {
		findOne: vi.fn(async ({ where }: { where: { id?: string; usernameLower?: string; host?: unknown } }) => {
			return users.find(user => where.id != null ? user.id === where.id
				: user.usernameLower === where.usernameLower && user.host === (typeof where.host === 'string' ? where.host : null)) ?? null;
		}),
		findOneBy: vi.fn(async ({ id }: { id: string }) => users.find(user => user.id === id) ?? null),
	};
	const balances = new Map([['user1', 10.25], ['user2', -4], ['remote1', 0]]);
	const logs: GrantLog[] = [];
	const events: string[] = [];
	const db = {
		transaction: vi.fn(async (cb: (em: unknown) => Promise<number>) => {
			const stagedBalances = new Map(balances);
			const stagedLogs: GrantLog[] = [];
			const em = {
				increment: async (entity: unknown, { userId }: { userId: string }, column: string, amount: number) => {
					expect(entity).toBe(MiUserProfile);
					expect(column).toBe('agentCreditBalance');
					if (!stagedBalances.has(userId)) return { affected: 0 };
					stagedBalances.set(userId, stagedBalances.get(userId)! + amount);
					return { affected: 1 };
				},
				insert: async (entity: unknown, log: GrantLog) => {
					expect(entity).toBe(MiAgentModelUsageLog);
					if (log.userId === opts.insertFailure) throw new Error('private database detail');
					stagedLogs.push(log);
				},
				findOneOrFail: async (entity: unknown, { where }: { where: { userId: string } }) => {
					expect(entity).toBe(MiUserProfile);
					if (where.userId === opts.readFailure) throw new Error('profile read failed');
					return { agentCreditBalance: stagedBalances.get(where.userId)! };
				},
			};
			const result = await cb(em);
			for (const [id, balance] of stagedBalances) balances.set(id, balance);
			logs.push(...stagedLogs);
			events.push('commit');
			return result;
		}),
	};
	const agentService = { assertAgentsEnabled: vi.fn(() => {}) };
	let nextId = 0;
	const idService = { gen: () => `log${++nextId}` };
	const metaService = { fetch: vi.fn(async (_cache: boolean) => ({ iconUrl: 'https://example.test/icon.png', logoImageUrl: null })) };
	const notificationService = {
		createNotification: vi.fn((_userId: string, _type: string, _data: unknown) => {
			events.push('notification');
			if (opts.notificationFailure) throw new Error('notification unavailable');
		}),
	};
	const batch = new IssueBatch(usersRepository as never, db as never, agentService as never,
		idService as never, metaService as never, notificationService as never);
	const single = new IssueReward(usersRepository as never, db as never, agentService as never,
		idService as never, metaService as never, notificationService as never);
	return { batch, single, balances, logs, events, db, usersRepository, agentService, metaService, notificationService };
}

beforeEach(() => {
	vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
	vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('Agent credit batch grants', () => {
	test('credits mixed reward/compensation rows and notifies only after each commit', async () => {
		const h = harness();
		const result = await h.batch.exec({ items: [reward, compensation] }, moderator as never, null);
		expect(result).toEqual({
			successCount: 2, failCount: 0,
			results: [
				{ index: 0, kind: 'reward', userRef: 'user1', userId: 'user1', amount: 1.25, newBalance: 11.5, ok: true },
				{ index: 1, kind: 'compensation', userRef: '@bob', userId: 'user2', amount: 2.5, newBalance: -1.5, ok: true },
			],
		});
		expect(h.logs).toMatchObject([
			{ userId: 'user1', usageKind: 'admin_reward', cost: -1.25, errorCode: null, status: 'success', modelId: null },
			{ userId: 'user2', usageKind: 'admin_compensation', cost: -2.5, errorCode: compensation.reason, status: 'success', modelId: null },
		]);
		expect(h.events).toEqual(['commit', 'notification', 'commit', 'notification']);
		expect(h.notificationService.createNotification.mock.calls).toEqual([
			['user1', 'app', { appAccessTokenId: null, customHeader: '奖励入账', customBody: '你收到了 1.25 额度奖励', customIcon: 'https://example.test/icon.png' }],
			['user2', 'app', { appAccessTokenId: null, customHeader: '补偿到账', customBody: '你收到了 2.50 额度补偿：计费差额补偿', customIcon: 'https://example.test/icon.png' }],
		]);
		expect(h.metaService.fetch).toHaveBeenCalledTimes(1);
	});

	test.each(['user1', '@alice', '@ALICE', '  @alice  ', '@alice@remote.example'])('resolves local/remote acct or database ID: %s', async userRef => {
		const h = harness();
		const result = await h.batch.exec({ items: [{ ...reward, userRef }] }, moderator as never, null);
		expect(result.successCount).toBe(1);
		expect(result.results[0].userId).toBe(userRef.includes('remote.example') ? 'remote1' : 'user1');
	});

	test('caches repeated references without silently dropping repeated grants', async () => {
		const h = harness();
		const result = await h.batch.exec({ items: [reward, reward] }, moderator as never, null);
		expect(result.results.map((row: { newBalance: number }) => row.newBalance)).toEqual([11.5, 12.75]);
		expect(h.usersRepository.findOneBy).toHaveBeenCalledTimes(1);
		expect(h.db.transaction).toHaveBeenCalledTimes(2);
	});

	test('keeps row order and continues after an unknown user', async () => {
		const h = harness();
		const result = await h.batch.exec({ items: [{ ...reward, userRef: '@nobody' }, reward] }, moderator as never, null);
		expect(result).toMatchObject({ successCount: 1, failCount: 1, results: [
			{ index: 0, ok: false, error: { code: 'NO_SUCH_USER' } },
			{ index: 1, ok: true, userId: 'user1' },
		] });
		expect(h.db.transaction).toHaveBeenCalledTimes(1);
		expect(h.notificationService.createNotification).toHaveBeenCalledTimes(1);
	});

	test('rolls back a missing-profile row without blocking the next grant', async () => {
		const h = harness();
		const result = await h.batch.exec({ items: [{ ...reward, userRef: 'missingprofile' }, reward] }, moderator as never, null);
		expect(result.results[0]).toMatchObject({ ok: false, error: { code: 'USER_PROFILE_MISSING' } });
		expect(result.results[1].ok).toBe(true);
		expect(h.logs).toHaveLength(1);
		expect(h.notificationService.createNotification).toHaveBeenCalledTimes(1);
	});

	test.each(['insertFailure', 'readFailure'] as const)('rolls back balance/log and continues after %s', async failure => {
		const h = harness({ [failure]: 'user1' });
		const result = await h.batch.exec({ items: [reward, compensation] }, moderator as never, null);
		expect(result).toMatchObject({ successCount: 1, failCount: 1, results: [
			{ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Credit grant failed.' } },
			{ ok: true, userId: 'user2' },
		] });
		expect(h.balances.get('user1')).toBe(10.25);
		expect(h.logs).toMatchObject([{ userId: 'user2' }]);
		expect(h.logs).toHaveLength(1);
		expect(h.notificationService.createNotification).toHaveBeenCalledTimes(1);
	});

	test('does not report committed grants as failed when notifications throw', async () => {
		const h = harness({ notificationFailure: true });
		const result = await h.batch.exec({ items: [reward, compensation] }, moderator as never, null);
		expect(result).toMatchObject({ successCount: 2, failCount: 0 });
		expect(h.logs).toHaveLength(2);
	});

	test('loads notification metadata before any credit is committed', async () => {
		const h = harness();
		h.metaService.fetch.mockRejectedValueOnce(new Error('metadata unavailable'));
		await expect(h.batch.exec({ items: [reward] }, moderator as never, null)).rejects.toThrow('metadata unavailable');
		expect(h.db.transaction).not.toHaveBeenCalled();
	});

	test('honors the feature flag before reading metadata or writing', async () => {
		const h = harness();
		h.agentService.assertAgentsEnabled.mockImplementation(() => { throw new Error('disabled'); });
		await expect(h.batch.exec({ items: [reward] }, moderator as never, null)).rejects.toThrow('disabled');
		expect(h.metaService.fetch).not.toHaveBeenCalled();
		expect(h.db.transaction).not.toHaveBeenCalled();
	});

	test('rejects excess precision per row without rounding away the error', async () => {
		const h = harness();
		const result = await h.batch.exec({ items: [{ ...reward, amount: 1.001 }, reward] }, moderator as never, null);
		expect(result).toMatchObject({ successCount: 1, failCount: 1, results: [
			{ ok: false, error: { code: 'INVALID_AMOUNT' } }, { ok: true },
		] });
		expect(h.balances.get('user1')).toBe(11.5);
	});

	test.each([0.01, 100000, 19.99, 0.1 + 0.2])('accepts cents including floating-point noise: %s', async amount => {
		const h = harness();
		const result = await h.batch.exec({ items: [{ ...reward, amount }] }, moderator as never, null);
		expect(result.successCount).toBe(1);
		expect(result.results[0].amount).toBe(Math.round(amount * 100) / 100);
	});

	test.each([null, '', '   ', '理'.repeat(200)])('preserves or normalizes a reason: %s', async reason => {
		const h = harness();
		const result = await h.batch.exec({ items: [{ ...reward, reason }] }, moderator as never, null);
		expect(result.successCount).toBe(1);
		expect(h.logs[0].errorCode).toBe(reason?.trim() || null);
	});

	test.each([
		{}, { items: [] }, { items: Array.from({ length: 201 }, () => reward) },
		{ items: [{ ...reward, kind: 'unknown' }] }, { items: [{ ...reward, userRef: '' }] },
		{ items: [{ ...reward, userRef: 'a'.repeat(129) }] }, { items: [{ ...reward, amount: 0 }] },
		{ items: [{ ...reward, amount: -1 }] }, { items: [{ ...reward, amount: 100000.01 }] },
		{ items: [{ ...reward, amount: Number.NaN }] }, { items: [{ ...reward, amount: Number.POSITIVE_INFINITY }] },
		{ items: [{ ...reward, amount: '1' }] }, { items: [{ ...reward, reason: 'a'.repeat(201) }] },
	])('rejects invalid request structure before making changes (%#)', async params => {
		const h = harness();
		await expect(h.batch.exec(params, moderator as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(h.db.transaction).not.toHaveBeenCalled();
		expect(h.metaService.fetch).not.toHaveBeenCalled();
	});

	test('accepts the 200-row boundary', async () => {
		const h = harness();
		const result = await h.batch.exec({ items: Array.from({ length: 200 }, () => reward) }, moderator as never, null);
		expect(result).toMatchObject({ successCount: 200, failCount: 0 });
		expect(h.logs).toHaveLength(200);
		expect(h.balances.get('user1')).toBe(260.25);
	});

	test('retains the current single-reward interface on the same transaction path', async () => {
		const h = harness();
		const result = await h.single.exec({ userId: '@alice', amount: 1.255, reason: ' old UI ' }, moderator as never, null);
		expect(result).toEqual({ userId: 'user1', amount: 1.25, newBalance: 11.5 });
		expect(h.logs[0]).toMatchObject({ usageKind: 'admin_reward', cost: -1.25, errorCode: 'old UI' });
		expect(h.events).toEqual(['commit', 'notification']);
	});

	test('requires moderator write permission and bounds the batch rate', () => {
		expect(meta).toMatchObject({ requireCredential: true, secure: true, requireModerator: true, kind: 'write:admin', limit: { max: 20 } });
	});
});

describe('Compensation billing rows', () => {
	test.each(['差额补偿', null])('returns positive income and the full reason/fallback: %s', async reason => {
		const rows = [{ id: 'log1', kind: 'usage', ts: new Date('2026-10-17'), cost: '-1.25', usageKind: 'admin_compensation', errorCode: reason }];
		const result = await fetchAgentBillingPage({
			agentModelUsageLogsRepository: { query: async (sql: string) => sql.includes('COUNT(*)') ? [{ cnt: '1' }] : rows },
			agentRedeemCodesRepository: {}, agentUserModelsRepository: { find: async () => [] },
			metaService: { fetch: async () => ({ agentLlmModels: [] }) },
			agentVisionService: { listAvailableVisionModels: async () => [] },
		} as never, { userId: 'user1', page: 1, pageSize: 20, untilDate: null });
		expect(result).toMatchObject({ total: 1, hasMore: false, items: [{
			amount: 1.25, usageKind: 'admin_compensation', modelName: reason ?? '管理员补偿',
		}] });
	});
});
