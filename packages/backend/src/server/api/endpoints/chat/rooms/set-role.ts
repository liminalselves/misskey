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
		ref: 'ChatRoomMembership',
	},

	errors: {
		roomSuspended: {
			message: 'You have been suspended from this room.',
			code: 'ROOM_SUSPENDED',
			id: '6891ce08-f26c-40db-ba98-5fdd8eb2cbb8',
			httpStatusCode: 403,
		},
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'ecc7192b-c767-4ec3-9406-9a47abb64a49',
		},
		permissionDenied: {
			message: 'Permission denied.',
			code: 'PERMISSION_DENIED',
			id: '7a55363b-17f1-4d56-837e-a67a6e71682f',
			httpStatusCode: 403,
		},
		cannotSetOwnerRole: {
			message: 'Cannot change the role of the room owner.',
			code: 'CANNOT_SET_OWNER_ROLE',
			id: '93594e82-1558-4fa2-b003-e8052dab71da',
		},
		notAMember: {
			message: 'User is not a member of this room.',
			code: 'NOT_A_MEMBER',
			id: '3634abf3-a0ca-40dc-a459-c708ddae378e',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
		role: { type: 'string', enum: ['member', 'admin'] },
	},
	required: ['roomId', 'userId', 'role'],
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
				const membership = await this.chatService.setMemberRole(me, ps.roomId, ps.userId, ps.role);
				return await this.chatEntityService.packRoomMembership(membership, me, {
					populateUser: true,
					populateRoom: false,
				});
			} catch (e: any) {
				if (e?.message === 'no such room') throw new ApiError(meta.errors.noSuchRoom);
				if (e?.message === 'user has been suspended from this room') throw new ApiError(meta.errors.roomSuspended, e?.info);
				if (e?.message === 'permission denied') throw new ApiError(meta.errors.permissionDenied);
				if (e?.message === 'cannot set owner role') throw new ApiError(meta.errors.cannotSetOwnerRole);
				if (e?.message === 'not a member') throw new ApiError(meta.errors.notAMember);
				throw e;
			}
		});
	}
}
