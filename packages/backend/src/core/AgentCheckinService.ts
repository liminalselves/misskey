/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import type {
	AgentCheckinRecordsRepository,
	AgentModelUsageLogsRepository,
	RoleAssignmentsRepository,
	RolesRepository,
	UserProfilesRepository,
} from '@/models/_.js';
import type { MiAgentCheckinRecord } from '@/models/AgentCheckinRecord.js';
import type { AgentCheckinSettings } from '@/models/Meta.js';
import type { MiMeta } from '@/models/Meta.js';
import type { MiUser } from '@/models/User.js';

export const DEFAULT_CHECKIN_SETTINGS: AgentCheckinSettings = {
	enabled: true,
	streakMaxDays: 365,
	streakMaxMultiplier: 2.0,
	specialDayMultiplier: 2.0,
	specialDays: ['01-01', '02-14', '05-01', '10-01', '12-25'],
	roleMultipliers: {},
	makeupEnabled: true,
	makeupMaxPerMonth: 3,
	makeupBaseCost: 20,
	makeupCostIncrement: 10,
	makeupAllowedWindowDays: 7,
};

export type CheckinResult = {
	alreadyCheckedIn: boolean;
	reward: number;
	streak: number;
	baseValue: number;
	streakMultiplier: number;
	roleMultiplier: number;
	dayMultiplier: number;
};

@Injectable()
export class AgentCheckinService {
	constructor(
		@Inject(DI.agentCheckinRecordsRepository)
		private checkinRecordsRepository: AgentCheckinRecordsRepository,

		@Inject(DI.agentModelUsageLogsRepository)
		private agentModelUsageLogsRepository: AgentModelUsageLogsRepository,

		@Inject(DI.roleAssignmentsRepository)
		private roleAssignmentsRepository: RoleAssignmentsRepository,

		@Inject(DI.rolesRepository)
		private rolesRepository: RolesRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private idService: IdService,
	) {}

	@bindThis
	public resolveSettings(instance: MiMeta): AgentCheckinSettings {
		return { ...DEFAULT_CHECKIN_SETTINGS, ...(instance.agentCheckinSettings ?? {}) };
	}

	/** 北京时间 yyyy-MM-dd */
	@bindThis
	public beijingDateStr(d: Date): string {
		const bj = new Date(d.getTime() + 8 * 3600_000);
		return bj.toISOString().slice(0, 10);
	}

	/** 北京时间 MM-DD */
	@bindThis
	private beijingMMDD(d: Date): string {
		return this.beijingDateStr(d).slice(5);
	}

	/** 加权随机基础额度：1~1.5(50%), 1.5~2(40%), 2~3(10%) */
	@bindThis
	private weightedRandomBase(): number {
		const r = Math.random();
		let val: number;
		if (r < 0.5) {
			val = 1.0 + Math.random() * 0.5; // 1.00 ~ 1.50
		} else if (r < 0.9) {
			val = 1.5 + Math.random() * 0.5; // 1.50 ~ 2.00
		} else {
			val = 2.0 + Math.random() * 1.0; // 2.00 ~ 3.00
		}
		return Math.round(val * 100) / 100;
	}

	/** 连续倍率：1 + min(streak, maxDays) / maxDays × (maxMultiplier - 1) */
	@bindThis
	private calcStreakMultiplier(streak: number, settings: AgentCheckinSettings): number {
		const ratio = Math.min(streak, settings.streakMaxDays) / settings.streakMaxDays;
		return 1 + ratio * (settings.streakMaxMultiplier - 1);
	}

	/** 身份组倍率：取用户所属角色中配置的最高倍率（从角色实体的 checkinMultiplier 字段读取） */
	@bindThis
	private async resolveRoleMultiplier(userId: MiUser['id'], settings: AgentCheckinSettings): Promise<number> {
		const assignments = await this.roleAssignmentsRepository.findBy({ userId });
		if (assignments.length === 0) return 1.0;
		const roleIds = assignments.map(a => a.roleId);
		const roles = await this.rolesRepository.findBy({ id: In(roleIds) });
		let max = 1.0;
		for (const r of roles) {
			if (typeof r.checkinMultiplier === 'number' && r.checkinMultiplier > max) {
				max = r.checkinMultiplier;
			}
		}
		return max;
	}

	/** 计算当前连续签到天数（从 checkDate 向前逐日检查） */
	@bindThis
	public async calcStreak(userId: MiUser['id'], checkDate: string): Promise<number> {
		// 取最近 400 天记录（覆盖 365 + 余量）
		const records = await this.checkinRecordsRepository.find({
			where: { userId },
			order: { date: 'DESC' },
			take: 400,
			select: ['date'],
		});
		const dateSet = new Set(records.map(r => r.date));
		let streak = 0;
		const d = new Date(checkDate + 'T00:00:00+08:00');
		for (let i = 0; i < 400; i++) {
			const key = this.beijingDateStr(d);
			if (dateSet.has(key)) {
				streak++;
				d.setTime(d.getTime() - 86400_000);
			} else {
				break;
			}
		}
		return streak;
	}

	/** 执行签到（幂等） */
	@bindThis
	public async performCheckin(userId: MiUser['id'], instance: MiMeta): Promise<CheckinResult> {
		const settings = this.resolveSettings(instance);
		const now = new Date();
		const today = this.beijingDateStr(now);

		// 幂等检查
		const existing = await this.checkinRecordsRepository.findOneBy({ userId, date: today });
		if (existing) {
			return {
				alreadyCheckedIn: true,
				reward: existing.reward,
				streak: existing.streakAtCheckin,
				baseValue: existing.baseValue,
				streakMultiplier: existing.streakMultiplier,
				roleMultiplier: existing.roleMultiplier,
				dayMultiplier: existing.dayMultiplier,
			};
		}

		// 计算各因子
		const baseValue = this.weightedRandomBase();
		// streak: 先算「截至昨天」的连续天数，+1 得到今天
		const streakUntilYesterday = await this.calcStreak(userId, this.beijingDateStr(new Date(now.getTime() - 86400_000)));
		const streak = streakUntilYesterday + 1;
		const streakMultiplier = Math.round(this.calcStreakMultiplier(streak, settings) * 100) / 100;
		const roleMultiplier = await this.resolveRoleMultiplier(userId, settings);
		const dayMultiplier = settings.specialDays.includes(this.beijingMMDD(now)) ? settings.specialDayMultiplier : 1.0;

		const reward = Math.round(baseValue * streakMultiplier * roleMultiplier * dayMultiplier * 100) / 100;

		// 写入签到记录
		await this.checkinRecordsRepository.insertOne({
			id: this.idService.gen(),
			userId,
			date: today,
			reward,
			streakAtCheckin: streak,
			baseValue,
			streakMultiplier,
			roleMultiplier,
			dayMultiplier,
			isMakeup: false,
			makeupCost: null,
			createdAt: now,
		});

		// 入账额度
		await this.userProfilesRepository.increment({ userId }, 'agentCreditBalance', reward);

		// 写入消费日志（usageKind='checkin'，cost 为负数表示收入）
		await this.agentModelUsageLogsRepository.insertOne({
			id: this.idService.gen(),
			requestedAt: now,
			completedAt: now,
			durationMs: 0,
			userId,
			sessionId: null,
			characterId: null,
			dialogueStyleId: null,
			modelId: null,
			modelApiName: null,
			usageKind: 'checkin',
			status: 'success',
			errorCode: null,
			cost: -reward,
			promptTokens: null,
			completionTokens: null,
		});

		return { alreadyCheckedIn: false, reward, streak, baseValue, streakMultiplier, roleMultiplier, dayMultiplier };
	}

	/** 补签 */
	@bindThis
	public async performMakeup(userId: MiUser['id'], date: string, instance: MiMeta): Promise<{ ok: true; cost: number } | { ok: false; reason: string }> {
		const settings = this.resolveSettings(instance);
		if (!settings.makeupEnabled) return { ok: false, reason: '补签功能未开启' };

		const now = new Date();
		const today = this.beijingDateStr(now);

		// 校验日期在回溯窗口内
		const target = new Date(date + 'T00:00:00+08:00');
		const diffDays = Math.floor((new Date(today + 'T00:00:00+08:00').getTime() - target.getTime()) / 86400_000);
		if (diffDays < 1 || diffDays > settings.makeupAllowedWindowDays) {
			return { ok: false, reason: `只能补签最近 ${settings.makeupAllowedWindowDays} 天内的日期` };
		}

		// 不能补今天
		if (date >= today) return { ok: false, reason: '不能补签今天或未来的日期' };

		// 检查是否已签到
		const existing = await this.checkinRecordsRepository.findOneBy({ userId, date });
		if (existing) return { ok: false, reason: '该日期已签到' };

		// 本月补签次数
		const monthPrefix = today.slice(0, 7); // yyyy-MM
		const monthMakeups = await this.checkinRecordsRepository.countBy({ userId, isMakeup: true });
		// 精确统计本月补签
		const monthRecords = await this.checkinRecordsRepository.createQueryBuilder('r')
			.where('r.userId = :userId', { userId })
			.andWhere('r.isMakeup = true')
			.andWhere('r.date LIKE :prefix', { prefix: `${monthPrefix}%` })
			.getCount();
		if (monthRecords >= settings.makeupMaxPerMonth) {
			return { ok: false, reason: `本月补签次数已达上限（${settings.makeupMaxPerMonth} 次）` };
		}

		// 计算消耗
		const cost = settings.makeupBaseCost + monthRecords * settings.makeupCostIncrement;

		// 检查余额
		const profile = await this.userProfilesRepository.findOneBy({ userId });
		if ((profile?.agentCreditBalance ?? 0) < cost) {
			return { ok: false, reason: `余额不足（需要 ${cost} 额度）` };
		}

		// 扣减余额
		await this.userProfilesRepository.decrement({ userId }, 'agentCreditBalance', cost);

		// 写入消费日志（补签扣费，cost 为正数表示支出）
		await this.agentModelUsageLogsRepository.insertOne({
			id: this.idService.gen(),
			requestedAt: now,
			completedAt: now,
			durationMs: 0,
			userId,
			sessionId: null,
			characterId: null,
			dialogueStyleId: null,
			modelId: null,
			modelApiName: null,
			usageKind: 'checkin',
			status: 'success',
			errorCode: null,
			cost: cost,
			promptTokens: null,
			completionTokens: null,
		});

		// 写入补签记录
		await this.checkinRecordsRepository.insertOne({
			id: this.idService.gen(),
			userId,
			date,
			reward: 0,
			streakAtCheckin: 0, // 补签后 streak 由前端重新查询
			baseValue: 0,
			streakMultiplier: 1,
			roleMultiplier: 1,
			dayMultiplier: 1,
			isMakeup: true,
			makeupCost: cost,
			createdAt: now,
		});

		return { ok: true, cost };
	}

	/** 查询月度签到状态 */
	@bindThis
	public async getMonthStatus(userId: MiUser['id'], yearMonth: string, instance: MiMeta) {
		const settings = this.resolveSettings(instance);
		const now = new Date();
		const today = this.beijingDateStr(now);

		const records = await this.checkinRecordsRepository.find({
			where: { userId },
			order: { date: 'DESC' },
			take: 400,
		});

		const todayCheckedIn = records.some(r => r.date === today);
		const streak = todayCheckedIn
			? await this.calcStreak(userId, today)
			: await this.calcStreak(userId, this.beijingDateStr(new Date(now.getTime() - 86400_000)));

		const monthRecords = records.filter(r => r.date.startsWith(yearMonth));
		const monthCount = monthRecords.length;
		const totalEarned = records.reduce((s, r) => s + r.reward, 0);

		// 本月补签次数
		const monthMakeupCount = monthRecords.filter(r => r.isMakeup).length;
		const makeupRemaining = Math.max(0, settings.makeupMaxPerMonth - monthMakeupCount);

		return {
			todayCheckedIn,
			streak,
			monthRecords: monthRecords.map(r => ({
				date: r.date,
				reward: r.reward,
				isMakeup: r.isMakeup,
				baseValue: r.baseValue,
				streakMultiplier: r.streakMultiplier,
				roleMultiplier: r.roleMultiplier,
				dayMultiplier: r.dayMultiplier,
				makeupCost: r.makeupCost,
				createdAt: r.createdAt.toISOString(),
			})),
			monthCount,
			totalEarned: Math.round(totalEarned * 100) / 100,
			makeupRemainingThisMonth: makeupRemaining,
			nextMakeupCost: settings.makeupBaseCost + monthMakeupCount * settings.makeupCostIncrement,
		};
	}
}
