/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaService } from '@/core/MetaService.js';
import { AgentImageService } from '@/core/AgentImageService.js';

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
				provider: { type: 'string', enum: ['aurora'] },
				apiModelName: { type: 'string', nullable: true },
				costPerCall: { type: 'number' },
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
	) {
		super(meta, paramDef, async () => {
			const instance = await this.metaService.fetch(true);
			return this.agentImageService.listAvailableImageModels(instance).map(m => ({
				id: m.id,
				name: m.name,
				provider: m.provider,
				apiModelName: m.apiModelName ?? null,
				costPerCall: Math.max(0, Number(m.costPerCall) || 0),
				defaultParams: m.defaultParams ?? {},
				defaultArtistPresetId: m.defaultArtistPresetId ?? null,
			}));
		});
	}
}
