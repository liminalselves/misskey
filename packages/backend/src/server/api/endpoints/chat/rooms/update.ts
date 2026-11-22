/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ChatService, getRoomSuspensionInfo } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import type { ChatRoomMembershipsRepository } from '@/models/_.js';

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
		roomSuspended: {
			message: 'You have been suspended from this room.',
			code: 'ROOM_SUSPENDED',
			id: '7a70ba98-44a9-4348-a385-4783a920050b',
			httpStatusCode: 403,
		},
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'fcdb0f92-bda6-47f9-bd05-343e0e020932',
		},
		permissionDenied: {
			message: 'Permission denied.',
			code: 'PERMISSION_DENIED',
			id: 'bf134406-234c-4c1b-80e7-4482ea7c50c4',
			httpStatusCode: 403,
		},
		invalidName: {
			message: 'Invalid room name.',
			code: 'INVALID_NAME',
			id: '02e3443d-9eed-4dc2-91ec-4b84b57d1f0a',
		},
		invalidIconUrl: {
			message: 'Invalid icon URL.',
			code: 'INVALID_ICON_URL',
			id: 'a7e89cd0-1b0f-40f6-8e85-525f99a96b7d',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1, maxLength: 256 },
		description: { type: 'string', maxLength: 2048 },
		isPublic: { type: 'boolean' },
		iconUrl: { type: 'string', nullable: true, maxLength: 1024 },
		announcement: { type: 'string', nullable: true, maxLength: 2048 },
		allowMemberInvite: { type: 'boolean' },
		isArchived: { type: 'boolean' },
	},
	required: ['roomId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			const room = await this.chatService.findRoomById(ps.roomId);
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}

			const isOwner = room.ownerId === me.id;
			if (!isOwner) {
				const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId: me.id });
				if (membership == null || membership.role !== 'admin') {
					throw new ApiError(meta.errors.permissionDenied);
				}
				if (membership.suspendedUntil && new Date() < membership.suspendedUntil) {
					throw new ApiError(meta.errors.roomSuspended, getRoomSuspensionInfo(membership.suspendedUntil));
				}
				if (ps.isPublic !== undefined || ps.isArchived !== undefined) {
					throw new ApiError(meta.errors.permissionDenied);
				}
			}

			try {
				const updated = await this.chatService.updateRoom(room, {
					name: ps.name,
					description: ps.description,
					isPublic: ps.isPublic,
					iconUrl: ps.iconUrl,
					announcement: ps.announcement,
					allowMemberInvite: ps.allowMemberInvite,
					isArchived: ps.isArchived,
				});

				return this.chatEntityService.packRoom(updated, me);
			} catch (e: any) {
				if (e?.message === 'invalid name') throw new ApiError(meta.errors.invalidName);
				if (e?.message === 'invalid iconUrl') throw new ApiError(meta.errors.invalidIconUrl);
				throw e;
			}
		});
	}
}
