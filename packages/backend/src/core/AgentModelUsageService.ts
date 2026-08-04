/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import type {
	AgentModelUsageLogsRepository,
	UserProfilesRepository,
} from '@/models/_.js';
import type { MiAgentModelUsageLog, AgentModelUsageStatus, AgentModelUsageKind } from '@/models/AgentModelUsageLog.js';
import type { MiMeta } from '@/models/Meta.js';
import type { MiUser } from '@/models/User.js';
import { AgentService } from '@/core/AgentService.js';
import { getEffectiveLlmModels, isAgentLlmPeakTimeBeijing } from '@/misc/agent-llm-models.js';

export type StartLogParams = {
	userId: MiUser['id'];
	sessionId?: string | null;
	characterId?: string | null;
	dialogueStyleId?: string | null;
	modelId: string | null;
	modelApiName: string | null;
	/** 主对话为 chat，压缩便签为 compression；省略时按 chat 写入 */
	usageKind?: AgentModelUsageKind;
};

export type FinishLogParams = {
	status: AgentModelUsageStatus;
	errorCode?: string | null;
	/** 以下 token 数一律取自 OpenAI 协议响应 usage 字段（计费权威来源，禁止本地估算） */
	promptTokens?: number | null;
	completionTokens?: number | null;
	promptCacheHitTokens?: number | null;
	promptCacheMissTokens?: number | null;
	costOverride?: number | null;
};

/**
 * 成本精度规则：保留 4 位小数，第 5 位起一律进一（ceil），保证扣费不会少扣（平台不亏本）。
 * 先 toFixed(9) 消除浮点尾噪，避免恰好 4 位小数的金额（如 0.0001）被浮点表示误差误进一。
 */
function ceilCostTo4Decimals(x: number): number {
	if (!Number.isFinite(x) || x <= 0) return 0;
	return Math.ceil(Number((x * 10_000).toFixed(9))) / 10_000;
}

/**
 * 统一维护智能体模型调用的使用日志：
 * - 记录每次调用的开始/结束时间、结果（成功/失败/中断）与扣费金额
 * - 成功与中断扣费；失败不扣费
 * - 供用户侧用量面板与管理端报表查询
 */
@Injectable()
export class AgentModelUsageService {
	constructor(
		@Inject(DI.agentModelUsageLogsRepository)
		private agentModelUsageLogsRepository: AgentModelUsageLogsRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private idService: IdService,
		private agentService: AgentService,
	) {}

	@bindThis
	public async startLog(params: StartLogParams): Promise<MiAgentModelUsageLog> {
		const row = await this.agentModelUsageLogsRepository.insertOne({
			id: this.idService.gen(),
			requestedAt: new Date(),
			completedAt: null,
			durationMs: null,
			userId: params.userId,
			sessionId: params.sessionId ?? null,
			characterId: params.characterId ?? null,
			dialogueStyleId: params.dialogueStyleId ?? null,
			modelId: params.modelId,
			modelApiName: params.modelApiName,
			usageKind: params.usageKind ?? 'chat',
			// 请求进行中：finishLog 结算时才更新为 success/failed/aborted，避免请求中误显示“成功”
			status: 'pending',
			errorCode: null,
			cost: 0,
			promptTokens: null,
			completionTokens: null,
		});
		return row;
	}

	/**
	 * 结算一条使用日志：按状态扣费并写入 completedAt。
	 * cost 与用户对会话解析出的模型及 LLM 调用一致（含默认模型）；失败（status=failed）不扣费。
	 * 每日免费额度：仅 success 消耗，所有 usageKind 共享同一模型的免费计数器。
	 */
	@bindThis
	public async finishLog(log: MiAgentModelUsageLog, instance: MiMeta, params: FinishLogParams): Promise<void> {
		const completedAt = new Date();
		const durationMs = Math.max(0, completedAt.getTime() - log.requestedAt.getTime());
		let cost = 0;
		if (params.status === 'success' || params.status === 'aborted') {
			if (typeof params.costOverride === 'number') {
				cost = Math.max(0, params.costOverride);
			} else if (log.usageKind === 'image_generation') {
				cost = Math.max(0, Number(instance.agentImageCostPerCall) || 0);
			} else {
				cost = this.resolveLlmCallCost(instance, log.modelId, params);
			}
		}

		// 每日免费额度：仅 success 消耗（aborted 不消耗），所有 usageKind 共享
		if (params.status === 'success' && cost > 0 && log.modelId) {
			const quota = this.resolveDailyFreeQuota(instance, log.modelId);
			if (quota > 0) {
				const dateKey = this.beijingDateKey(completedAt);
				const key = this.freeQuotaKey(log.userId, log.modelId, dateKey);
				const current = Number(await this.redisClient.get(key)) || 0;
				if (current < quota) {
					const ttl = this.secondsUntilNextBeijingMidnight(completedAt);
					const afterIncr = current + 1;
					await this.redisClient.set(key, String(afterIncr), 'EX', ttl);
					cost = 0;
					// 快照写入：记录调用时刻的免费额度使用情况，后续管理员修改配额不影响已有日志
					log.usedFreeQuota = true;
					log.freeQuotaUsedAtCall = afterIncr;
					log.freeQuotaTotalAtCall = quota;
				}
			}
		}

		log.completedAt = completedAt;
		log.durationMs = durationMs;
		log.status = params.status;
		log.errorCode = params.errorCode ?? null;
		log.cost = cost;
		if (params.promptTokens != null) log.promptTokens = params.promptTokens;
		if (params.completionTokens != null) log.completionTokens = params.completionTokens;
		if (params.promptCacheHitTokens != null) log.promptCacheHitTokens = params.promptCacheHitTokens;
		if (params.promptCacheMissTokens != null) log.promptCacheMissTokens = params.promptCacheMissTokens;
		await this.agentModelUsageLogsRepository.save(log);

		if (cost > 0) {
			// 允许余额为负；管理端可再充值或调整模型价格
			await this.userProfilesRepository.decrement({ userId: log.userId }, 'agentCreditBalance', cost);
		}
	}

	/**
	 * 模型调用可负担性预检（发信/压缩侧车/主动消息共用口径）：
	 * - 有剩余免费额度 → 可负担；
	 * - usage 按量模式：无法预知精确费用，仅要求余额 > 0（已欠费拒绝，单次结算允许扣成负数）；
	 * - per_call 按次模式：余额 >= 按次价。
	 */
	@bindThis
	public async canAffordModelCall(instance: MiMeta, modelId: string | null, userId: string): Promise<boolean> {
		if (await this.hasFreeQuotaRemaining(userId, modelId, instance)) return true;
		const billingMode = this.agentService.resolveModelBillingMode(instance, modelId);
		if (billingMode === 'usage') {
			const model = this.agentService.lookupAnyModelById(instance, modelId);
			const priced = model != null && (
				model.pricePerMillionInputCacheHitTokens > 0
				|| model.pricePerMillionInputCacheMissTokens > 0
				|| model.pricePerMillionOutputTokens > 0
				|| model.costPerCall > 0
			);
			if (!priced) return true;
			const profile = await this.userProfilesRepository.findOneBy({ userId });
			return (profile?.agentCreditBalance ?? 0) > 0;
		}
		const cost = this.agentService.getUserFacingModelCostPerCall(instance, modelId);
		if (cost <= 0) return true;
		const profile = await this.userProfilesRepository.findOneBy({ userId });
		return (profile?.agentCreditBalance ?? 0) >= cost;
	}

	// #region 计费解析

	/**
	 * 解析一次 LLM 调用的费用（不含免费额度与 costOverride，由 finishLog 统一处理）：
	 * - usage 模式且 usage 存在：三档单价 × token 数 ÷ 1e6（无缓存分段时全部输入按未命中价）；
	 * - usage 模式但 usage 缺失：回退 costPerCall 兜底；
	 * - per_call 模式：按次价格；
	 * - 峰谷定价：结算时刻处于高峰时段（北京时间 9:00～12:00 / 14:00～18:00）且模型配置了 peakPriceMultiplier 时，
	 *   所有计费项统一乘以倍率（与 DeepSeek 官方口径一致）。
	 */
	@bindThis
	private resolveLlmCallCost(instance: MiMeta, modelId: string | null, params: FinishLogParams): number {
		const model = modelId ? getEffectiveLlmModels(instance).find(m => m.id === modelId) : undefined;
		// 高峰倍率：仅当模型显式配置（>1）且结算时刻处于高峰时段时生效
		const peakMultiplier = model?.peakPriceMultiplier != null && model.peakPriceMultiplier > 1 && isAgentLlmPeakTimeBeijing()
			? model.peakPriceMultiplier
			: 1;
		if (model && model.billingMode === 'usage' && params.promptTokens != null && params.completionTokens != null) {
			const cacheHit = params.promptCacheHitTokens ?? 0;
			const cacheMiss = params.promptCacheMissTokens ?? Math.max(0, params.promptTokens - cacheHit);
			const raw = (cacheHit * model.pricePerMillionInputCacheHitTokens
				+ cacheMiss * model.pricePerMillionInputCacheMissTokens
				+ params.completionTokens * model.pricePerMillionOutputTokens) / 1_000_000;
			// 4 位小数进一法：第 5 位向上取整，保证不少扣
			return ceilCostTo4Decimals(raw * peakMultiplier);
		}
		const fallbackCost = this.agentService.getUserFacingModelCostPerCall(instance, modelId);
		return ceilCostTo4Decimals(fallbackCost * peakMultiplier);
	}

	// #endregion

	// #region 每日免费额度辅助方法

	/** 北京时间 yyyyMMdd */
	@bindThis
	private beijingDateKey(d: Date): string {
		const bj = new Date(d.getTime() + 8 * 3600_000);
		return bj.toISOString().slice(0, 10).replace(/-/g, '');
	}

	/** 当日剩余秒数（到次日 0:00 北京时间） */
	@bindThis
	private secondsUntilNextBeijingMidnight(now: Date): number {
		const bj = new Date(now.getTime() + 8 * 3600_000);
		const nextMidnightUtc = Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate() + 1) - 8 * 3600_000;
		return Math.max(1, Math.ceil((nextMidnightUtc - now.getTime()) / 1000));
	}

	@bindThis
	private freeQuotaKey(userId: string, modelId: string, dateKey: string): string {
		return `agent:freeQuota:${userId}:${modelId}:${dateKey}`;
	}

	/** 从 LLM / 生图模型配置中解析指定模型的每日免费额度 */
	@bindThis
	private resolveDailyFreeQuota(instance: MiMeta, modelId: string): number {
		const llm = getEffectiveLlmModels(instance).find(m => m.id === modelId);
		if (llm) return llm.dailyFreeQuota ?? 0;
		const img = (Array.isArray(instance.agentImageModels) ? instance.agentImageModels : []).find(m => m.id === modelId);
		if (img && typeof img.dailyFreeQuota === 'number') return Math.trunc(img.dailyFreeQuota);
		return 0;
	}

	/** 查询用户某模型当日已用免费次数（供 API 端点展示） */
	@bindThis
	public async getFreeQuotaUsed(userId: string, modelId: string): Promise<number> {
		const key = this.freeQuotaKey(userId, modelId, this.beijingDateKey(new Date()));
		const v = await this.redisClient.get(key);
		return v == null ? 0 : Number(v) || 0;
	}

	/** 判断用户某模型当日是否仍有剩余免费额度（供调用前余额预检查豁免） */
	@bindThis
	public async hasFreeQuotaRemaining(userId: string, modelId: string | null, instance: MiMeta): Promise<boolean> {
		if (!modelId) return false;
		const quota = this.resolveDailyFreeQuota(instance, modelId);
		if (quota <= 0) return false;
		const used = await this.getFreeQuotaUsed(userId, modelId);
		return used < quota;
	}

	// #endregion

	/**
	 * 返回指定用户最近 N 毫秒内的成功率与样本数。
	 * 供管理员用户列表侧展示健康度指示。
	 */
	@bindThis
	public async recentSuccessRate(userIds: MiUser['id'][], windowMs: number): Promise<Map<MiUser['id'], { total: number; success: number; failed: number; aborted: number }>> {
		const since = new Date(Date.now() - windowMs);
		const result = new Map<MiUser['id'], { total: number; success: number; failed: number; aborted: number }>();
		if (userIds.length === 0) return result;
		const rows = await this.agentModelUsageLogsRepository.createQueryBuilder('log')
			.select('log.userId', 'userId')
			.addSelect('log.status', 'status')
			.addSelect('COUNT(*)::int', 'count')
			.where('log.userId IN (:...userIds)', { userIds })
			.andWhere('log.requestedAt >= :since', { since })
			.groupBy('log.userId')
			.addGroupBy('log.status')
			.getRawMany<{ userId: string; status: AgentModelUsageStatus; count: number }>();
		for (const id of userIds) {
			result.set(id, { total: 0, success: 0, failed: 0, aborted: 0 });
		}
		for (const r of rows) {
			const bucket = result.get(r.userId);
			if (!bucket) continue;
			bucket.total += r.count;
			if (r.status === 'success') bucket.success = r.count;
			else if (r.status === 'failed') bucket.failed = r.count;
			else if (r.status === 'aborted') bucket.aborted = r.count;
		}
		return result;
	}

	/**
	 * 按单一用户的最近请求，查询分页使用记录。
	 * 仅统计模型调用请求（对话/压缩/生图/识图/主动消息），不含签到/补签流水。
	 */
	@bindThis
	public async listUserRecent(
		userId: MiUser['id'],
		opts: { limit: number; untilDate?: Date | null; offset?: number },
	): Promise<MiAgentModelUsageLog[]> {
		const qb = this.agentModelUsageLogsRepository.createQueryBuilder('log')
			.where('log.userId = :userId', { userId })
			.andWhere('log.usageKind != :checkinKind', { checkinKind: 'checkin' })
			.orderBy('log.requestedAt', 'DESC')
			.take(opts.limit)
			.offset(opts.offset ?? 0);
		if (opts.untilDate != null) {
			qb.andWhere('log.requestedAt < :until', { until: opts.untilDate });
		}
		return qb.getMany();
	}

	/** 统计用户请求日志总数（与 listUserRecent 一致，不含签到/补签），供分页使用 */
	@bindThis
	public async countUserLogs(userId: MiUser['id']): Promise<number> {
		return this.agentModelUsageLogsRepository.createQueryBuilder('log')
			.where('log.userId = :userId', { userId })
			.andWhere('log.usageKind != :checkinKind', { checkinKind: 'checkin' })
			.getCount();
	}

	/**
	 * 按模型维度聚合时间窗内请求数；供用户侧图表与管理端报表复用。
	 */
	@bindThis
	public async aggregateByModel(opts: { userId?: MiUser['id']; since: Date; until?: Date }): Promise<Array<{
		modelId: string | null;
		total: number;
		success: number;
		failed: number;
		aborted: number;
		totalCost: number;
	}>> {
		const qb = this.agentModelUsageLogsRepository.createQueryBuilder('log')
			.select('log.modelId', 'modelId')
			.addSelect('COUNT(*)::int', 'total')
			.addSelect('SUM(CASE WHEN log.status = \'success\' THEN 1 ELSE 0 END)::int', 'success')
			.addSelect('SUM(CASE WHEN log.status = \'failed\' THEN 1 ELSE 0 END)::int', 'failed')
			.addSelect('SUM(CASE WHEN log.status = \'aborted\' THEN 1 ELSE 0 END)::int', 'aborted')
			.addSelect('COALESCE(SUM(log.cost), 0)', 'totalCost')
			.where('log.requestedAt >= :since', { since: opts.since })
			// 签到奖励/补签消耗不属于模型费用，不计入费用汇总与模型统计
			.andWhere('log.usageKind != :checkinKind', { checkinKind: 'checkin' })
			// 按模型维度的聚合只统计有关联模型的记录，避免出现“—”行
			.andWhere('log.modelId IS NOT NULL')
			.groupBy('log.modelId');
		if (opts.userId != null) {
			qb.andWhere('log.userId = :uid', { uid: opts.userId });
		}
		if (opts.until != null) {
			qb.andWhere('log.requestedAt < :until', { until: opts.until });
		}
		const rows = await qb.getRawMany<{
			modelId: string | null;
			total: number;
			success: number;
			failed: number;
			aborted: number;
			totalCost: string | number;
		}>();
		return rows.map(r => ({
			modelId: r.modelId,
			total: Number(r.total) || 0,
			success: Number(r.success) || 0,
			failed: Number(r.failed) || 0,
			aborted: Number(r.aborted) || 0,
			totalCost: Number(r.totalCost) || 0,
		}));
	}

	/**
	 * 按模型维度统计时间窗内消耗每日免费额度的调用次数（usedFreeQuota=true）。
	 * 用于“近 30 天”跨度的免费次数报表，区别于 Redis 的当日计数。
	 */
	@bindThis
	public async countFreeQuotaByModel(opts: { userId?: MiUser['id']; since: Date; until?: Date }): Promise<Map<string, number>> {
		const qb = this.agentModelUsageLogsRepository.createQueryBuilder('log')
			.select('log.modelId', 'modelId')
			.addSelect('COUNT(*)::int', 'count')
			.where('log.requestedAt >= :since', { since: opts.since })
			.andWhere('log.usedFreeQuota = :used', { used: true })
			.andWhere('log.modelId IS NOT NULL')
			.groupBy('log.modelId');
		if (opts.userId != null) {
			qb.andWhere('log.userId = :uid', { uid: opts.userId });
		}
		if (opts.until != null) {
			qb.andWhere('log.requestedAt < :until', { until: opts.until });
		}
		const rows = await qb.getRawMany<{ modelId: string; count: number }>();
		return new Map(rows.map(r => [r.modelId, Number(r.count) || 0]));
	}

	/**
	 * 按角色维度聚合时间窗内会话使用次数。
	 */
	@bindThis
	public async aggregateByCharacter(opts: { userId?: MiUser['id']; since: Date; limit?: number; offset?: number }): Promise<Array<{ characterId: string; total: number }>> {
		const qb = this.agentModelUsageLogsRepository.createQueryBuilder('log')
			.select('log.characterId', 'characterId')
			.addSelect('COUNT(*)::int', 'total')
			.where('log.characterId IS NOT NULL')
			.andWhere('log.requestedAt >= :since', { since: opts.since })
			.groupBy('log.characterId')
			.orderBy('total', 'DESC')
			.limit(opts.limit ?? 10)
			.offset(opts.offset ?? 0);
		if (opts.userId != null) {
			qb.andWhere('log.userId = :uid', { uid: opts.userId });
		}
		const rows = await qb.getRawMany<{ characterId: string; total: number }>();
		return rows.map(r => ({ characterId: r.characterId, total: Number(r.total) || 0 }));
	}

	@bindThis
	public async countDistinctCharacters(opts: { userId?: MiUser['id']; since: Date }): Promise<number> {
		const qb = this.agentModelUsageLogsRepository.createQueryBuilder('log')
			.select('COUNT(DISTINCT log.characterId)::int', 'cnt')
			.where('log.characterId IS NOT NULL')
			.andWhere('log.requestedAt >= :since', { since: opts.since });
		if (opts.userId != null) {
			qb.andWhere('log.userId = :uid', { uid: opts.userId });
		}
		const row = await qb.getRawOne<{ cnt: number }>();
		return Number(row?.cnt) || 0;
	}

	/**
	 * 按风格维度聚合时间窗内会话使用次数。
	 */
	@bindThis
	public async aggregateByDialogueStyle(opts: { userId?: MiUser['id']; since: Date; limit?: number; offset?: number }): Promise<Array<{ dialogueStyleId: string; total: number }>> {
		const qb = this.agentModelUsageLogsRepository.createQueryBuilder('log')
			.select('log.dialogueStyleId', 'dialogueStyleId')
			.addSelect('COUNT(*)::int', 'total')
			.where('log.dialogueStyleId IS NOT NULL')
			.andWhere('log.requestedAt >= :since', { since: opts.since })
			.groupBy('log.dialogueStyleId')
			.orderBy('total', 'DESC')
			.limit(opts.limit ?? 10)
			.offset(opts.offset ?? 0);
		if (opts.userId != null) {
			qb.andWhere('log.userId = :uid', { uid: opts.userId });
		}
		const rows = await qb.getRawMany<{ dialogueStyleId: string; total: number }>();
		return rows.map(r => ({ dialogueStyleId: r.dialogueStyleId, total: Number(r.total) || 0 }));
	}

	@bindThis
	public async countDistinctDialogueStyles(opts: { userId?: MiUser['id']; since: Date }): Promise<number> {
		const qb = this.agentModelUsageLogsRepository.createQueryBuilder('log')
			.select('COUNT(DISTINCT log.dialogueStyleId)::int', 'cnt')
			.where('log.dialogueStyleId IS NOT NULL')
			.andWhere('log.requestedAt >= :since', { since: opts.since });
		if (opts.userId != null) {
			qb.andWhere('log.userId = :uid', { uid: opts.userId });
		}
		const row = await qb.getRawOne<{ cnt: number }>();
		return Number(row?.cnt) || 0;
	}

	/**
	 * 按时间窗求总体统计，供管理端报表卡片。
	 */
	@bindThis
	public async overallStats(opts: { since: Date; until?: Date }): Promise<{
		total: number;
		success: number;
		failed: number;
		aborted: number;
		totalCost: number;
		uniqueUsers: number;
	}> {
		const qb = this.agentModelUsageLogsRepository.createQueryBuilder('log')
			.select('COUNT(*)::int', 'total')
			.addSelect('SUM(CASE WHEN log.status = \'success\' THEN 1 ELSE 0 END)::int', 'success')
			.addSelect('SUM(CASE WHEN log.status = \'failed\' THEN 1 ELSE 0 END)::int', 'failed')
			.addSelect('SUM(CASE WHEN log.status = \'aborted\' THEN 1 ELSE 0 END)::int', 'aborted')
			.addSelect('COALESCE(SUM(log.cost), 0)', 'totalCost')
			.addSelect('COUNT(DISTINCT log.userId)::int', 'uniqueUsers')
			.where('log.requestedAt >= :since', { since: opts.since });
		if (opts.until != null) {
			qb.andWhere('log.requestedAt < :until', { until: opts.until });
		}
		const row = await qb.getRawOne<{ total: number; success: number; failed: number; aborted: number; totalCost: string | number; uniqueUsers: number }>();
		return {
			total: Number(row?.total) || 0,
			success: Number(row?.success) || 0,
			failed: Number(row?.failed) || 0,
			aborted: Number(row?.aborted) || 0,
			totalCost: Number(row?.totalCost) || 0,
			uniqueUsers: Number(row?.uniqueUsers) || 0,
		};
	}

	/**
	 * 近 24 小时按小时分桶的请求与状态分布，供管理端报表折线图。
	 */
	@bindThis
	public async hourlyBuckets(opts: { since: Date; until?: Date }): Promise<Array<{ bucketStart: string; total: number; success: number; failed: number; aborted: number }>> {
		const qb = this.agentModelUsageLogsRepository.createQueryBuilder('log')
			.select('date_trunc(\'hour\', log.requestedAt)', 'bucketstart')
			.addSelect('COUNT(*)::int', 'total')
			.addSelect('SUM(CASE WHEN log.status = \'success\' THEN 1 ELSE 0 END)::int', 'success')
			.addSelect('SUM(CASE WHEN log.status = \'failed\' THEN 1 ELSE 0 END)::int', 'failed')
			.addSelect('SUM(CASE WHEN log.status = \'aborted\' THEN 1 ELSE 0 END)::int', 'aborted')
			.where('log.requestedAt >= :since', { since: opts.since })
			.groupBy('bucketstart')
			.orderBy('bucketstart', 'ASC');
		if (opts.until != null) {
			qb.andWhere('log.requestedAt < :until', { until: opts.until });
		}
		const rows = await qb.getRawMany<{ bucketstart: Date; total: number; success: number; failed: number; aborted: number }>();
		return rows.map(r => ({
			bucketStart: r.bucketstart instanceof Date ? r.bucketstart.toISOString() : String(r.bucketstart),
			total: Number(r.total) || 0,
			success: Number(r.success) || 0,
			failed: Number(r.failed) || 0,
			aborted: Number(r.aborted) || 0,
		}));
	}
}
