/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatMessageAccessError, ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
		noSuchMessage: {
			message: 'No such message.',
			code: 'NO_SUCH_MESSAGE',
			id: '36b67f0e-66a6-414b-83df-992a55294f17',
		},
		recallTimeExpired: {
			message: 'Cannot recall messages older than 2 minutes.',
			code: 'RECALL_TIME_EXPIRED',
			id: 'c3d2d37b-d5d4-43c9-9f9b-83cc253f0021',
			httpStatusCode: 400,
		},
		alreadyRecalled: {
			message: 'Message has already been recalled.',
			code: 'ALREADY_RECALLED',
			id: '89d4bb25-56fb-4c88-a2df-47fd75a7d8aa',
			httpStatusCode: 400,
		},
		roomArchived: {
			message: 'Room is archived.',
			code: 'ROOM_ARCHIVED',
			id: '041d7313-3b2a-43e1-ae9d-25a8f9a10332',
			httpStatusCode: 403,
		},
		roomSuspended: {
			message: 'You have been suspended from this room.',
			code: 'ROOM_SUSPENDED',
			id: '24754807-48b6-46cb-bc93-2fd58fd935f2',
			httpStatusCode: 403,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		messageId: { type: 'string', format: 'misskey:id' },
	},
	required: ['messageId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			try {
				await this.chatService.recallMessage(me.id, ps.messageId);
			} catch (e: any) {
				if (e instanceof ChatMessageAccessError) {
					if (e.message === 'recall time expired') throw new ApiError(meta.errors.recallTimeExpired);
					if (e.message === 'already recalled') throw new ApiError(meta.errors.alreadyRecalled);
					if (e.message === 'room is archived') throw new ApiError(meta.errors.roomArchived);
					throw new ApiError(meta.errors.noSuchMessage);
				}
				if (e?.message === 'user has been suspended from this room') {
					throw new ApiError(meta.errors.roomSuspended, e.info);
				}
				throw e;
			}
		});
	}
}

