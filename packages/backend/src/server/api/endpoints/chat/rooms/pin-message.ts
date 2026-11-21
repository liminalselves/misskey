/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoom',
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'a93d3ffa-e225-4036-a0ff-1fb29ebc4bf3',
		},
		permissionDenied: {
			message: 'Permission denied.',
			code: 'PERMISSION_DENIED',
			id: '2ce842e5-66e5-4592-a9a3-7703febaedc9',
			httpStatusCode: 403,
		},
		noSuchMessage: {
			message: 'No such message.',
			code: 'NO_SUCH_MESSAGE',
			id: '9c984441-d1e1-474d-a576-83ff58e0ae12',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		messageId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: ['roomId', 'messageId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			try {
				const room = await this.chatService.pinMessage(me, ps.roomId, ps.messageId);
				return await this.chatEntityService.packRoom(room, me);
			} catch (e: any) {
				if (e?.message === 'no such room') throw new ApiError(meta.errors.noSuchRoom);
				if (e?.message === 'permission denied') throw new ApiError(meta.errors.permissionDenied);
				if (e?.message === 'no such message') throw new ApiError(meta.errors.noSuchMessage);
				throw e;
			}
		});
	}
}
