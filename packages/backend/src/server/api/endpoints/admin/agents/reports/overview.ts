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
			overall: {
				type: 'object',
				properties: {
					total: { type: 'integer' },
					success: { type: 'integer' },
					failed: { type: 'integer' },
					aborted: { type: 'integer' },
					totalCost: { type: 'number' },
					uniqueUsers: { type: 'integer' },
				},
				required: ['total', 'success', 'failed', 'aborted', 'totalCost', 'uniqueUsers'],
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
					},
					required: ['modelId', 'total', 'success', 'failed', 'aborted', 'totalCost'],
				},
			},
			hourlyBuckets: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						bucketStart: { type: 'string', format: 'date-time' },
						total: { type: 'integer' },
						success: { type: 'integer' },
						failed: { type: 'integer' },
						aborted: { type: 'integer' },
					},
					required: ['bucketStart', 'total', 'success', 'failed', 'aborted'],
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		hours: { type: 'integer', minimum: 1, maximum: 720 },
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
			const hours = ps.hours ?? 24;
			const since = new Date(Date.now() - hours * 60 * 60 * 1000);

			const instanceMeta = await this.metaService.fetch(true);
			const llmModels = getEffectiveLlmModels(instanceMeta);
			const imageModels = this.agentImageService.listAvailableImageModels(instanceMeta, true);
			const modelMap = new Map<string, { name: string; unlisted: boolean }>([
				...llmModels.map(m => [m.id, { name: m.name, unlisted: m.unlisted === true }] as const),
				...imageModels.map(m => [m.id, { name: `生图：${m.name}`, unlisted: m.enabled === false }] as const),
			]);

			const [overall, byModel, hourlyBuckets] = await Promise.all([
				this.agentModelUsageService.overallStats({ since }),
				this.agentModelUsageService.aggregateByModel({ since }),
				this.agentModelUsageService.hourlyBuckets({ since }),
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
			}));

			// BYOK（用户自定义模型，id 以 u 前缀开头）合并为一条综合统计，避免显示为“未知/已删除模型”
			const mergedByModel: typeof byModelRows = [];
			let custom: { total: number; success: number; failed: number; aborted: number; totalCost: number } | null = null;
			for (const r of byModelRows) {
				if (r.modelId != null && r.modelId.startsWith('u')) {
					if (custom == null) custom = { total: 0, success: 0, failed: 0, aborted: 0, totalCost: 0 };
					custom.total += r.total;
					custom.success += r.success;
					custom.failed += r.failed;
					custom.aborted += r.aborted;
					custom.totalCost += r.totalCost;
				} else {
					mergedByModel.push(r);
				}
			}
			if (custom != null) {
				mergedByModel.push({
					modelId: '__byok_custom_models__',
					modelName: '自定义模型请求',
					...custom,
					unlisted: false,
				});
			}

			return {
				overall,
				byModel: mergedByModel,
				hourlyBuckets,
			};
		});
	}
}
