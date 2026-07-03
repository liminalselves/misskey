/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaService } from '@/core/MetaService.js';
import { resolveAgentImageArtistPresets } from '@/core/agent-image-presets.js';

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
				thumbnailUrl: { type: 'string', nullable: true },
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
		metaService: MetaService,
	) {
		super(meta, paramDef, async () => {
			const instance = await metaService.fetch(true);
			return resolveAgentImageArtistPresets(instance.agentImageArtistPresets).map(p => ({
			id: p.id,
			name: p.name,
			thumbnailUrl: p.thumbnailUrl ?? null,
			}));
		});
	}
}
