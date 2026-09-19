/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaService } from '@/core/MetaService.js';
import { AgentImageService } from '@/core/AgentImageService.js';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';
import { AGENT_IMAGE_PROVIDER_IDS } from '@/models/AgentImageProvider.js';
import type { AgentImageProvider } from '@/models/AgentImageProvider.js';
import { getAgentImageProviderDefinition } from '@/core/agent-image-providers.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:chat',
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			properties: {
				id: { type: 'string' },
				name: { type: 'string' },
				description: { type: 'string', nullable: true },
				provider: { type: 'string', enum: AGENT_IMAGE_PROVIDER_IDS },
				apiModelName: { type: 'string', nullable: true },
				supportsReferenceImage: { type: 'boolean' },
				supportsSizeSelection: { type: 'boolean' },
				supportsAdvancedParams: { type: 'boolean' },
				supportsArtistPreset: { type: 'boolean' },
				costPerCall: { type: 'number' },
				freeQuotaUsed: { type: 'integer' },
				freeQuotaTotal: { type: 'integer' },
				defaultParams: { type: 'object' },
				defaultArtistPresetId: { type: 'string', nullable: true },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private metaService: MetaService,
		private agentImageService: AgentImageService,
		private agentModelUsageService: AgentModelUsageService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const instance = await this.metaService.fetch(true);
			const models = this.agentImageService.listAvailableImageModels(instance);
			const out: {
				id: string; name: string; description: string | null; provider: AgentImageProvider;
				apiModelName: string | null; supportsReferenceImage: boolean; supportsSizeSelection: boolean;
				supportsAdvancedParams: boolean; supportsArtistPreset: boolean; costPerCall: number;
				freeQuotaUsed: number; freeQuotaTotal: number;
				defaultParams: Record<string, unknown>; defaultArtistPresetId: string | null;
			}[] = [];
			for (const m of models) {
				const provider = getAgentImageProviderDefinition(m.provider);
				const total = m.dailyFreeQuota ?? 0;
				const used = total > 0 ? await this.agentModelUsageService.getFreeQuotaUsed(me.id, m.id) : 0;
				out.push({
					id: m.id,
					name: m.name,
					description: m.description ?? null,
					provider: m.provider,
					apiModelName: m.apiModelName ?? null,
					supportsReferenceImage: m.supportsReferenceImage === true,
					supportsSizeSelection: provider.capabilities.supportsSizeSelection,
					supportsAdvancedParams: provider.capabilities.supportsAdvancedParams,
					supportsArtistPreset: provider.capabilities.supportsArtistPreset,
					costPerCall: Math.max(0, Number(m.costPerCall) || 0),
					freeQuotaUsed: used,
					freeQuotaTotal: total,
					defaultParams: m.defaultParams ?? {},
					defaultArtistPresetId: m.defaultArtistPresetId ?? null,
				});
			}
			return out;
		});
	}
}
