/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentImageService } from '@/core/AgentImageService.js';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';
import { MetaService } from '@/core/MetaService.js';
import { getEffectiveLlmModels } from '@/misc/agent-llm-models.js';

/** 前端 BYOK 合并行使用的伪模型 id（与前端约定保持一致） */
const BYOK_MERGED_MODEL_ID = '__byok_custom_models__';

/** since/until 自定义窗口的最大跨度（自然年，防止全表扫描） */
const MAX_WINDOW_MS = 366 * 24 * 60 * 60 * 1000;

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireAdmin: true,
	kind: 'read:admin',
	limit: { duration: ms('5min'), max: 60 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			bucket: { type: 'string', enum: ['hour', 'day'] },
			since: { type: 'string', format: 'date-time' },
			until: { type: 'string', format: 'date-time' },
			overall: {
				type: 'object',
				properties: {
					total: { type: 'integer' },
					success: { type: 'integer' },
					failed: { type: 'integer' },
					aborted: { type: 'integer' },
					totalCost: { type: 'number' },
					uniqueUsers: { type: 'integer' },
					freeCalls: { type: 'integer' },
					paidCalls: { type: 'integer' },
					creditsCharged: { type: 'number' },
					avgDurationMs: { type: 'number', nullable: true },
				},
				required: ['total', 'success', 'failed', 'aborted', 'totalCost', 'uniqueUsers', 'freeCalls', 'paidCalls', 'creditsCharged', 'avgDurationMs'],
			},
			previousOverall: {
				type: 'object',
				properties: {
					total: { type: 'integer' },
					success: { type: 'integer' },
					failed: { type: 'integer' },
					aborted: { type: 'integer' },
					totalCost: { type: 'number' },
					uniqueUsers: { type: 'integer' },
					freeCalls: { type: 'integer' },
					paidCalls: { type: 'integer' },
					creditsCharged: { type: 'number' },
					avgDurationMs: { type: 'number', nullable: true },
				},
				required: ['total', 'success', 'failed', 'aborted', 'totalCost', 'uniqueUsers', 'freeCalls', 'paidCalls', 'creditsCharged', 'avgDurationMs'],
			},
			byModel: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						modelId: { type: 'string', nullable: true },
						modelName: { type: 'string', nullable: true },
						total: { type: 'integer' },
						success: { type: 'integer' },
						failed: { type: 'integer' },
						aborted: { type: 'integer' },
						totalCost: { type: 'number' },
						unlisted: { type: 'boolean' },
						freeCalls: { type: 'integer' },
						paidCalls: { type: 'integer' },
						creditsCharged: { type: 'number' },
						uniqueUsers: { type: 'integer' },
						avgDurationMs: { type: 'number', nullable: true },
					},
					required: ['modelId', 'total', 'success', 'failed', 'aborted', 'totalCost', 'freeCalls', 'paidCalls', 'creditsCharged', 'uniqueUsers', 'avgDurationMs'],
				},
			},
			buckets: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						bucketStart: { type: 'string', format: 'date-time' },
						total: { type: 'integer' },
						success: { type: 'integer' },
						failed: { type: 'integer' },
						aborted: { type: 'integer' },
						freeCalls: { type: 'integer' },
						paidCalls: { type: 'integer' },
						creditsCharged: { type: 'number' },
						avgDurationMs: { type: 'number', nullable: true },
					},
					required: ['bucketStart', 'total', 'success', 'failed', 'aborted', 'freeCalls', 'paidCalls', 'creditsCharged', 'avgDurationMs'],
				},
			},
			byUsageKind: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						usageKind: { type: 'string' },
						total: { type: 'integer' },
						freeCalls: { type: 'integer' },
						paidCalls: { type: 'integer' },
						creditsCharged: { type: 'number' },
					},
					required: ['usageKind', 'total', 'freeCalls', 'paidCalls', 'creditsCharged'],
				},
			},
			billing: {
				type: 'object',
				properties: {
					free: { type: 'integer' },
					paid: { type: 'integer' },
					failed: { type: 'integer' },
					byok: { type: 'integer' },
					zeroPriced: { type: 'integer' },
					other: { type: 'integer' },
				},
				required: ['free', 'paid', 'failed', 'byok', 'zeroPriced', 'other'],
			},
			topUsers: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						userId: { type: 'string' },
						username: { type: 'string' },
						name: { type: 'string', nullable: true },
						total: { type: 'integer' },
						freeCalls: { type: 'integer' },
						paidCalls: { type: 'integer' },
						creditsCharged: { type: 'number' },
					},
					required: ['userId', 'username', 'name', 'total', 'freeCalls', 'paidCalls', 'creditsCharged'],
				},
			},
		},
		required: ['bucket', 'since', 'until', 'overall', 'previousOverall', 'byModel', 'buckets', 'byUsageKind', 'billing', 'topUsers'],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		hours: { type: 'integer', minimum: 1, maximum: 2160 },
		bucket: { type: 'string', enum: ['hour', 'day'] },
		// ISO 8601 时间字符串（校验器未注册 date-time 格式，保持纯 string，与签到报表 dateFrom/dateTo 一致）
		since: { type: 'string' },
		until: { type: 'string' },
		modelId: { type: 'string' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private agentService: AgentService,
		private agentImageService: AgentImageService,
		private agentModelUsageService: AgentModelUsageService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();

			// 时间窗口：优先 since/until（自然月等自定义维度），否则按 hours 回滚
			const now = Date.now();
			let since = ps.since != null ? new Date(ps.since) : new Date(now - (ps.hours ?? 24) * 60 * 60 * 1000);
			let until = ps.until != null ? new Date(ps.until) : new Date(now);
			if (Number.isNaN(since.getTime())) since = new Date(now - (ps.hours ?? 24) * 60 * 60 * 1000);
			if (Number.isNaN(until.getTime()) || until.getTime() <= since.getTime()) until = new Date(now);
			if (until.getTime() - since.getTime() > MAX_WINDOW_MS) since = new Date(until.getTime() - MAX_WINDOW_MS);

			// 分桶粒度：未指定时短窗口（≤7 天）按小时，长窗口按天
			const bucketUnit: 'hour' | 'day' = ps.bucket ?? ((until.getTime() - since.getTime()) <= 168 * 60 * 60 * 1000 ? 'hour' : 'day');

			// 单模型筛选：仅作用于 overall 与 buckets（byModel 始终返回全量列表供切换）
			const modelFilter = ps.modelId === BYOK_MERGED_MODEL_ID
				? { byokOnly: true as const }
				: (ps.modelId != null ? { modelId: ps.modelId } : {});

			const instanceMeta = await this.metaService.fetch(true);
			const llmModels = getEffectiveLlmModels(instanceMeta);
			const imageModels = this.agentImageService.listAvailableImageModels(instanceMeta, true);
			// 识图模型有独立的 id 空间（aid 格式），必须纳入名称映射，否则识图调用会显示为无名 ID
			const visionModels = instanceMeta.agentVisionModels ?? [];
			const modelMap = new Map<string, { name: string; unlisted: boolean }>([
				...llmModels.map(m => [m.id, { name: m.name, unlisted: m.unlisted === true }] as const),
				...imageModels.map(m => [m.id, { name: `生图：${m.name}`, unlisted: m.enabled === false }] as const),
				...visionModels.map(m => [m.id, { name: `识图：${m.name?.trim() || m.apiModelName || m.id}`, unlisted: m.enabled === false }] as const),
			]);

			// 环比窗口：紧挨当前窗口之前、跨度相同的一段，供卡片展示涨跌
			const spanMs = until.getTime() - since.getTime();
			const prevSince = new Date(since.getTime() - spanMs);

			const [overall, previousOverall, byModel, buckets, byUsageKind, billing, topUsers, byokStats] = await Promise.all([
				this.agentModelUsageService.overallStats({ since, until, modelCallsOnly: true, ...modelFilter }),
				this.agentModelUsageService.overallStats({ since: prevSince, until: since, modelCallsOnly: true, ...modelFilter }),
				this.agentModelUsageService.aggregateByModel({ since, until }),
				this.agentModelUsageService.timeBuckets({ since, until, unit: bucketUnit, modelCallsOnly: true, ...modelFilter }),
				this.agentModelUsageService.aggregateByUsageKind({ since, until }),
				this.agentModelUsageService.billingBreakdown({ since, until, ...modelFilter }),
				this.agentModelUsageService.topUsersByCharged({ since, until, limit: 10 }),
				// BYOK 合并行的 uniqueUsers/avgDurationMs 无法由分组行求和得出，单独按前缀聚合一次
				this.agentModelUsageService.overallStats({ since, until, modelCallsOnly: true, byokOnly: true }),
			]);

			const byModelRows = byModel.map(r => ({
				modelId: r.modelId,
				modelName: r.modelId ? (modelMap.get(r.modelId)?.name ?? null) : null,
				total: r.total,
				success: r.success,
				failed: r.failed,
				aborted: r.aborted,
				totalCost: r.totalCost,
				unlisted: r.modelId ? (modelMap.get(r.modelId)?.unlisted === true) : false,
				freeCalls: r.freeCalls,
				paidCalls: r.paidCalls,
				creditsCharged: r.creditsCharged,
				uniqueUsers: r.uniqueUsers,
				avgDurationMs: r.avgDurationMs,
			}));

			// BYOK（用户自定义模型，id 以 u 前缀开头）合并为一条综合统计，避免显示为“未知/已删除模型”
			const mergedByModel: typeof byModelRows = [];
			let custom: {
				total: number; success: number; failed: number; aborted: number; totalCost: number;
				freeCalls: number; paidCalls: number; creditsCharged: number;
			} | null = null;
			for (const r of byModelRows) {
				if (r.modelId != null && r.modelId.startsWith('u')) {
					if (custom == null) {
						custom = { total: 0, success: 0, failed: 0, aborted: 0, totalCost: 0, freeCalls: 0, paidCalls: 0, creditsCharged: 0 };
					}
					custom.total += r.total;
					custom.success += r.success;
					custom.failed += r.failed;
					custom.aborted += r.aborted;
					custom.totalCost += r.totalCost;
					custom.freeCalls += r.freeCalls;
					custom.paidCalls += r.paidCalls;
					custom.creditsCharged += r.creditsCharged;
				} else {
					mergedByModel.push(r);
				}
			}
			if (custom != null) {
				mergedByModel.push({
					modelId: BYOK_MERGED_MODEL_ID,
					modelName: '自定义模型请求',
					...custom,
					unlisted: false,
					uniqueUsers: byokStats.uniqueUsers,
					avgDurationMs: byokStats.avgDurationMs,
				});
			}

			// 按请求量降序，便于表格阅读
			mergedByModel.sort((a, b) => b.total - a.total);

			return {
				bucket: bucketUnit,
				since: since.toISOString(),
				until: until.toISOString(),
				overall,
				previousOverall,
				byModel: mergedByModel,
				buckets,
				byUsageKind,
				billing,
				topUsers,
			};
		});
	}
}
