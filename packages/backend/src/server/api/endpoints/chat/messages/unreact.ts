/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService, ChatMessageAccessError } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
		noSuchMessage: {
			message: 'No such message.',
			code: 'NO_SUCH_MESSAGE',
			id: 'c39ea42f-e3ca-428a-ad57-390e0a711595',
		},
		roomSuspended: {
			message: 'You have been suspended from this room.',
			code: 'ROOM_SUSPENDED',
			id: 'ca74262b-fee2-478f-98f5-2a741f80ae7f',
		},
		roomArchived: {
			message: 'This room has been archived.',
			code: 'ROOM_ARCHIVED',
			id: '5f5121e6-8522-4b3e-aa08-e45e066f06d3',
		},
		invalidEmoji: {
			message: 'Invalid emoji.',
			code: 'INVALID_EMOJI',
			id: '6652e97a-0eba-4f55-8202-60a7eb5a5880',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		messageId: { type: 'string', format: 'misskey:id' },
		reaction: { type: 'string' },
	},
	required: ['messageId', 'reaction'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			// メッセージの存在有無をエラー内容から判別できないようにする
			try {
				await this.chatService.unreact(ps.messageId, me.id, ps.reaction);
			} catch (e: any) {
				if (e instanceof ChatMessageAccessError) throw new ApiError(meta.errors.noSuchMessage);
				if (e?.message === 'user has been suspended from this room') throw new ApiError(meta.errors.roomSuspended, e?.info);
				if (e?.message === 'room is archived') throw new ApiError(meta.errors.roomArchived);
				if (e?.message === 'invalid emoji') throw new ApiError(meta.errors.invalidEmoji);
				throw e;
			}
		});
	}
}
