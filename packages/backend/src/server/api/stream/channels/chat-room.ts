/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import type { JsonObject } from '@/misc/json-value.js';
import { ChatService } from '@/core/ChatService.js';
import Channel, { type ChannelRequest } from '../channel.js';
import { REQUEST } from '@nestjs/core';
import type { ChatRoomsRepository } from '@/models/_.js';

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

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		private chatService: ChatService,
		private globalEventService: GlobalEventService,
	) {
		super(request);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (typeof params.roomId !== 'string') return false;
		if (!this.user) return false;
		if (!(await this.chatService.getChatAvailability(this.user.id)).read) return false;

		this.roomId = params.roomId;

		const room = await this.chatRoomsRepository.findOneBy({
			id: this.roomId,
		});

		if (room == null) return false;
		if (!(await this.chatService.hasPermissionToViewRoomTimeline(this.user.id, room))) return false;

		this.subscriber.on(`chatRoomStream:${this.roomId}`, this.onEvent);

		return true;
	}

	@bindThis
	private async onEvent(data: GlobalEvents['chatRoom']['payload']) {
		this.send(data.type, data.body);

		if (
			data.type === 'roomDeleted' ||
			((data.type === 'memberKicked' || data.type === 'memberBanned' || data.type === 'memberLeft') && (data.body as any)?.userId === this.user?.id)
		) {
			this.connection.disconnectChannel(this.id);
		}
	}

	@bindThis
	public async onMessage(type: string, body: any) {
		switch (type) {
			case 'read':
				if (this.roomId) {
					await this.chatService.readRoomChatMessage(this.user!.id, this.roomId);
				}
				break;
		}
	}

	@bindThis
	public dispose() {
		this.subscriber.off(`chatRoomStream:${this.roomId}`, this.onEvent);
	}
}
