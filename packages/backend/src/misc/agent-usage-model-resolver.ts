/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiMeta } from '@/models/Meta.js';
import type { MiAgentUserModel } from '@/models/AgentUserModel.js';
import type { AgentImageService } from '@/core/AgentImageService.js';
import { getEffectiveLlmModels } from '@/misc/agent-llm-models.js';

export type AgentUsageModelResolver = {
	/** 已删除/查不到的自定义模型显示为「自定义模型」，而非「—」 */
	resolveModelName: (modelId: string | null) => string | null;
	modelSourceOf: (modelId: string | null) => 'official' | 'user' | null;
};

/**
 * 用量日志的模型名/来源解析，供 admin/users/agent-usage、admin/users/agent-usage-logs
 * 与 agents/my-usage-summary 共用。
 * 名称映射使用全量模型（含已下架/禁用），避免历史用量记录因模型下架而显示为「—」。
 */
export function createAgentUsageModelResolver(
	instanceMeta: MiMeta,
	userModels: MiAgentUserModel[],
	agentImageService: AgentImageService,
): AgentUsageModelResolver {
	const modelNameMap = new Map<string, string>([
		...getEffectiveLlmModels(instanceMeta).map(m => [m.id, m.name] as const),
		...agentImageService.listAvailableImageModels(instanceMeta, true).map(m => [m.id, m.name] as const),
		...instanceMeta.agentVisionModels.map(m => [m.id, m.name] as const),
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

	const resolveModelName = (modelId: string | null): string | null => {
		if (!modelId) return null;
		const n = modelNameMap.get(modelId);
		if (n) return n;
		return modelId.startsWith('u') ? '自定义模型' : null;
	};

	return { modelSourceOf, resolveModelName };
}
