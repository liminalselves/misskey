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
		ref: 'ChatRoomBan',
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '30849815-f23c-428f-b346-dbe44d961e7e',
		},
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '00346563-b0db-4028-9b0a-6ad182e061ba',
		},
		permissionDenied: {
			message: 'Permission denied.',
			code: 'PERMISSION_DENIED',
			id: '8c27c8f7-49c8-4eed-a8b4-d11f85caf91f',
			httpStatusCode: 403,
		},
		cannotBanOwner: {
			message: 'Cannot ban the room owner.',
			code: 'CANNOT_BAN_OWNER',
			id: '129b9554-f666-4402-9e89-1235b2b66e07',
		},
		cannotBanYourself: {
			message: 'Cannot ban yourself.',
			code: 'CANNOT_BAN_YOURSELF',
			id: '4a1f456d-c38c-42c7-a797-58f13158aff7',
		},
		alreadyBanned: {
			message: 'User is already banned from this room.',
			code: 'ALREADY_BANNED',
			id: '20db0e64-ef0d-46c0-8b48-50223f3fe6a1',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
		reason: { type: 'string', nullable: true, maxLength: 256 },
	},
	required: ['roomId', 'userId'],
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
				const ban = await this.chatService.banUserFromRoom(me, ps.roomId, ps.userId, ps.reason);
				return await this.chatEntityService.packRoomBan(ban, me);
			} catch (e: any) {
				if (e?.message === 'no such room') throw new ApiError(meta.errors.noSuchRoom);
				if (e?.message === 'no such user') throw new ApiError(meta.errors.noSuchUser);
				if (e?.message === 'permission denied') throw new ApiError(meta.errors.permissionDenied);
				if (e?.message === 'cannot ban owner') throw new ApiError(meta.errors.cannotBanOwner);
				if (e?.message === 'yourself') throw new ApiError(meta.errors.cannotBanYourself);
				if (e?.message === 'already banned') throw new ApiError(meta.errors.alreadyBanned);
				throw e;
			}
		});
	}
}
