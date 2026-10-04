/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'read:chat',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			// 未读条数。有未读但条数未知（存量数据无计数）时为 null
			count: { type: 'number', optional: false, nullable: true },
			// 首条未读消息 id（同上，存量数据无此记录时为 null）
			firstUnreadId: { type: 'string', optional: false, nullable: true },
		},
	},

	errors: {
		invalidParam: {
			message: 'Invalid param.',
			code: 'INVALID_PARAM',
			id: '3f81e4b7-7e3c-4b1a-9c2e-2d2f0b1a9e01',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: {
			type: 'string',
			format: 'misskey:id',
		},
		roomId: {
			type: 'string',
			format: 'misskey:id',
		},
	},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'read');

			if (ps.userId) {
				return await this.chatService.getUserChatUnreadInfo(me.id, ps.userId);
			} else if (ps.roomId) {
				return await this.chatService.getRoomChatUnreadInfo(me.id, ps.roomId);
			} else {
				throw new ApiError(meta.errors.invalidParam);
			}
		});
	}
}
