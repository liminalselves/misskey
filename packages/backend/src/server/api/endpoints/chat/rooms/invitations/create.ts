/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { EntityNotFoundError } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	limit: {
		duration: ms('1day'),
		max: 50,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoomInvitation',
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '916f9507-49ba-4e90-b57f-1fd4deaa47a5',
		},
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '7a392b11-bce4-486c-933b-e9d3b9dcfc13',
		},
		yourself: {
			message: 'You cannot invite yourself.',
			code: 'CANNOT_INVITE_YOURSELF',
			id: '338dd9a1-a967-4dec-8463-98311129fe28',
		},
		permissionDenied: {
			message: 'Permission denied.',
			code: 'PERMISSION_DENIED',
			id: '3938bb2c-e666-49bd-ab33-077e9d4b1a6d',
			httpStatusCode: 403,
		},
		alreadyMember: {
			message: 'User is already a member of this room.',
			code: 'ALREADY_MEMBER',
			id: '81ec7bb2-73d9-48b6-9b0b-840aa943bc58',
		},
		alreadyInvited: {
			message: 'User has already been invited to this room.',
			code: 'ALREADY_INVITED',
			id: '5c7cfa4b-070c-427f-9ea2-df25eddd0aa2',
		},
		roomIsFull: {
			message: 'This room is full.',
			code: 'ROOM_IS_FULL',
			id: '20f2d85e-af7b-44a6-a950-f327933a0051',
		},
		blocked: {
			message: 'Cannot invite this user due to blocking.',
			code: 'BLOCKED',
			id: '72ef70bf-7ce9-43cb-88ab-670b29c072a6',
			httpStatusCode: 403,
		},
		banned: {
			message: 'This user is banned from this room.',
			code: 'USER_BANNED',
			id: 'cfa1df7d-f160-474f-ad2c-01ddfb43e16f',
		},
		roomArchived: {
			message: 'This room has been archived.',
			code: 'ROOM_ARCHIVED',
			id: '01cd780c-749c-47d3-bd08-b9d4daaac31f',
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

			const room = await this.chatService.findRoomById(ps.roomId);
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}

			try {
				const invitation = await this.chatService.createRoomInvitation(me.id, room.id, ps.userId);
				return await this.chatEntityService.packRoomInvitation(invitation, me);
			} catch (e: any) {
				if (e instanceof EntityNotFoundError || e?.message === 'no such room') throw new ApiError(meta.errors.noSuchRoom);
				if (e?.message === 'no such user') throw new ApiError(meta.errors.noSuchUser);
				if (e?.message === 'yourself') throw new ApiError(meta.errors.yourself);
				if (e?.message === 'permission denied') throw new ApiError(meta.errors.permissionDenied);
				if (e?.message === 'already member') throw new ApiError(meta.errors.alreadyMember);
				if (e?.message === 'already invited') throw new ApiError(meta.errors.alreadyInvited);
				if (e?.message === 'room is full') throw new ApiError(meta.errors.roomIsFull);
				if (e?.message === 'blocked') throw new ApiError(meta.errors.blocked);
				if (e?.message === 'banned') throw new ApiError(meta.errors.banned);
				if (e?.message === 'room is archived') throw new ApiError(meta.errors.roomArchived);
				throw e;
			}
		});
	}
}
