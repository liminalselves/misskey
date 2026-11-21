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
			id: '5130557e-5a11-4cfb-9cc5-fe60cda5de0d',
		},
		noSuchInvitation: {
			message: 'No such invitation.',
			code: 'NO_SUCH_INVITATION',
			id: 'eebbfdf0-e868-443c-8074-32ad96fb0b35',
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
				await this.chatService.ignoreRoomInvitation(me.id, ps.roomId);
			} catch (e: any) {
				if (e instanceof EntityNotFoundError || e?.message === 'no such invitation') {
					throw new ApiError(meta.errors.noSuchInvitation);
				}
				if (e?.message === 'no such room') {
					throw new ApiError(meta.errors.noSuchRoom);
				}
				throw e;
			}
		});
	}
}
