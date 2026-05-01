/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';
import { MetaService } from '@/core/MetaService.js';
import { getEffectiveLlmModels } from '@/misc/agent-llm-models.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
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
		private agentModelUsageService: AgentModelUsageService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();
			const hours = ps.hours ?? 24;
			const since = new Date(Date.now() - hours * 60 * 60 * 1000);

			const instanceMeta = await this.metaService.fetch(true);
			const allModels = getEffectiveLlmModels(instanceMeta);
			const modelMap = new Map(allModels.map(m => [m.id, m]));

			const [overall, byModel, hourlyBuckets] = await Promise.all([
				this.agentModelUsageService.overallStats({ since }),
				this.agentModelUsageService.aggregateByModel({ since }),
				this.agentModelUsageService.hourlyBuckets({ since }),
			]);

			return {
				overall,
				byModel: byModel.map(r => ({
					modelId: r.modelId,
					modelName: r.modelId ? (modelMap.get(r.modelId)?.name ?? null) : null,
					total: r.total,
					success: r.success,
					failed: r.failed,
					aborted: r.aborted,
					totalCost: r.totalCost,
					unlisted: r.modelId ? (modelMap.get(r.modelId)?.unlisted === true) : false,
				})),
				hourlyBuckets,
			};
		});
	}
}
