/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentUserModelsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentImageService } from '@/core/AgentImageService.js';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';
import { MetaService } from '@/core/MetaService.js';
import { createAgentUsageModelResolver } from '@/misc/agent-usage-model-resolver.js';

const usageLogItemSchema = {
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
		usageKind: { type: 'string', enum: ['chat', 'compression', 'image_generation', 'vision', 'sticker_description', 'proactive_random', 'proactive_scheduled', 'checkin', 'admin_reward', 'admin_compensation', 'credit_migration'] },
		status: { type: 'string' },
		cost: { type: 'number' },
		promptTokens: { type: 'integer', nullable: true },
		completionTokens: { type: 'integer', nullable: true },
		usedFreeQuota: { type: 'boolean', nullable: true },
		freeQuotaUsedAtCall: { type: 'integer', nullable: true },
		freeQuotaTotalAtCall: { type: 'integer', nullable: true },
	},
	required: ['id', 'requestedAt', 'status', 'cost', 'usageKind'],
} as const;

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
			items: {
				type: 'array',
				items: usageLogItemSchema,
			},
			total: { type: 'integer' },
			page: { type: 'integer' },
			pageSize: { type: 'integer' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		page: { type: 'integer', minimum: 1, default: 1 },
		pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentUserModelsRepository)
		private agentUserModelsRepository: AgentUserModelsRepository,

		private agentService: AgentService,
		private agentImageService: AgentImageService,
		private agentModelUsageService: AgentModelUsageService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();

			// 与 AgentModelUsageService.listUserRecent 同口径：仅模型调用，不含签到/补签流水
			const [instanceMeta, userModels, logs, total] = await Promise.all([
				this.metaService.fetch(true),
				this.agentUserModelsRepository.find({ where: { userId: ps.userId } }),
				this.agentModelUsageService.listUserRecent(ps.userId, { limit: ps.pageSize, offset: (ps.page - 1) * ps.pageSize }),
				this.agentModelUsageService.countUserLogs(ps.userId),
			]);
			const { modelSourceOf, resolveModelName } = createAgentUsageModelResolver(instanceMeta, userModels, this.agentImageService);

			return {
				items: logs.map(log => ({
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
				})),
				total,
				page: ps.page,
				pageSize: ps.pageSize,
			};
		});
	}
}
