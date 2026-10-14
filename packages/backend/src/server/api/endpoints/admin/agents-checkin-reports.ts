/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { AgentCheckinRecordsRepository } from '@/models/_.js';
import { MemoryKVCache } from '@/misc/cache.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireAdmin: true,
	secure: true,
	kind: 'read:admin',
	// 总览/趋势/Top 均为全表聚合（虽有缓存兜底），限流避免被连续刷
	limit: { duration: ms('1min'), max: 30 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			overview: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					totalReward: { type: 'number' },
					todayReward: { type: 'number' },
					todayUsers: { type: 'integer' },
					monthReward: { type: 'number' },
					monthUsers: { type: 'integer' },
					totalMakeupCost: { type: 'number' },
				},
			},
			dailyStats: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						date: { type: 'string' },
						totalReward: { type: 'number' },
						userCount: { type: 'integer' },
					},
				},
			},
			trend: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						date: { type: 'string' },
						totalReward: { type: 'number' },
						userCount: { type: 'integer' },
					},
				},
			},
			topUsers: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						userId: { type: 'string' },
						username: { type: 'string' },
						totalReward: { type: 'number' },
						checkinCount: { type: 'integer' },
					},
				},
			},
			records: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						userId: { type: 'string' },
						username: { type: 'string' },
						date: { type: 'string' },
						reward: { type: 'number' },
						baseValue: { type: 'number' },
						streakMultiplier: { type: 'number' },
						roleMultiplier: { type: 'number' },
						dayMultiplier: { type: 'number' },
						isMakeup: { type: 'boolean' },
						makeupCost: { type: 'number', nullable: true },
						makeupSource: { type: 'string', nullable: true, enum: ['user', 'admin'] },
						createdAt: { type: 'string' },
					},
				},
			},
			totalCount: { type: 'integer' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		yearMonth: { type: 'string', nullable: true, minLength: 7, maxLength: 7, pattern: '^[0-9]{4}-[0-9]{2}$' },
		userId: { type: 'string', nullable: true, minLength: 1, maxLength: 32 },
		dateFrom: { type: 'string', nullable: true, minLength: 10, maxLength: 10, pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
		dateTo: { type: 'string', nullable: true, minLength: 10, maxLength: 10, pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
		page: { type: 'integer', nullable: true, minimum: 1 },
		limit: { type: 'integer', nullable: true, minimum: 1, maximum: 100 },
	},
	required: [],
} as const;

type CheckinOverview = {
	totalReward: number;
	todayReward: number;
	todayUsers: number;
	monthReward: number;
	monthUsers: number;
	totalMakeupCost: number;
};

type CheckinDailyStat = {
	date: string;
	totalReward: number;
	userCount: number;
};

type CheckinTopUser = {
	userId: string;
	username: string;
	totalReward: number;
	checkinCount: number;
};

// 7 个聚合里大半是全表扫描（累计奖励 / 累计补签成本 / 全历史 Top），报告允许分钟级滞后：
// 短 TTL 进程内缓存 + 按日期/月份分键，保留全历史口径的同时把常规刷新压到一次聚合
const AGGREGATE_CACHE_TTL = ms('5min');
const overviewCache = new MemoryKVCache<CheckinOverview>(AGGREGATE_CACHE_TTL);
const dailyStatsCache = new MemoryKVCache<CheckinDailyStat[]>(AGGREGATE_CACHE_TTL);
const trendCache = new MemoryKVCache<CheckinDailyStat[]>(AGGREGATE_CACHE_TTL);
const topUsersCache = new MemoryKVCache<CheckinTopUser[]>(AGGREGATE_CACHE_TTL);

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCheckinRecordsRepository)
		private agentCheckinRecordsRepository: AgentCheckinRecordsRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			const now = new Date();
			const bjNow = new Date(now.getTime() + 8 * 3600_000);
			const today = bjNow.toISOString().slice(0, 10);
			const thisMonth = today.slice(0, 7);
			const yearMonth = ps.yearMonth ?? thisMonth;

			const overview = await overviewCache.fetch(today, async () => await this.computeOverview(today, thisMonth));
			const dailyStats = await dailyStatsCache.fetch(yearMonth, async () => await this.computeDailyStats(yearMonth));
			const trend = await trendCache.fetch(`${today}`, async () => await this.computeTrend(bjNow.getTime()));
			const topUsers = await topUsersCache.fetch('top', async () => await this.computeTopUsers());

			// === Records (分页明细，不走缓存) ===
			const page = ps.page ?? 1;
			const limit = ps.limit ?? 20;
			const qb = this.agentCheckinRecordsRepository
				.createQueryBuilder('r')
				.innerJoin('r.user', 'u')
				.addSelect('u.username', 'username');

			if (ps.userId) {
				qb.andWhere('r.userId = :userId', { userId: ps.userId });
			}
			if (ps.dateFrom) {
				qb.andWhere('r.date >= :dateFrom', { dateFrom: ps.dateFrom });
			}
			if (ps.dateTo) {
				qb.andWhere('r.date <= :dateTo', { dateTo: ps.dateTo });
			}
			if (!ps.userId && !ps.dateFrom && !ps.dateTo) {
				// 默认显示当月
				qb.andWhere('r.date LIKE :prefix', { prefix: `${yearMonth}%` });
			}

			const totalCount = await qb.getCount();
			const rawRecords = await qb
				.orderBy('r.date', 'DESC')
				.addOrderBy('r.createdAt', 'DESC')
				.addOrderBy('r.id', 'DESC')
				.offset((page - 1) * limit)
				.limit(limit)
				.getRawAndEntities();

			const records = rawRecords.entities.map((r, i) => ({
				userId: r.userId,
				username: (rawRecords.raw[i] as any)?.username ?? r.userId,
				date: r.date,
				reward: r.reward,
				baseValue: r.baseValue,
				streakMultiplier: r.streakMultiplier,
				roleMultiplier: r.roleMultiplier,
				dayMultiplier: r.dayMultiplier,
				isMakeup: r.isMakeup,
				makeupCost: r.makeupCost,
				makeupSource: r.makeupSource,
				createdAt: r.createdAt.toISOString(),
			}));

			return {
				overview,
				dailyStats,
				trend,
				topUsers,
				records,
				totalCount,
			};
		});
	}

	private async computeOverview(today: string, thisMonth: string): Promise<CheckinOverview> {
		const totalRewardRow = await this.agentCheckinRecordsRepository
			.createQueryBuilder('r')
			.select('COALESCE(SUM(r.reward), 0)', 'total')
			.where('r.isMakeup = false')
			.getRawOne();
		const totalReward = Math.round(Number(totalRewardRow?.total ?? 0) * 100) / 100;

		const todayRow = await this.agentCheckinRecordsRepository
			.createQueryBuilder('r')
			.select('COALESCE(SUM(r.reward), 0)', 'reward')
			.addSelect('COUNT(DISTINCT r.userId)', 'users')
			.where('r.date = :today', { today })
			.andWhere('r.isMakeup = false')
			.getRawOne();

		const monthRow = await this.agentCheckinRecordsRepository
			.createQueryBuilder('r')
			.select('COALESCE(SUM(r.reward), 0)', 'reward')
			.addSelect('COUNT(DISTINCT r.userId)', 'users')
			.where('r.date LIKE :prefix', { prefix: `${thisMonth}%` })
			.andWhere('r.isMakeup = false')
			.getRawOne();

		const makeupRow = await this.agentCheckinRecordsRepository
			.createQueryBuilder('r')
			.select('COALESCE(SUM(r.makeupCost), 0)', 'total')
			.where('r.isMakeup = true')
			.getRawOne();

		return {
			totalReward,
			todayReward: Math.round(Number(todayRow?.reward ?? 0) * 100) / 100,
			todayUsers: Number(todayRow?.users ?? 0),
			monthReward: Math.round(Number(monthRow?.reward ?? 0) * 100) / 100,
			monthUsers: Number(monthRow?.users ?? 0),
			totalMakeupCost: Math.round(Number(makeupRow?.total ?? 0) * 100) / 100,
		};
	}

	private async computeDailyStats(yearMonth: string): Promise<CheckinDailyStat[]> {
		const dailyStatsRaw = await this.agentCheckinRecordsRepository
			.createQueryBuilder('r')
			.select('r.date', 'date')
			.addSelect('SUM(r.reward)', 'totalReward')
			.addSelect('COUNT(DISTINCT r.userId)', 'userCount')
			.where('r.date LIKE :prefix', { prefix: `${yearMonth}%` })
			.andWhere('r.isMakeup = false')
			.groupBy('r.date')
			.orderBy('r.date', 'ASC')
			.getRawMany();
		return dailyStatsRaw.map(d => ({
			date: d.date,
			totalReward: Math.round(Number(d.totalReward) * 100) / 100,
			userCount: Number(d.userCount),
		}));
	}

	private async computeTrend(bjNowMs: number): Promise<CheckinDailyStat[]> {
		const trendStartMs = bjNowMs - 29 * 86400_000;
		const trendStart = new Date(trendStartMs).toISOString().slice(0, 10);
		const trendRaw = await this.agentCheckinRecordsRepository
			.createQueryBuilder('r')
			.select('r.date', 'date')
			.addSelect('SUM(r.reward)', 'totalReward')
			.addSelect('COUNT(DISTINCT r.userId)', 'userCount')
			.where('r.date >= :from', { from: trendStart })
			.andWhere('r.isMakeup = false')
			.groupBy('r.date')
			.orderBy('r.date', 'ASC')
			.getRawMany();
		const trendMap = new Map<string, { totalReward: number; userCount: number }>();
		for (const d of trendRaw) {
			trendMap.set(d.date, {
				totalReward: Math.round(Number(d.totalReward) * 100) / 100,
				userCount: Number(d.userCount),
			});
		}
		// 补全30天中无数据的日期为0，确保图表连续完整
		const trend: CheckinDailyStat[] = [];
		for (let i = 0; i < 30; i++) {
			const dStr = new Date(trendStartMs + i * 86400_000).toISOString().slice(0, 10);
			const stat = trendMap.get(dStr);
			trend.push({ date: dStr, totalReward: stat?.totalReward ?? 0, userCount: stat?.userCount ?? 0 });
		}
		return trend;
	}

	private async computeTopUsers(): Promise<CheckinTopUser[]> {
		const topUsersRaw = await this.agentCheckinRecordsRepository
			.createQueryBuilder('r')
			.select('r.userId', 'userId')
			.addSelect('SUM(r.reward)', 'totalReward')
			.addSelect('COUNT(*)', 'checkinCount')
			.where('r.isMakeup = false')
			.groupBy('r.userId')
			.orderBy('SUM(r.reward)', 'DESC')
			.addOrderBy('r.userId', 'ASC')
			.limit(10)
			.getRawMany();
		const topUserIds = topUsersRaw.map(u => u.userId);
		let usernameMap = new Map<string, string>();
		if (topUserIds.length > 0) {
			const userRows = await this.agentCheckinRecordsRepository
				.createQueryBuilder('r')
				.innerJoin('r.user', 'u')
				.select('r.userId', 'userId')
				.addSelect('u.username', 'username')
				.where('r.userId IN (:...ids)', { ids: topUserIds })
				.groupBy('r.userId')
				.addGroupBy('u.username')
				.getRawMany();
			usernameMap = new Map(userRows.map(u => [u.userId, u.username]));
		}
		return topUsersRaw.map(u => ({
			userId: u.userId,
			username: usernameMap.get(u.userId) ?? u.userId,
			totalReward: Math.round(Number(u.totalReward) * 100) / 100,
			checkinCount: Number(u.checkinCount),
		}));
	}
}
