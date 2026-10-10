/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiMeta } from '@/models/Meta.js';
import type { AgentModelChange } from '@/models/AgentModelAnnouncement.js';
import { getEffectiveLlmModels, packPublicAgentModels } from '@/misc/agent-llm-models.js';
import { getEffectiveImageModels } from '@/misc/agent-image-models.js';
import { getAgentImageProviderDefinition } from '@/core/agent-image-providers.js';

type ModelSnapshot = {
	id: string;
	name: string;
	fields: Record<string, string>;
};

function text(value: unknown, fallback = '未设置'): string {
	return value == null || value === '' ? fallback : String(value);
}

function chatSnapshots(meta: MiMeta): ModelSnapshot[] {
	return packPublicAgentModels(meta).map(model => ({
		id: model.id,
		name: model.name,
		fields: {
			名称: model.name,
			简介: text(model.description),
			每日免费次数: `${model.dailyFreeQuota} 次`,
			上下文上限: `${model.maxContextTokens} tokens`,
			输出上限: `${model.maxOutputTokensPerCall} tokens`,
			分组: model.group ?? '未分组',
			计费方式: model.billingMode === 'usage' ? '按量计费' : '按次计费',
			...(model.billingMode === 'usage' ? {
				输入缓存命中单价: `${model.pricePerMillionInputCacheHitTokens} / 百万 tokens`,
				输入缓存未命中单价: `${model.pricePerMillionInputCacheMissTokens} / 百万 tokens`,
				输出单价: `${model.pricePerMillionOutputTokens} / 百万 tokens`,
				高峰价格倍率: `${model.peakPriceMultiplier ?? 1} 倍`,
				用量缺失时每次费用: String(model.costPerCall),
			} : { 每次调用费用: String(model.costPerCall) }),
		},
	}));
}

function imageSnapshots(meta: MiMeta): ModelSnapshot[] {
	return getEffectiveImageModels(meta).map(model => {
		const params = model.defaultParams ?? {};
		const capabilities = getAgentImageProviderDefinition(model.provider).capabilities;
		const preset = meta.agentImageArtistPresets.find(p => p.id === model.defaultArtistPresetId) ?? meta.agentImageArtistPresets.at(0);
		return {
			id: model.id,
			name: model.name,
			fields: {
				名称: model.name,
				简介: text(model.description),
				每日免费次数: `${model.dailyFreeQuota ?? 0} 次`,
				每次调用费用: String(Math.max(0, model.costPerCall ?? 0)),
				参考图: model.supportsReferenceImage ? '支持' : '不支持',
				尺寸选择: capabilities.supportsSizeSelection ? '支持' : '不支持',
				...(capabilities.supportsAdvancedParams ? {
					默认步数: text(params.steps ?? 28),
					默认提示词强度: text(params.scale ?? 5),
					默认强度重缩放: text(params.cfgRescale ?? 0),
					默认采样器: text(params.sampler, 'k_euler_ancestral'),
					默认噪声调度: text(params.noiseSchedule, 'karras'),
					默认提示词前缀: text(params.promptPrefix),
					默认提示词后缀: text(params.promptSuffix),
				} : {}),
				...(capabilities.supportsArtistPreset ? { 默认画师预设: preset?.name ?? '未设置' } : {}),
			},
		};
	});
}

function diffModels(kind: AgentModelChange['kind'], before: ModelSnapshot[], after: ModelSnapshot[], previousIds: Set<string>): AgentModelChange[] {
	const changes: AgentModelChange[] = [];
	const beforeById = new Map(before.map(model => [model.id, model]));
	const afterById = new Map(after.map(model => [model.id, model]));
	for (const model of after) {
		const previous = beforeById.get(model.id);
		if (!previous) {
			// 新增/重新上架：附带公开字段摘要，让公告不只是孤零零一个名字；名称已在卡片标题展示故剔除
			const fields = Object.entries(model.fields)
				.filter(([label]) => label !== '名称')
				.map(([label, after]) => ({ label, before: '', after }));
			changes.push({ kind, modelId: model.id, modelName: model.name, type: previousIds.has(model.id) ? 'relisted' : 'added', fields });
			continue;
		}
		const fields: AgentModelChange['fields'] = [];
		for (const label of new Set([...Object.keys(previous.fields), ...Object.keys(model.fields)])) {
			const oldValue = previous.fields[label] ?? '不适用';
			const newValue = model.fields[label] ?? '不适用';
			if (oldValue !== newValue) fields.push({ label, before: oldValue, after: newValue });
		}
		if (fields.length > 0) changes.push({ kind, modelId: model.id, modelName: model.name, type: 'modified', fields });
	}
	for (const model of before) {
		if (!afterById.has(model.id)) changes.push({ kind, modelId: model.id, modelName: model.name, type: 'removed', fields: [] });
	}
	return changes;
}

export function buildAgentModelChanges(before: MiMeta, after: MiMeta): AgentModelChange[] {
	const changes = [
		...diffModels('chat', chatSnapshots(before), chatSnapshots(after), new Set(getEffectiveLlmModels(before).map(model => model.id))),
		...diffModels('image', imageSnapshots(before), imageSnapshots(after), new Set(getEffectiveImageModels(before, true).map(model => model.id))),
	];
	if (before.agentDefaultModelId !== after.agentDefaultModelId) {
		const modelName = (meta: MiMeta) => packPublicAgentModels(meta).find(model => model.id === meta.agentDefaultModelId)?.name ?? '自动选择';
		const previous = modelName(before);
		const next = modelName(after);
		if (previous !== next) changes.push({ kind: 'chat', modelId: '', modelName: '默认对话模型', type: 'modified', fields: [{ label: '默认模型', before: previous, after: next }] });
	}
	return changes;
}
