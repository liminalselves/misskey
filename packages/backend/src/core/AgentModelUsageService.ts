/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
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
	promptTokens?: number | null;
	completionTokens?: number | null;
	costOverride?: number | null;
};

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
			status: 'success',
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
	 */
	@bindThis
	public async finishLog(log: MiAgentModelUsageLog, instance: MiMeta, params: FinishLogParams): Promise<void> {
		const completedAt = new Date();
		const durationMs = Math.max(0, completedAt.getTime() - log.requestedAt.getTime());
		let cost = 0;
		if (params.status === 'success' || params.status === 'aborted') {
			cost = typeof params.costOverride === 'number'
				? Math.max(0, params.costOverride)
				: log.usageKind === 'image_generation'
				? Math.max(0, Number(instance.agentImageCostPerCall) || 0)
				: this.agentService.getUserFacingModelCostPerCall(instance, log.modelId);
		}

		log.completedAt = completedAt;
		log.durationMs = durationMs;
		log.status = params.status;
		log.errorCode = params.errorCode ?? null;
		log.cost = cost;
		if (params.promptTokens != null) log.promptTokens = params.promptTokens;
		if (params.completionTokens != null) log.completionTokens = params.completionTokens;
		await this.agentModelUsageLogsRepository.save(log);

		if (cost > 0) {
			// 允许余额为负；管理端可再充值或调整模型价格
			await this.userProfilesRepository.decrement({ userId: log.userId }, 'agentCreditBalance', cost);
		}
	}

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
	 */
	@bindThis
	public async listUserRecent(
		userId: MiUser['id'],
		opts: { limit: number; untilDate?: Date | null; offset?: number },
	): Promise<MiAgentModelUsageLog[]> {
		const qb = this.agentModelUsageLogsRepository.createQueryBuilder('log')
			.where('log.userId = :userId', { userId })
			.orderBy('log.requestedAt', 'DESC')
			.take(opts.limit)
			.offset(opts.offset ?? 0);
		if (opts.untilDate != null) {
			qb.andWhere('log.requestedAt < :until', { until: opts.untilDate });
		}
		return qb.getMany();
	}

	@bindThis
	public async countUserLogs(userId: MiUser['id']): Promise<number> {
		return this.agentModelUsageLogsRepository.countBy({ userId });
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
