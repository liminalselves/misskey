/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ChatService } from '@/core/ChatService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
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
		private globalEventService: GlobalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.userId) {
				await this.chatService.checkChatAvailability(me.id, 'read');
				await this.chatService.readUserChatMessage(me.id, ps.userId);

				// 发送 chatRead 事件通知前端刷新未读状态
				const hasUnread = await this.chatService.hasUnreadMessages(me.id);
				this.globalEventService.publishMainStream(me.id, 'chatRead', {
					hasUnreadChatMessages: hasUnread,
				});
			} else if (ps.roomId) {
				await this.chatService.checkChatAvailability(me.id, 'read');
				await this.chatService.readRoomChatMessage(me.id, ps.roomId);

				// 发送 chatRead 事件通知前端刷新未读状态
				const hasUnread = await this.chatService.hasUnreadMessages(me.id);
				this.globalEventService.publishMainStream(me.id, 'chatRead', {
					hasUnreadChatMessages: hasUnread,
				});
			} else {
				// 此时什么都不做，或者报错？
				// 保持静默或者返回
			}
		});
	}
}
