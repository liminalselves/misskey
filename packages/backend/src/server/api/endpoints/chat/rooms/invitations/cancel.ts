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

	kind: 'write:chat',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {},
	},

	errors: {
		roomSuspended: {
			message: 'You have been suspended from this room.',
			code: 'ROOM_SUSPENDED',
			id: 'b70b3fa3-aaed-49e1-9bba-6e3a97c5ed66',
			httpStatusCode: 403,
		},
		noSuchInvitation: {
			message: 'No such invitation.',
			code: 'NO_SUCH_INVITATION',
			id: 'ee85ed1f-9a00-4f6c-bd68-8c4c58ae880b',
		},
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '6cef18bf-3a78-41d0-b3dc-fdb95403a23c',
		},
		permissionDenied: {
			message: 'Permission denied.',
			code: 'PERMISSION_DENIED',
			id: 'b07b48cd-d411-40a5-8625-470b9f8f02a7',
			httpStatusCode: 403,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		invitationId: { type: 'string', format: 'misskey:id' },
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
	},
	anyOf: [
		{ required: ['invitationId'] },
		{ required: ['roomId', 'userId'] },
	],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			try {
				await this.chatService.cancelRoomInvitation(me, {
					invitationId: ps.invitationId,
					roomId: ps.roomId,
					userId: ps.userId,
				});
				return {};
			} catch (e: any) {
				if (e?.message === 'no such invitation') throw new ApiError(meta.errors.noSuchInvitation);
				if (e?.message === 'no such room') throw new ApiError(meta.errors.noSuchRoom);
				if (e?.message === 'user has been suspended from this room') throw new ApiError(meta.errors.roomSuspended, e?.info);
				if (e?.message === 'permission denied') throw new ApiError(meta.errors.permissionDenied);
				throw e;
			}
		});
	}
}
