/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { AgentUserModelsRepository } from '@/models/_.js';
import type { MetaService } from '@/core/MetaService.js';
import type { AgentImageService } from '@/core/AgentImageService.js';
import type { AgentModelUsageService } from '@/core/AgentModelUsageService.js';
import { createAgentUsageModelResolver } from '@/misc/agent-usage-model-resolver.js';

/** Paged model-call log rows for one user; shared by agents/usage/logs and admin/users/agent-usage-logs. */
export const usageLogItemSchema = {
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

export const usageLogsResSchema = {
	type: 'object',
	optional: false, nullable: false,
	properties: {
		items: { type: 'array', items: usageLogItemSchema },
		total: { type: 'integer' },
		page: { type: 'integer' },
		pageSize: { type: 'integer' },
	},
} as const;

export type UsageLogsDeps = {
	agentUserModelsRepository: AgentUserModelsRepository;
	metaService: MetaService;
	agentImageService: AgentImageService;
	agentModelUsageService: AgentModelUsageService;
};

export async function fetchUsageLogsPage(deps: UsageLogsDeps, userId: string, page: number, pageSize: number) {
	// Same scope as AgentModelUsageService.listUserRecent: model calls only, no check-in rows.
	const [instanceMeta, userModels, logs, total] = await Promise.all([
		deps.metaService.fetch(true),
		deps.agentUserModelsRepository.find({ where: { userId } }),
		deps.agentModelUsageService.listUserRecent(userId, { limit: pageSize, offset: (page - 1) * pageSize }),
		deps.agentModelUsageService.countUserLogs(userId),
	]);
	const { modelSourceOf, resolveModelName } = createAgentUsageModelResolver(instanceMeta, userModels, deps.agentImageService);
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
		page,
		pageSize,
	};
}
