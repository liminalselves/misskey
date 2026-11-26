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
			id: '9b5839b9-0ba0-4351-8c35-37082093d200',
		},
		roomSuspended: {
			message: 'You have been suspended from this room.',
			code: 'ROOM_SUSPENDED',
			id: '2bb244f4-217b-4a7c-b084-27e6eb241067',
		},
		roomArchived: {
			message: 'This room has been archived.',
			code: 'ROOM_ARCHIVED',
			id: '4816c241-60d0-420e-b32b-20f940fb5130',
		},
		noSuchEmoji: {
			message: 'No such emoji.',
			code: 'NO_SUCH_EMOJI',
			id: '655f18ae-6c74-40be-a75d-122c3dd7f4ea',
		},
		invalidEmoji: {
			message: 'Invalid emoji.',
			code: 'INVALID_EMOJI',
			id: '5f72a044-2526-4a57-8fd4-6597bbc7b261',
		},
		tooManyReactions: {
			message: 'Too many reactions on this message.',
			code: 'TOO_MANY_REACTIONS',
			id: '0143ae06-52bb-4c3a-8290-11223fd9a7ae',
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
				await this.chatService.react(ps.messageId, me.id, ps.reaction);
			} catch (e: any) {
				if (e instanceof ChatMessageAccessError) throw new ApiError(meta.errors.noSuchMessage);
				if (e?.message === 'user has been suspended from this room') throw new ApiError(meta.errors.roomSuspended, e?.info);
				if (e?.message === 'room is archived') throw new ApiError(meta.errors.roomArchived);
				if (e?.message === 'no such emoji') throw new ApiError(meta.errors.noSuchEmoji);
				if (e?.message === 'invalid emoji') throw new ApiError(meta.errors.invalidEmoji);
				if (e?.message === 'too many reactions') throw new ApiError(meta.errors.tooManyReactions);
				throw e;
			}
		});
	}
}
