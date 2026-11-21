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
export class ChatUserChannel extends Channel {
	public readonly chName = 'chatUser';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:chat';
	private otherId: string;

	constructor(
		@Inject(REQUEST)
		request: ChannelRequest,

		private chatService: ChatService,
		private globalEventService: GlobalEventService,
	) {
		super(request);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (typeof params.otherId !== 'string') return false;
		if (!this.user) return false;
		if (params.otherId === this.user.id) return false;
		if (!(await this.chatService.getChatAvailability(this.user.id)).read) return false;

		this.otherId = params.otherId;

		this.subscriber.on(`chatUserStream:${this.user.id}-${this.otherId}`, this.onEvent);

		return true;
	}

	@bindThis
	private async onEvent(data: GlobalEvents['chatUser']['payload']) {
		this.send(data.type, data.body);
	}

	@bindThis
	public async onMessage(type: string, body: any) {
		switch (type) {
			case 'read':
				if (this.otherId) {
					await this.chatService.readUserChatMessage(this.user!.id, this.otherId);
				}
				break;
		}
	}

	@bindThis
	public dispose() {
		this.subscriber.off(`chatUserStream:${this.user!.id}-${this.otherId}`, this.onEvent);
	}
}
