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
import { createAgentUsageModelResolver } from '@/misc/agent-usage-model-resolver.js';

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
			recentLogsTotal: { type: 'integer' },
			bucket: { type: 'string', enum: ['hour', 'day'] },
			buckets: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						bucketStart: { type: 'string' },
						total: { type: 'integer' },
						success: { type: 'integer' },
						failed: { type: 'integer' },
						aborted: { type: 'integer' },
						freeCalls: { type: 'integer' },
						paidCalls: { type: 'integer' },
						creditsCharged: { type: 'number' },
						promptTokens: { type: 'integer' },
						completionTokens: { type: 'integer' },
						avgDurationMs: { type: 'number', nullable: true },
					},
					required: ['bucketStart', 'total', 'success', 'failed', 'aborted', 'freeCalls', 'paidCalls', 'creditsCharged', 'promptTokens', 'completionTokens', 'avgDurationMs'],
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
		},
		required: ['creditBalance', 'since', 'hours', 'overall', 'byModel', 'recentLogsTotal', 'bucket', 'buckets', 'byUsageKind'],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		hours: { type: 'integer', minimum: 1, maximum: 2160 },
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
			// 分桶粒度：短窗口（≤7 天）按小时，长窗口按天
			const bucketUnit: 'hour' | 'day' = hours <= 168 ? 'hour' : 'day';

			// 最近请求记录列表由 admin/users/agent-usage-logs 单独分页下发，此处仅返回总数供标签展示
			const [profile, instanceMeta, userModels, overall, byModelRaw, recentLogsTotal, buckets, byUsageKind] = await Promise.all([
				this.userProfilesRepository.findOneBy({ userId: ps.userId }),
				this.metaService.fetch(true),
				this.agentUserModelsRepository.find({ where: { userId: ps.userId } }),
				this.agentModelUsageService.overallStats({ since, userId: ps.userId, modelCallsOnly: true }),
				this.agentModelUsageService.aggregateByModel({ userId: ps.userId, since }),
				this.agentModelUsageService.countUserLogs(ps.userId),
				this.agentModelUsageService.timeBuckets({ since, userId: ps.userId, unit: bucketUnit, modelCallsOnly: true }),
				this.agentModelUsageService.aggregateByUsageKind({ since, userId: ps.userId }),
			]);

			const { modelSourceOf, resolveModelName } = createAgentUsageModelResolver(instanceMeta, userModels, this.agentImageService);

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

			return {
				creditBalance: profile?.agentCreditBalance ?? 0,
				since: since.toISOString(),
				hours,
				overall,
				byModel,
				recentLogsTotal,
				bucket: bucketUnit,
				buckets,
				byUsageKind,
			};
		});
	}
}
