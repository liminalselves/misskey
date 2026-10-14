/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { QueryFailedError } from 'typeorm';
import { AgentCheckinService } from '@/core/AgentCheckinService.js';
import { MiAgentCheckinRecord } from '@/models/AgentCheckinRecord.js';
import { MiAgentModelUsageLog } from '@/models/AgentModelUsageLog.js';
import { MiUserProfile } from '@/models/UserProfile.js';

function makeDuplicateError(): QueryFailedError {
	const driverError = new Error('duplicate key') as Error & { code: string };
	driverError.code = '23505';
	return new QueryFailedError('INSERT ...', [], driverError);
}

type TxOptions = {
	/** 事务内本月用户补签计数（performMakeup 月度检查读取） */
	monthMakeupCount?: number;
	/** 事务内锁到的 profile（null 表示无 profile 行） */
	profile?: { agentCreditBalance: number } | null;
	/** 事务开启后、回调执行前注入的行为（如抛错模拟事务失败） */
	txFn?: (em: Record<string, unknown>) => void | Promise<void>;
	/** 覆盖 em 上的方法（如 insert 抛唯一索引冲突） */
	emOverrides?: Record<string, unknown>;
};

function createService(opts: TxOptions = {}) {
	const inserted: Record<string, unknown>[] = [];
	const txInserts: Array<[unknown, Record<string, unknown>]> = [];

	const monthQuery = {
		where: jest.fn(),
		andWhere: jest.fn(),
		orderBy: jest.fn(),
		getMany: jest.fn(async () => [
			{
				date: '2026-09-18',
				reward: 0,
				isMakeup: true,
				baseValue: 0,
				streakMultiplier: 1,
				roleMultiplier: 1,
				dayMultiplier: 1,
				makeupCost: 0,
				makeupSource: 'admin',
				createdAt: new Date('2026-09-21T00:00:00.000Z'),
			},
			{
				date: '2026-09-19',
				reward: 0,
				isMakeup: true,
				baseValue: 0,
				streakMultiplier: 1,
				roleMultiplier: 1,
				dayMultiplier: 1,
				makeupCost: 20,
				makeupSource: 'user',
				createdAt: new Date('2026-09-20T00:00:00.000Z'),
			},
		]),
	};
	monthQuery.where.mockReturnValue(monthQuery);
	monthQuery.andWhere.mockReturnValue(monthQuery);
	monthQuery.orderBy.mockReturnValue(monthQuery);
	const totalQuery = {
		select: jest.fn(),
		where: jest.fn(),
		getRawOne: jest.fn(async () => ({ total: 0 })),
	};
	totalQuery.select.mockReturnValue(totalQuery);
	totalQuery.where.mockReturnValue(totalQuery);
	const makeupCountQuery = {
		where: jest.fn(),
		andWhere: jest.fn(),
		getCount: jest.fn(async () => 1),
	};
	makeupCountQuery.where.mockReturnValue(makeupCountQuery);
	makeupCountQuery.andWhere.mockReturnValue(makeupCountQuery);

	const checkinRecordsRepository = {
		insertOne: jest.fn(async (row: Record<string, unknown>) => {
			inserted.push(row);
		}),
		findOneBy: jest.fn(async () => null),
		findOneByOrFail: jest.fn(async () => ({
			reward: 2.5,
			streakAtCheckin: 3,
			baseValue: 1,
			streakMultiplier: 1.2,
			roleMultiplier: 1,
			dayMultiplier: 1,
		})),
		existsBy: jest.fn(async () => false),
		find: jest.fn(async () => []),
		createQueryBuilder: jest.fn()
			.mockReturnValueOnce(monthQuery)
			.mockReturnValueOnce(totalQuery)
			.mockReturnValueOnce(makeupCountQuery),
	};

	const txMonthQueryBuilder = {
		where: jest.fn(),
		andWhere: jest.fn(),
		getCount: jest.fn(async () => opts.monthMakeupCount ?? 0),
	};
	txMonthQueryBuilder.where.mockReturnValue(txMonthQueryBuilder);
	txMonthQueryBuilder.andWhere.mockReturnValue(txMonthQueryBuilder);

	const em = {
		insert: jest.fn(async (target: unknown, values: Record<string, unknown>) => {
			txInserts.push([target, values]);
		}),
		increment: jest.fn(async () => ({ affected: 1, raw: [], generatedMaps: [] })),
		decrement: jest.fn(async () => ({ affected: 1, raw: [], generatedMaps: [] })),
		findOne: jest.fn(async () => (opts.profile === undefined ? { userId: 'user-id', agentCreditBalance: 100 } : opts.profile)),
		find: jest.fn(async () => []),
		delete: jest.fn(async () => ({ affected: 0, raw: [] })),
		getRepository: jest.fn(() => ({
			createQueryBuilder: () => txMonthQueryBuilder,
		})),
		...opts.emOverrides,
	};
	const db = {
		transaction: jest.fn(async (cb: (em: unknown) => Promise<unknown>) => {
			if (opts.txFn) await opts.txFn(em);
			return await cb(em);
		}),
	};

	let idSeq = 0;
	const service = new AgentCheckinService(
		checkinRecordsRepository as never,
		{ findBy: jest.fn(async () => []) } as never,
		{ findBy: jest.fn(async () => []) } as never,
		db as never,
		{ gen: jest.fn(() => `record-id-${++idSeq}`) } as never,
	);

	return { service, inserted, txInserts, em, db, checkinRecordsRepository };
}

describe('AgentCheckinService admin makeup', () => {
	beforeEach(() => {
		jest.useFakeTimers().setSystemTime(new Date('2026-09-21T04:00:00.000Z'));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test('creates a free admin makeup record', async () => {
		const { service, inserted } = createService();

		await expect(service.performAdminMakeup('user-id', '2026-09-20')).resolves.toEqual({ ok: true });
		expect(inserted).toEqual([
			expect.objectContaining({
				userId: 'user-id',
				date: '2026-09-20',
				isMakeup: true,
				makeupCost: 0,
				makeupSource: 'admin',
			}),
		]);
	});

	test('does not count admin makeup against the monthly allowance', async () => {
		const { service } = createService();

		const status = await service.getMonthStatus('user-id', '2026-09', {
			agentCheckinSettings: {
				enabled: true,
				streakMaxDays: 365,
				streakMaxMultiplier: 2,
				specialDayMultiplier: 2,
				specialDays: [],
				roleMultipliers: {},
				makeupEnabled: true,
				makeupMaxPerMonth: 3,
				makeupBaseCost: 20,
				makeupCostIncrement: 10,
				makeupAllowedWindowDays: 7,
			},
		} as never);

		expect(status.makeupRemainingThisMonth).toBe(2);
		expect(status.nextMakeupCost).toBe(30);
		expect(status.monthRecords[0]?.makeupSource).toBe('admin');
	});
});

describe('AgentCheckinService performCheckin transaction', () => {
	beforeEach(() => {
		jest.useFakeTimers().setSystemTime(new Date('2026-09-21T04:00:00.000Z'));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test('writes record, credits balance and income log in one transaction', async () => {
		const { service, txInserts, em } = createService();

		const result = await service.performCheckin('user-id', {} as never);

		expect(result.alreadyCheckedIn).toBe(false);
		const record = txInserts.find(([target]) => target === MiAgentCheckinRecord);
		const log = txInserts.find(([target]) => target === MiAgentModelUsageLog);
		expect(record).toBeDefined();
		expect(record![1]).toMatchObject({ userId: 'user-id', date: '2026-09-21', isMakeup: false });
		expect(log).toBeDefined();
		expect(log![1]).toMatchObject({ usageKind: 'checkin', cost: -result.reward });
		expect(em.increment).toHaveBeenCalledWith(MiUserProfile, { userId: 'user-id' }, 'agentCreditBalance', result.reward);
	});

	test('rolls back the whole transaction and returns idempotent result on duplicate checkin', async () => {
		const { service, txInserts, em } = createService({
			emOverrides: {
				insert: jest.fn(async () => {
					throw makeDuplicateError();
				}),
			},
		});

		const result = await service.performCheckin('user-id', {} as never);

		expect(result).toEqual({
			alreadyCheckedIn: true,
			reward: 2.5,
			streak: 3,
			baseValue: 1,
			streakMultiplier: 1.2,
			roleMultiplier: 1,
			dayMultiplier: 1,
		});
		// 余额与流水不应写入（事务回滚）
		expect(em.increment).not.toHaveBeenCalled();
		expect(txInserts.find(([target]) => target === MiAgentModelUsageLog)).toBeUndefined();
	});
});

describe('AgentCheckinService performMakeup transaction', () => {
	beforeEach(() => {
		jest.useFakeTimers().setSystemTime(new Date('2026-09-21T04:00:00.000Z'));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test('serializes via profile row lock, charges and writes log in one transaction', async () => {
		const { service, txInserts, em } = createService({ monthMakeupCount: 1, profile: { agentCreditBalance: 100 } });

		const result = await service.performMakeup('user-id', '2026-09-20', {} as never);

		expect(result).toEqual({ ok: true, cost: 30 });
		// 月度补签锁：pessimistic_write 行锁
		expect(em.findOne).toHaveBeenCalledWith(MiUserProfile, {
			where: { userId: 'user-id' },
			lock: { mode: 'pessimistic_write' },
		});
		expect(em.decrement).toHaveBeenCalledWith(MiUserProfile, { userId: 'user-id' }, 'agentCreditBalance', 30);
		const record = txInserts.find(([target]) => target === MiAgentCheckinRecord);
		const log = txInserts.find(([target]) => target === MiAgentModelUsageLog);
		expect(record).toBeDefined();
		expect(record![1]).toMatchObject({ date: '2026-09-20', isMakeup: true, makeupCost: 30, makeupSource: 'user' });
		expect(log).toBeDefined();
		expect(log![1]).toMatchObject({ usageKind: 'checkin', cost: 30 });
	});

	test('rejects without writing when balance is insufficient', async () => {
		const { service, txInserts, em } = createService({ profile: { agentCreditBalance: 5 } });

		const result = await service.performMakeup('user-id', '2026-09-20', {} as never);

		expect(result).toEqual({ ok: false, reason: '余额不足（需要 20 额度）' });
		expect(em.decrement).not.toHaveBeenCalled();
		expect(txInserts).toEqual([]);
	});

	test('rejects when monthly makeup allowance is exhausted (count read inside the lock)', async () => {
		const { service, txInserts } = createService({ monthMakeupCount: 3, profile: { agentCreditBalance: 100 } });

		const result = await service.performMakeup('user-id', '2026-09-20', {} as never);

		expect(result).toEqual({ ok: false, reason: '本月补签次数已达上限（3 次）' });
		expect(txInserts).toEqual([]);
	});

	test('rolls back the charge when the date is already claimed', async () => {
		const { service, em } = createService({
			profile: { agentCreditBalance: 100 },
			emOverrides: {
				insert: jest.fn(async () => {
					throw makeDuplicateError();
				}),
			},
		});

		const result = await service.performMakeup('user-id', '2026-09-20', {} as never);

		expect(result).toEqual({ ok: false, reason: '该日期已签到' });
		expect(em.decrement).not.toHaveBeenCalled();
	});
});
