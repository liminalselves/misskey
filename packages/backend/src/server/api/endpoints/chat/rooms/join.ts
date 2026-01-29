/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '84416476-5ce8-4a2c-b568-9569f1b10733',
		},
		alreadyMember: {
			message: 'Already a member of this room.',
			code: 'ALREADY_MEMBER',
			id: '4132354c-1383-4ef5-80cc-6dafc1d8769f',
		},
		roomIsFull: {
			message: 'This room is full.',
			code: 'ROOM_IS_FULL',
			id: 'f5c1a9e2-9e87-4c67-8c3b-1a2b3c4d5e6f',
		},
		noInvitation: {
			message: 'You need an invitation to join this room.',
			code: 'NO_INVITATION',
			id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
	},
	required: ['roomId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			try {
				await this.chatService.joinToRoom(me.id, ps.roomId);
			} catch (e: any) {
				if (e.message === 'already member') {
					throw new ApiError(meta.errors.alreadyMember);
				} else if (e.message === 'room is full') {
					throw new ApiError(meta.errors.roomIsFull);
				} else if (e.message === 'no invitation') {
					throw new ApiError(meta.errors.noInvitation);
				} else if (e.message === 'no such room') {
					throw new ApiError(meta.errors.noSuchRoom);
				}
				throw e;
			}
		});
	}
}
