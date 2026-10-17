/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';
import { MiAgentModelUsageLog } from '@/models/AgentModelUsageLog.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import type { MiMeta } from '@/models/Meta.js';

/** dailyFreeQuota=2 的按次计费模型（id 不能以 BYOK 前缀 u 开头） */
const instance = {
	agentLlmModels: [{
		id: 'model-a',
		name: 'Model A',
		baseUrl: 'https://example.com',
		apiKey: 'sk-test',
		apiModelName: 'model-a',
		maxContextTokens: 8192,
		maxOutputTokensPerCall: 2048,
		costPerCall: 1,
		billingMode: 'per_call',
		dailyFreeQuota: 2,
	}],
} as unknown as MiMeta;

type ServiceOptions = {
	/** Lua INCR 返回值（当日已用计数 + 1） */
	evalResult?: number;
	/** 结算条件更新命中行数（0 表示日志已被结算过） */
	updateAffected?: number;
	/** 事务失败（模拟 DB 故障） */
	txError?: Error;
};

function createService(opts: ServiceOptions = {}) {
	const updates: Array<[unknown, unknown, Record<string, unknown>]> = [];
	const em = {
		update: jest.fn(async (target: unknown, criteria: unknown, patch: Record<string, unknown>) => {
			updates.push([target, criteria, patch]);
			return { affected: opts.updateAffected ?? 1, raw: [], generatedMaps: [] };
		}),
		decrement: jest.fn(async () => ({ affected: 1, raw: [], generatedMaps: [] })),
	};
	const db = {
		transaction: jest.fn(async (cb: (em: unknown) => Promise<unknown>) => {
			if (opts.txError) throw opts.txError;
			return await cb(em);
		}),
	};
	const redis = {
		eval: jest.fn(async (..._args: unknown[]) => opts.evalResult ?? 1),
		decr: jest.fn(async () => 0),
		incr: jest.fn(async () => 1),
		get: jest.fn(async () => null),
	};
	const service = new AgentModelUsageService(
		{} as never,
		{} as never,
		redis as never,
		db as never,
		{ gen: jest.fn(() => 'log-id') } as never,
		{ getUserFacingModelCostPerCall: jest.fn(() => 1) } as never,
	);
	return { service, redis, em, db, updates };
}

function createLog(): MiAgentModelUsageLog {
	return {
		id: 'log-1',
		requestedAt: new Date('2026-09-21T04:00:00.000Z'),
		completedAt: null,
		durationMs: null,
		userId: 'user-1',
		sessionId: null,
		characterId: null,
		dialogueStyleId: null,
		modelId: 'model-a',
		modelApiName: 'model-a',
		usageKind: 'chat',
		status: 'pending',
		errorCode: null,
		cost: 0,
		promptTokens: null,
		completionTokens: null,
	} as MiAgentModelUsageLog;
}

describe('AgentModelUsageService finishLog atomicity', () => {
	beforeEach(() => {
		jest.useFakeTimers().setSystemTime(new Date('2026-09-21T04:00:00.000Z'));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test.each([
		['per_call', 'success', 2, true, 1],
		['per_call', 'success', 2, false, 1],
		['per_call', 'aborted', 2, false, 1],
		['per_call', 'success', 5, true, 1],
		['usage', 'success', 2, true, 2],
		['usage', 'success', 5, true, 1],
		['usage', 'success', 2, false, 2],
		['usage', 'success', 5, false, 1],
	] as const)('%s / %s / UTC hour %i / usage %s: charges %s', async (billingMode, status, hour, withUsage, expectedCost) => {
		jest.setSystemTime(new Date(Date.UTC(2026, 9, 17, hour)));
		const pricedInstance = {
			...instance,
			agentLlmModels: [{
				...instance.agentLlmModels![0]!,
				billingMode,
				dailyFreeQuota: 0,
				peakPriceMultiplier: 2,
				pricePerMillionInputCacheHitTokens: 1,
				pricePerMillionInputCacheMissTokens: 1,
				pricePerMillionOutputTokens: 1,
			}],
		};
		const { service, em, updates } = createService();
		const log = createLog();

		await service.finishLog(log, pricedInstance, {
			status,
			...(withUsage ? { promptTokens: 500_000, completionTokens: 500_000 } : {}),
		});

		expect(log.cost).toBe(expectedCost);
		expect(updates[0]![2]).toMatchObject({ status, cost: expectedCost });
		expect(em.decrement).toHaveBeenCalledTimes(1);
		expect(em.decrement).toHaveBeenCalledWith(MiUserProfile, { userId: log.userId }, 'agentCreditBalance', expectedCost);
	});

	test('paid call: settles log and decrements balance in the same transaction', async () => {
		const { service, redis, em, updates } = createService({ evalResult: 3 });

		const log = createLog();
		await service.finishLog(log, instance, { status: 'success', costOverride: 5 });

		// 超出免费额度：INCR 后回滚计数
		expect(redis.eval).toHaveBeenCalledTimes(1);
		expect(redis.decr).toHaveBeenCalledTimes(1);
		// 条件结算：仅 status='pending' 的日志命中
		expect(updates.length).toBe(1);
		expect(updates[0]![0]).toBe(MiAgentModelUsageLog);
		expect(updates[0]![1]).toEqual({ id: 'log-1', status: 'pending' });
		expect(updates[0]![2]).toMatchObject({ status: 'success', cost: 5 });
		expect(em.decrement).toHaveBeenCalledWith(MiUserProfile, { userId: 'user-1' }, 'agentCreditBalance', 5);
		expect(log.cost).toBe(5);
	});

	test('free-quota call: no charge, free snapshot persisted, no compensation', async () => {
		const { service, redis, em, updates } = createService({ evalResult: 1 });

		const log = createLog();
		await service.finishLog(log, instance, { status: 'success', costOverride: 5 });

		expect(log.cost).toBe(0);
		expect(log.usedFreeQuota).toBe(true);
		expect(log.freeQuotaUsedAtCall).toBe(1);
		expect(log.freeQuotaTotalAtCall).toBe(2);
		expect(updates[0]![2]).toMatchObject({ cost: 0, usedFreeQuota: true, freeQuotaTotalAtCall: 2 });
		expect(em.decrement).not.toHaveBeenCalled();
		expect(redis.decr).not.toHaveBeenCalled();
		// INCR 与 EXPIRE 必须在同一段 Lua 中原子执行
		const script = String(redis.eval.mock.calls[0]![0]);
		expect(script).toContain("redis.call('INCR', KEYS[1])");
		expect(script).toContain("redis.call('EXPIRE', KEYS[1], ARGV[1])");
		expect(redis.eval.mock.calls[0]![1]).toBe(1);
		expect(redis.eval.mock.calls[0]![2]).toBe('agent:freeQuota:user-1:model-a:20260921');
	});

	test('retry on an already-settled log: no double charge and the taken free slot is returned', async () => {
		const { service, redis, em } = createService({ evalResult: 1, updateAffected: 0 });

		const log = createLog();
		await service.finishLog(log, instance, { status: 'success', costOverride: 5 });

		expect(em.decrement).not.toHaveBeenCalled();
		// 免费额度位补偿归还
		expect(redis.decr).toHaveBeenCalledTimes(1);
	});

	test('db failure after consuming a free slot: rejects and compensates the quota', async () => {
		const { service, redis, em } = createService({ evalResult: 1, txError: new Error('db down') });

		const log = createLog();
		await expect(service.finishLog(log, instance, { status: 'success', costOverride: 5 })).rejects.toThrow('db down');

		expect(log).toMatchObject({ status: 'pending', cost: 0, completedAt: null });
		expect(log.usedFreeQuota).not.toBe(true);
		expect(em.decrement).not.toHaveBeenCalled();
		expect(redis.decr).toHaveBeenCalledTimes(1);

		const retry = createService({ evalResult: 3 });
		await retry.service.finishLog(log, instance, { status: 'success', costOverride: 5 });
		expect(retry.updates[0]![2]).toMatchObject({ cost: 5, usedFreeQuota: false, freeQuotaUsedAtCall: null, freeQuotaTotalAtCall: null });
		expect(log).toMatchObject({ status: 'success', cost: 5, usedFreeQuota: false });
	});

	test('failed call: no quota interaction, no charge', async () => {
		const { service, redis, em, updates } = createService();

		const log = createLog();
		await service.finishLog(log, instance, { status: 'failed', errorCode: 'X' });

		expect(redis.eval).not.toHaveBeenCalled();
		expect(em.decrement).not.toHaveBeenCalled();
		expect(updates[0]![2]).toMatchObject({ status: 'failed', cost: 0, errorCode: 'X' });
	});
});
