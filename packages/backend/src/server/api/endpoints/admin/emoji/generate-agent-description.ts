/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentStickerService, AGENT_STICKER_DESCRIPTION_MAX, agentStickerErrors } from '@/core/AgentStickerService.js';
import { MetaService } from '@/core/MetaService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requiredRolePolicy: 'canManageCustomEmojis',
	kind: 'write:admin:emoji',
	// 每次调用都是一次计费识图请求，限流防止连点造成意外开销
	limit: { duration: ms('1hour'), max: 300 },

	errors: {
		...agentStickerErrors,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			description: { type: 'string' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		emojiId: { type: 'string', format: 'misskey:id' },
	},
	required: ['emojiId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private agentStickerService: AgentStickerService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const instance = await this.metaService.fetch(true);
			const description = await this.agentStickerService.generateDescriptionForEmoji(instance, me, ps.emojiId);
			return { description: description.slice(0, AGENT_STICKER_DESCRIPTION_MAX) };
		});
	}
}
