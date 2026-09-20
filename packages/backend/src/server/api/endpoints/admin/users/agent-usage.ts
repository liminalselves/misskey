/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type {
	AgentUserModelsRepository,
	UserProfilesRepository,
} from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentImageService } from '@/core/AgentImageService.js';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';
import { MetaService } from '@/core/MetaService.js';
import { getEffectiveLlmModels } from '@/misc/agent-llm-models.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1min'), max: 30 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			creditBalance: { type: 'number' },
			since: { type: 'string' },
			hours: { type: 'integer' },
			overall: {
				type: 'object',
				properties: {
					total: { type: 'integer' },
					success: { type: 'integer' },
					failed: { type: 'integer' },
					aborted: { type: 'integer' },
					totalCost: { type: 'number' },
					freeCalls: { type: 'integer' },
					paidCalls: { type: 'integer' },
					creditsCharged: { type: 'number' },
					avgDurationMs: { type: 'number', nullable: true },
				},
				required: ['total', 'success', 'failed', 'aborted', 'totalCost', 'freeCalls', 'paidCalls', 'creditsCharged', 'avgDurationMs'],
			},
			byModel: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						modelId: { type: 'string', nullable: true },
						modelName: { type: 'string', nullable: true },
						modelSource: { type: 'string', enum: ['official', 'user'], nullable: true },
						total: { type: 'integer' },
						success: { type: 'integer' },
						failed: { type: 'integer' },
						aborted: { type: 'integer' },
						totalCost: { type: 'number' },
						freeCalls: { type: 'integer' },
						paidCalls: { type: 'integer' },
						creditsCharged: { type: 'number' },
						avgDurationMs: { type: 'number', nullable: true },
					},
					required: ['modelId', 'modelName', 'modelSource', 'total', 'success', 'failed', 'aborted', 'totalCost', 'freeCalls', 'paidCalls', 'creditsCharged', 'avgDurationMs'],
				},
			},
			recentLogs: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						requestedAt: { type: 'string' },
						completedAt: { type: 'string', nullable: true },
						durationMs: { type: 'integer', nullable: true },
						modelId: { type: 'string', nullable: true },
						modelName: { type: 'string', nullable: true },
						modelSource: { type: 'string', enum: ['official', 'user'], nullable: true },
						modelApiName: { type: 'string', nullable: true },
						usageKind: { type: 'string', enum: ['chat', 'compression', 'image_generation', 'vision', 'sticker_description', 'proactive_random', 'proactive_scheduled', 'checkin', 'admin_reward', 'credit_migration'] },
						status: { type: 'string' },
						cost: { type: 'number' },
						promptTokens: { type: 'integer', nullable: true },
						completionTokens: { type: 'integer', nullable: true },
						usedFreeQuota: { type: 'boolean', nullable: true },
						freeQuotaUsedAtCall: { type: 'integer', nullable: true },
						freeQuotaTotalAtCall: { type: 'integer', nullable: true },
					},
					required: ['id', 'requestedAt', 'status', 'cost', 'usageKind'],
				},
			},
			recentLogsTotal: { type: 'integer' },
			recentLogsPage: { type: 'integer' },
			recentLogsPageSize: { type: 'integer' },
		},
		required: ['creditBalance', 'since', 'hours', 'overall', 'byModel', 'recentLogs', 'recentLogsTotal', 'recentLogsPage', 'recentLogsPageSize'],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		hours: { type: 'integer', minimum: 1, maximum: 2160 },
		logsPage: { type: 'integer', minimum: 1, default: 1 },
		logsPageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.agentUserModelsRepository)
		private agentUserModelsRepository: AgentUserModelsRepository,

		private agentService: AgentService,
		private agentImageService: AgentImageService,
		private agentModelUsageService: AgentModelUsageService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();

			const hours = ps.hours ?? 720;
			const since = new Date(Date.now() - hours * 60 * 60 * 1000);
			const logsPage = ps.logsPage ?? 1;
			const logsPageSize = ps.logsPageSize ?? 20;
			const logsOffset = (logsPage - 1) * logsPageSize;

			const [profile, instanceMeta, userModels, overall, byModelRaw, recentLogsRaw, recentLogsTotal] = await Promise.all([
				this.userProfilesRepository.findOneBy({ userId: ps.userId }),
				this.metaService.fetch(true),
				this.agentUserModelsRepository.find({ where: { userId: ps.userId } }),
				this.agentModelUsageService.overallStats({ since, userId: ps.userId, modelCallsOnly: true }),
				this.agentModelUsageService.aggregateByModel({ userId: ps.userId, since }),
				this.agentModelUsageService.listUserRecent(ps.userId, { limit: logsPageSize, offset: logsOffset }),
				this.agentModelUsageService.countUserLogs(ps.userId),
			]);

			// 名称映射使用全量模型（含已下架/禁用），避免历史用量记录因模型下架而显示为「—」
			const modelNameMap = new Map<string, string>([
				...getEffectiveLlmModels(instanceMeta).map(m => [m.id, m.name] as const),
				...this.agentImageService.listAvailableImageModels(instanceMeta, true).map(m => [m.id, m.name] as const),
				...(instanceMeta.agentVisionModels ?? []).map(m => [m.id, m.name] as const),
				...userModels.map(m => [m.id, m.name] as const),
			]);

			const modelSourceOf = (modelId: string | null): 'official' | 'user' | null => {
				if (!modelId) return null;
				if (userModels.some(m => m.id === modelId)) return 'user';
				// BYOK 自定义模型 id 以 u 前缀开头；即使模型已删除也能识别为自定义模型
				if (modelId.startsWith('u')) return 'user';
				if (modelNameMap.has(modelId)) return 'official';
				return null;
			};

			// 模型名兜底：已删除/查不到的自定义模型显示为「自定义模型」，而非「—」
			const resolveModelName = (modelId: string | null): string | null => {
				if (!modelId) return null;
				const n = modelNameMap.get(modelId);
				if (n) return n;
				return modelId.startsWith('u') ? '自定义模型' : null;
			};

			const byModel = byModelRaw.map(r => ({
				modelId: r.modelId,
				modelName: resolveModelName(r.modelId),
				modelSource: modelSourceOf(r.modelId),
				total: r.total,
				success: r.success,
				failed: r.failed,
				aborted: r.aborted,
				totalCost: r.totalCost,
				freeCalls: r.freeCalls,
				paidCalls: r.paidCalls,
				creditsCharged: r.creditsCharged,
				avgDurationMs: r.avgDurationMs,
			})).sort((a, b) => b.total - a.total);

			const recentLogs = recentLogsRaw.map(log => ({
				id: log.id,
				requestedAt: log.requestedAt.toISOString(),
				completedAt: log.completedAt?.toISOString() ?? null,
				durationMs: log.durationMs,
				modelId: log.modelId,
				modelName: resolveModelName(log.modelId),
				modelSource: modelSourceOf(log.modelId),
				modelApiName: log.modelApiName,
				usageKind: log.usageKind,
				status: log.status,
				cost: log.cost,
				promptTokens: log.promptTokens,
				completionTokens: log.completionTokens,
				usedFreeQuota: log.usedFreeQuota ?? null,
				freeQuotaUsedAtCall: log.freeQuotaUsedAtCall ?? null,
				freeQuotaTotalAtCall: log.freeQuotaTotalAtCall ?? null,
			}));

			return {
				creditBalance: profile?.agentCreditBalance ?? 0,
				since: since.toISOString(),
				hours,
				overall,
				byModel,
				recentLogs,
				recentLogsTotal,
				recentLogsPage: logsPage,
				recentLogsPageSize: logsPageSize,
			};
		});
	}
}
