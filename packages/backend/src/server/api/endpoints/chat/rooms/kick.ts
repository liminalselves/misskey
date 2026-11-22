/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
		roomSuspended: {
			message: 'You have been suspended from this room.',
			code: 'ROOM_SUSPENDED',
			id: '48ee3509-e7cb-4c7c-8e5b-15504eb51d25',
			httpStatusCode: 403,
		},
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'cb7f3179-50e8-4389-8c30-dbe2650a67c9',
		},
		permissionDenied: {
			message: 'Permission denied.',
			code: 'PERMISSION_DENIED',
			id: 'af76e7cc-baed-4bd6-b5ac-879e744656cc',
			httpStatusCode: 403,
		},
		cannotKickOwner: {
			message: 'Cannot kick the room owner.',
			code: 'CANNOT_KICK_OWNER',
			id: '7042e118-ab0c-44c9-a659-8ad65df067a3',
		},
		notAMember: {
			message: 'User is not a member of this room.',
			code: 'NOT_A_MEMBER',
			id: 'fe9f22bd-4889-45f6-bc1b-931ec3bd074a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
		ban: { type: 'boolean', default: false },
	},
	required: ['roomId', 'userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			try {
				await this.chatService.kick(me, ps.roomId, ps.userId, { ban: ps.ban });
			} catch (e: any) {
				if (e instanceof EntityNotFoundError || e?.message === 'no such room') throw new ApiError(meta.errors.noSuchRoom);
				if (e?.message === 'user has been suspended from this room') throw new ApiError(meta.errors.roomSuspended, e?.info);
				if (e?.message === 'permission denied') throw new ApiError(meta.errors.permissionDenied);
				if (e?.message === 'cannot kick owner') throw new ApiError(meta.errors.cannotKickOwner);
				if (e?.message === 'not a member') throw new ApiError(meta.errors.notAMember);
				throw e;
			}
		});
	}
}
