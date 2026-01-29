/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'read:chat',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			ref: 'ChatRoom',
		},
	},

	errors: {
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string', maxLength: 100 },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
	},
	required: ['query'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'read');

			const rooms = await this.chatService.searchRooms(ps.query, ps.limit, ps.sinceId, ps.untilId);

			return await Promise.all(rooms.map(room => this.chatEntityService.packRoom(room, me)));
		});
	}
}
