/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { bindThis } from '@/decorators.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import type { JsonObject } from '@/misc/json-value.js';
import { ChatService } from '@/core/ChatService.js';
import Channel, { type ChannelRequest } from '../channel.js';

@Injectable({ scope: Scope.TRANSIENT })
export class ChatRoomChannel extends Channel {
	public readonly chName = 'chatRoom';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:chat';
	private roomId: string;

	constructor(
		@Inject(REQUEST)
		request: ChannelRequest,

		private chatService: ChatService,
		private globalEventService: GlobalEventService,
	) {
		super(request);
	}

	@bindThis
	public async init(params: JsonObject) {
		if (typeof params.roomId !== 'string') return;
		this.roomId = params.roomId;

		this.subscriber.on(`chatRoomStream:${this.roomId}`, this.onEvent);
	}

	@bindThis
	private async onEvent(data: GlobalEvents['chatRoom']['payload']) {
		this.send(data.type, data.body);
	}

	@bindThis
	public async onMessage(type: string, body: any) {
		switch (type) {
			case 'read':
				if (this.roomId) {
					await this.chatService.readRoomChatMessage(this.user!.id, this.roomId);
					// 发送 chatRead 事件通知前端刷新未读状态
					// 这样 MkChatHistories 会重新获取数据并更新 isRead 状态
					const hasUnread = await this.chatService.hasUnreadMessages(this.user!.id);
					this.globalEventService.publishMainStream(this.user!.id, 'chatRead', {
						hasUnreadChatMessages: hasUnread,
					});
				}
				break;
		}
	}

	@bindThis
	public dispose() {
		this.subscriber.off(`chatRoomStream:${this.roomId}`, this.onEvent);
	}
}
