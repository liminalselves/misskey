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
		banned: {
			message: 'You are banned from this room.',
			code: 'BANNED_FROM_ROOM',
			id: 'f2f93801-0896-44d0-b32d-067eb4df350d',
			httpStatusCode: 403,
		},
		blocked: {
			message: 'You have been blocked by the room owner.',
			code: 'YOU_HAVE_BEEN_BLOCKED',
			id: 'b84a73e5-5cc4-4cf7-a5c0-5b3b3f5318ea',
			httpStatusCode: 403,
		},
		roomArchived: {
			message: 'This room has been archived.',
			code: 'ROOM_ARCHIVED',
			id: '20d79616-8e0f-461c-aa0c-bbd932406b63',
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
				} else if (e.message === 'banned') {
					throw new ApiError(meta.errors.banned);
				} else if (e.message === 'blocked') {
					throw new ApiError(meta.errors.blocked);
				} else if (e.message === 'room is archived') {
					throw new ApiError(meta.errors.roomArchived);
				}
				throw e;
			}
		});
	}
}
