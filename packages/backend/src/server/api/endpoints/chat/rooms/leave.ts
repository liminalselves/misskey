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
		notAMember: {
			message: 'You are not a member of this room.',
			code: 'NOT_A_MEMBER',
			id: '3f9f2054-e638-42dc-baf1-96c4b27f977d',
		},
		ownerCannotLeave: {
			message: 'The room owner cannot leave without transferring ownership.',
			code: 'OWNER_CANNOT_LEAVE',
			id: '480b8138-8dd2-4600-8fa9-a5f88294a2b8',
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
			await this.chatService.checkChatAvailability(me.id, 'read');

			try {
				await this.chatService.leaveRoom(me.id, ps.roomId);
			} catch (e: any) {
				if (e instanceof EntityNotFoundError || e?.message === 'no such room') throw new ApiError(meta.errors.noSuchRoom);
				if (e?.message === 'not a member') throw new ApiError(meta.errors.notAMember);
				if (e?.message === 'owner cannot leave') throw new ApiError(meta.errors.ownerCannotLeave);
				throw e;
			}
		});
	}
}
