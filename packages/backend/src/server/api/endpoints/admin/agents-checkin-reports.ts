/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { AgentCheckinRecordsRepository } from '@/models/_.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireAdmin: true,
	secure: true,
	kind: 'read:admin',
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
		yearMonth: { type: 'string', nullable: true },
		userId: { type: 'string', nullable: true },
		dateFrom: { type: 'string', nullable: true },
		dateTo: { type: 'string', nullable: true },
		page: { type: 'integer', nullable: true, minimum: 1 },
		limit: { type: 'integer', nullable: true, minimum: 1, maximum: 100 },
	},
	required: [],
} as const;

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

			// === Overview ===
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
			const todayReward = Math.round(Number(todayRow?.reward ?? 0) * 100) / 100;
			const todayUsers = Number(todayRow?.users ?? 0);

			const monthRow = await this.agentCheckinRecordsRepository
				.createQueryBuilder('r')
				.select('COALESCE(SUM(r.reward), 0)', 'reward')
				.addSelect('COUNT(DISTINCT r.userId)', 'users')
				.where('r.date LIKE :prefix', { prefix: `${thisMonth}%` })
				.andWhere('r.isMakeup = false')
				.getRawOne();
			const monthReward = Math.round(Number(monthRow?.reward ?? 0) * 100) / 100;
			const monthUsers = Number(monthRow?.users ?? 0);

			const makeupRow = await this.agentCheckinRecordsRepository
				.createQueryBuilder('r')
				.select('COALESCE(SUM(r.makeupCost), 0)', 'total')
				.where('r.isMakeup = true')
				.getRawOne();
			const totalMakeupCost = Math.round(Number(makeupRow?.total ?? 0) * 100) / 100;

			// === Daily stats (当月每日汇总) ===
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
			const dailyStats = dailyStatsRaw.map(d => ({
				date: d.date,
				totalReward: Math.round(Number(d.totalReward) * 100) / 100,
				userCount: Number(d.userCount),
			}));

			// === Trend (最近30天，补全所有日期) ===
			const trendStart = new Date(bjNow.getTime() - 29 * 86400_000).toISOString().slice(0, 10);
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
			const trend: { date: string; totalReward: number; userCount: number }[] = [];
			for (let i = 29; i >= 0; i--) {
				const dStr = new Date(bjNow.getTime() - i * 86400_000).toISOString().slice(0, 10);
				const stat = trendMap.get(dStr);
				trend.push({ date: dStr, totalReward: stat?.totalReward ?? 0, userCount: stat?.userCount ?? 0 });
			}

			// === Top users (累计 TOP 10) ===
			const topUsersRaw = await this.agentCheckinRecordsRepository
				.createQueryBuilder('r')
				.select('r.userId', 'userId')
				.addSelect('SUM(r.reward)', 'totalReward')
				.addSelect('COUNT(*)', 'checkinCount')
				.where('r.isMakeup = false')
				.groupBy('r.userId')
				.orderBy('SUM(r.reward)', 'DESC')
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
			const topUsers = topUsersRaw.map(u => ({
				userId: u.userId,
				username: usernameMap.get(u.userId) ?? u.userId,
				totalReward: Math.round(Number(u.totalReward) * 100) / 100,
				checkinCount: Number(u.checkinCount),
			}));

			// === Records (分页明细) ===
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
				createdAt: r.createdAt.toISOString(),
			}));

			return {
				overview: { totalReward, todayReward, todayUsers, monthReward, monthUsers, totalMakeupCost },
				dailyStats,
				trend,
				topUsers,
				records,
				totalCount,
			};
		});
	}
}
