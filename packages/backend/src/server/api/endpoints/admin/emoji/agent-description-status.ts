/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentStickerService } from '@/core/AgentStickerService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requiredRolePolicy: 'canManageCustomEmojis',
	kind: 'read:admin:emoji',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			running: { type: 'boolean' },
			total: { type: 'number' },
			done: { type: 'number' },
			failed: { type: 'number' },
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
	) {
		super(meta, paramDef, async () => {
			return this.agentStickerService.getBatchFillStatus();
		});
	}
}
