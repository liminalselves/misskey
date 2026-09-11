/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentStickerService, agentStickerErrors } from '@/core/AgentStickerService.js';
import { MetaService } from '@/core/MetaService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requiredRolePolicy: 'canManageCustomEmojis',
	kind: 'write:admin:emoji',
	limit: {
		duration: 60 * 60 * 1000,
		max: 30,
	},

	errors: {
		...agentStickerErrors,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			queued: { type: 'number' },
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
		private agentStickerService: AgentStickerService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const instance = await this.metaService.fetch(true);
			return this.agentStickerService.startBatchFill(instance, me);
		});
	}
}
