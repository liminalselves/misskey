/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiAgentImageDefaultParams, MiAgentImageModel, MiMeta } from '@/models/Meta.js';
import { isAgentImageProvider } from '@/models/AgentImageProvider.js';
import { getAgentImageProviderDefinition } from '@/core/agent-image-providers.js';

export function normalizeImageParams(raw: unknown): MiAgentImageDefaultParams {
	return raw != null && typeof raw === 'object' ? raw as MiAgentImageDefaultParams : {};
}

export function getEffectiveImageModels(instance: MiMeta, includeDisabled = false): MiAgentImageModel[] {
	const configured = Array.isArray(instance.agentImageModels) ? instance.agentImageModels : [];
	const models = configured
		.filter((m): m is MiAgentImageModel => typeof m?.id === 'string' && m.id.trim() !== '' && isAgentImageProvider(m.provider))
		.map(m => {
			const provider = getAgentImageProviderDefinition(m.provider);
			return {
				id: m.id.trim(),
				name: typeof m.name === 'string' && m.name.trim() !== '' ? m.name.trim() : m.id.trim(),
				description: typeof m.description === 'string' && m.description.trim() !== '' ? m.description.trim() : null,
				provider: m.provider,
				enabled: m.enabled !== false,
				apiModelName: typeof m.apiModelName === 'string' && m.apiModelName.trim() !== '' ? m.apiModelName.trim() : instance.agentImageDefaultModel,
				apiUrl: typeof m.apiUrl === 'string' && m.apiUrl.trim() !== '' ? m.apiUrl.trim() : null,
				apiKey: typeof m.apiKey === 'string' && m.apiKey.trim() !== '' ? m.apiKey.trim() : null,
				supportsReferenceImage: provider.capabilities.supportsReferenceImage && m.supportsReferenceImage === true,
				costPerCall: typeof m.costPerCall === 'number' ? m.costPerCall : instance.agentImageCostPerCall,
				dailyFreeQuota: typeof m.dailyFreeQuota === 'number' && m.dailyFreeQuota > 0 ? Math.trunc(m.dailyFreeQuota) : null,
				defaultParams: normalizeImageParams(m.defaultParams ?? instance.agentImageDefaultParams),
				defaultArtistPresetId: typeof m.defaultArtistPresetId === 'string' ? m.defaultArtistPresetId : instance.agentImageDefaultArtistPresetId,
			};
		});
	return includeDisabled ? models : models.filter(m => m.enabled !== false);
}
