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
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'cb7f3179-50e8-4389-8c30-dbe2650a67c9',
		},
		permissionDenied: {
			message: 'Permission denied.',
			code: 'PERMISSION_DENIED',
			id: '28f00144-b24d-4a61-b86e-312d7c9ce2c9',
			httpStatusCode: 403,
		},
		cannotSuspendOwner: {
			message: 'Cannot suspend the room owner.',
			code: 'CANNOT_SUSPEND_OWNER',
			id: '2cb97988-9889-44e6-adc7-9b3ff527f64c',
		},
		notAMember: {
			message: 'User is not a member of this room.',
			code: 'NOT_A_MEMBER',
			id: 'fd224ab3-295e-4b31-8c34-915a209b7475',
		},
		invalidParam: {
			message: 'Invalid expiration date.',
			code: 'INVALID_PARAM',
			id: '7a17291a-e275-4b3d-8169-dda9514fff12',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
		expiredAt: { type: 'string', format: 'date-time' },
	},
	required: ['roomId', 'userId', 'expiredAt'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			const expiredAt = new Date(ps.expiredAt);
			if (Number.isNaN(expiredAt.getTime()) || expiredAt <= new Date()) {
				throw new ApiError(meta.errors.invalidParam);
			}

			try {
				await this.chatService.suspend(me, ps.roomId, ps.userId, expiredAt);
			} catch (e: any) {
				if (e instanceof EntityNotFoundError || e?.message === 'no such room') throw new ApiError(meta.errors.noSuchRoom);
				if (e?.message === 'permission denied') throw new ApiError(meta.errors.permissionDenied);
				if (e?.message === 'cannot suspend owner') throw new ApiError(meta.errors.cannotSuspendOwner);
				if (e?.message === 'not a member') throw new ApiError(meta.errors.notAMember);
				throw e;
			}
		});
	}
}
