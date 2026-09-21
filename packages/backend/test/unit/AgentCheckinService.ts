/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { AgentCheckinService } from '@/core/AgentCheckinService.js';

function createService() {
	const inserted: Record<string, unknown>[] = [];
	const monthRecords = [
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
	];
	const monthQuery = {
		where: jest.fn(),
		andWhere: jest.fn(),
		orderBy: jest.fn(),
		getMany: jest.fn(async () => monthRecords),
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
		existsBy: jest.fn(async () => false),
		find: jest.fn(async () => []),
		createQueryBuilder: jest.fn()
			.mockReturnValueOnce(monthQuery)
			.mockReturnValueOnce(totalQuery)
			.mockReturnValueOnce(makeupCountQuery),
	};
	const service = new AgentCheckinService(
		checkinRecordsRepository as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{ gen: jest.fn(() => 'record-id') } as never,
	);

	return { service, inserted };
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
