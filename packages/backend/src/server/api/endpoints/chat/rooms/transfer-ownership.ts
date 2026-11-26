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

	prohibitMoved: true,

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
			id: '275d0ce3-2910-4c6e-aaeb-222a906e02c0',
		},
		permissionDenied: {
			message: 'Permission denied.',
			code: 'PERMISSION_DENIED',
			id: '4d2569b9-372d-49fb-bd4b-85f8e6a39a76',
			httpStatusCode: 403,
		},
		cannotTransferToSelf: {
			message: 'Cannot transfer ownership to yourself.',
			code: 'CANNOT_TRANSFER_TO_SELF',
			id: 'aa16dc20-0931-479d-bee6-e5d082a9e129',
		},
		notAMember: {
			message: 'Target user is not a member of this room.',
			code: 'NOT_A_MEMBER',
			id: 'bb83e603-1850-4c39-b86f-015a831463a7',
		},
		banned: {
			message: 'Target user is banned from this room.',
			code: 'USER_BANNED',
			id: '3d5a4cc8-b4b3-48f2-96af-9fa89b1c016a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
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
				const room = await this.chatService.transferRoomOwnership(me, ps.roomId, ps.userId);
				return await this.chatEntityService.packRoom(room, me);
			} catch (e: any) {
				if (e?.message === 'no such room') throw new ApiError(meta.errors.noSuchRoom);
				if (e?.message === 'permission denied') throw new ApiError(meta.errors.permissionDenied);
				if (e?.message === 'yourself') throw new ApiError(meta.errors.cannotTransferToSelf);
				if (e?.message === 'not a member') throw new ApiError(meta.errors.notAMember);
				if (e?.message === 'banned') throw new ApiError(meta.errors.banned);
				throw e;
			}
		});
	}
}
