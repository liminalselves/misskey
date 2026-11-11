/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import type {
	AgentModelUsageLogsRepository,
	UserProfilesRepository,
} from '@/models/_.js';
import { MiAgentModelUsageLog } from '@/models/AgentModelUsageLog.js';
import type { AgentModelUsageStatus, AgentModelUsageKind } from '@/models/AgentModelUsageLog.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import type { MiMeta } from '@/models/Meta.js';
import type { MiUser } from '@/models/User.js';
import { AgentService } from '@/core/AgentService.js';
import { isAgentUserModelId } from '@/core/AgentUserModelService.js';
import { getEffectiveLlmModels, isAgentLlmPeakTimeBeijing } from '@/misc/agent-llm-models.js';

/** Non-model credits must be excluded from model-call reports and cost totals. */
export const nonModelUsageKinds: AgentModelUsageKind[] = ['checkin', 'admin_reward', 'admin_compensation', 'credit_migration'];

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
	private readonly logger = new Logger(AgentModelUsageService.name);

	constructor(
		@Inject(DI.agentModelUsageLogsRepository)
		private agentModelUsageLogsRepository: AgentModelUsageLogsRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.db)
		private db: DataSource,

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
	 *
	 * 原子性与幂等：
	 * - 日志结算与余额扣费在同一 DB 事务（任一失败整体回滚，不再出现“已扣费无日志/有日志未扣费”）；
	 * - 结算用 `status='pending'` 条件更新，重试/并发的重复 finishLog 只会命中 0 行，不重复扣费；
	 * - 免费额度 INCR+EXPIRE 用 Lua 原子执行（分两条命令时，两命令间崩溃会留下永不过期的计数键）；
	 * - DB 结算失败或未命中（已结算过）时补偿 DECR，归还本次占用的免费额度位。
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
		if (!Number.isFinite(cost)) throw new Error('Invalid agent model cost');
		let quotaConsumedKey: string | null = null;
		let freeQuotaUsedAtCall: number | null = null;
		let freeQuotaTotalAtCall: number | null = null;
		if (params.status === 'success' && cost > 0 && log.modelId) {
			const quota = this.resolveDailyFreeQuota(instance, log.modelId);
			if (quota > 0) {
				const dateKey = this.beijingDateKey(completedAt);
				const key = this.freeQuotaKey(log.userId, log.modelId, dateKey);
				const ttl = this.secondsUntilNextBeijingMidnight(completedAt);
				// INCR 与 EXPIRE 原子执行：分两条命令时 INCR 后崩溃会留下永不过期的计数键；
				// 每次 INCR 都刷新 TTL（到下一个北京时间 0 点），也能自愈历史遗留的无 TTL 键
				const afterIncr = (await this.redisClient.eval(`
					local v = redis.call('INCR', KEYS[1])
					redis.call('EXPIRE', KEYS[1], ARGV[1])
					return v
				`, 1, key, ttl)) as number;
				if (afterIncr <= quota) {
					cost = 0;
					// 快照写入：记录调用时刻的免费额度使用情况，后续管理员修改配额不影响已有日志
					freeQuotaUsedAtCall = afterIncr;
					freeQuotaTotalAtCall = quota;
					quotaConsumedKey = key;
				} else {
					// 本次调用不免费：回滚计数，额度位置留给后续真正命中的调用
					await this.redisClient.decr(key);
				}
			}
		}

		// 结算与扣费同事务：条件更新 status='pending' → 只有首次结算生效并扣费（幂等）
		const applied = await this.db.transaction(async em => {
			const patch: QueryDeepPartialEntity<MiAgentModelUsageLog> = {
				completedAt,
				durationMs,
				status: params.status,
				errorCode: params.errorCode ?? null,
				cost,
				promptTokens: params.promptTokens ?? log.promptTokens ?? null,
				completionTokens: params.completionTokens ?? log.completionTokens ?? null,
				promptCacheHitTokens: params.promptCacheHitTokens ?? log.promptCacheHitTokens ?? null,
				promptCacheMissTokens: params.promptCacheMissTokens ?? log.promptCacheMissTokens ?? null,
			};
			patch.usedFreeQuota = quotaConsumedKey != null;
			patch.freeQuotaUsedAtCall = freeQuotaUsedAtCall;
			patch.freeQuotaTotalAtCall = freeQuotaTotalAtCall;
			const result = await em.update(MiAgentModelUsageLog, { id: log.id, status: 'pending' }, patch);
			if ((result.affected ?? 0) !== 1) return false;
			if (cost > 0) {
				// 允许余额为负；管理端可再充值或调整模型价格
				await em.decrement(MiUserProfile, { userId: log.userId }, 'agentCreditBalance', cost);
			}
			return true;
		}).catch(async (err: unknown) => {
			// DB 结算失败：归还本次占用的免费额度位，避免日志未落库却烧掉当日次数
			if (quotaConsumedKey != null) await this.redisClient.decr(quotaConsumedKey).catch(() => this.logger.error('Failed to compensate agent free quota'));
			throw err;
		});

		if (applied) {
			Object.assign(log, {
				completedAt, durationMs, status: params.status, errorCode: params.errorCode ?? null, cost,
				usedFreeQuota: quotaConsumedKey != null, freeQuotaUsedAtCall, freeQuotaTotalAtCall,
			});
			if (params.promptTokens != null) log.promptTokens = params.promptTokens;
			if (params.completionTokens != null) log.completionTokens = params.completionTokens;
			if (params.promptCacheHitTokens != null) log.promptCacheHitTokens = params.promptCacheHitTokens;
			if (params.promptCacheMissTokens != null) log.promptCacheMissTokens = params.promptCacheMissTokens;
		}

		// A duplicate settlement returns only the quota slot reserved by this attempt.
		if (!applied && quotaConsumedKey != null) {
			await this.redisClient.decr(quotaConsumedKey).catch(() => this.logger.error('Failed to compensate agent free quota'));
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
		// BYOK 用户自定义模型：平台不产生成本，直接放行
		if (modelId && isAgentUserModelId(modelId)) return true;
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
	 * - 峰谷定价：仅 usage 模式（含 usage 缺失的兜底价）在高峰时段（北京时间 9:00～12:00 / 14:00～18:00）
	 *   乘以 peakPriceMultiplier；per_call 模式始终按次价格。
	 */
	@bindThis
	private resolveLlmCallCost(instance: MiMeta, modelId: string | null, params: FinishLogParams): number {
		// BYOK 用户自定义模型：用户自带 Key，平台不扣费
		if (modelId && isAgentUserModelId(modelId)) return 0;
		const model = modelId ? getEffectiveLlmModels(instance).find(m => m.id === modelId) : undefined;
		// Only usage billing applies peak pricing, including its missing-usage fallback.
		const peakMultiplier = model?.billingMode === 'usage' && model.peakPriceMultiplier != null && model.peakPriceMultiplier > 1 && isAgentLlmPeakTimeBeijing()
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
		// BYOK 用户自定义模型无平台免费额度
		if (isAgentUserModelId(modelId)) return 0;
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
			// 必须用 skip 而非 offset：offset() 与 take() 混用时 TypeORM 会丢弃 take（createLimitOffsetExpression 仅在两者皆空时才回退到 skip/take），导致分页失效返回全量
			.skip(opts.offset ?? 0);
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
	 * 按模型维度聚合时间窗内请求数，供模型成功率接口使用（报表统计见 AgentModelReportService）。
	 * 未关联模型（modelId 为 NULL，旧版日志未解析默认模型）的记录聚合成一行（modelId=null），
	 * 由调用方决定展示方式。
	 */
	@bindThis
	public async aggregateByModel(opts: { userId?: MiUser['id']; since: Date; until?: Date }): Promise<Array<{
		modelId: string | null;
		total: number;
		success: number;
		failed: number;
		aborted: number;
		totalCost: number;
		freeCalls: number;
		paidCalls: number;
		creditsCharged: number;
		uniqueUsers: number;
		avgDurationMs: number | null;
	}>> {
		const qb = this.agentModelUsageLogsRepository.createQueryBuilder('log')
			.select('log.modelId', 'modelId')
			.addSelect('COUNT(*)::int', 'total')
			.addSelect('SUM(CASE WHEN log.status = \'success\' THEN 1 ELSE 0 END)::int', 'success')
			.addSelect('SUM(CASE WHEN log.status = \'failed\' THEN 1 ELSE 0 END)::int', 'failed')
			.addSelect('SUM(CASE WHEN log.status = \'aborted\' THEN 1 ELSE 0 END)::int', 'aborted')
			.addSelect('COALESCE(SUM(log.cost), 0)', 'totalCost')
			.addSelect('SUM(CASE WHEN log.usedFreeQuota = TRUE THEN 1 ELSE 0 END)::int', 'freeCalls')
			.addSelect('SUM(CASE WHEN log.cost > 0 THEN 1 ELSE 0 END)::int', 'paidCalls')
			.addSelect('COALESCE(SUM(CASE WHEN log.cost > 0 THEN log.cost ELSE 0 END), 0)', 'creditsCharged')
			.addSelect('COUNT(DISTINCT log.userId)::int', 'uniqueUsers')
			.addSelect('AVG(log.durationMs)', 'avgDurationMs')
			.where('log.requestedAt >= :since', { since: opts.since })
			// 签到/管理员奖励/额度迁移等流水不属于模型调用（modelId 恒为 NULL），不计入模型统计；
			// 与计费构成（billingBreakdown）同口径，否则这类流水会以“未关联模型”混入按模型表
			.andWhere('log.usageKind NOT IN (:...nonModelKinds)', { nonModelKinds: nonModelUsageKinds })
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
			freeCalls: number;
			paidCalls: number;
			creditsCharged: string | number;
			uniqueUsers: number;
			avgDurationMs: string | number | null;
		}>();
		return rows.map(r => ({
			modelId: r.modelId,
			total: Number(r.total) || 0,
			success: Number(r.success) || 0,
			failed: Number(r.failed) || 0,
			aborted: Number(r.aborted) || 0,
			totalCost: Number(r.totalCost) || 0,
			freeCalls: Number(r.freeCalls) || 0,
			paidCalls: Number(r.paidCalls) || 0,
			creditsCharged: Number(r.creditsCharged) || 0,
			uniqueUsers: Number(r.uniqueUsers) || 0,
			avgDurationMs: r.avgDurationMs != null ? Number(r.avgDurationMs) : null,
		}));
	}
}
