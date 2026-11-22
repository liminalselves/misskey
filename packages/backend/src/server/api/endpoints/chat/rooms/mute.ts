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
			id: 'c2cde4eb-8d0f-42f1-8f2f-c4d6bfc8e5df',
		},
		notAMember: {
			message: 'You are not a member of this room.',
			code: 'NOT_A_MEMBER',
			id: 'ef86ab8a-c872-4754-8868-099f487f0e54',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		mute: { type: 'boolean' },
	},
	required: ['roomId', 'mute'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			try {
				await this.chatService.muteRoom(me.id, ps.roomId, ps.mute);
			} catch (e: any) {
				if (e instanceof EntityNotFoundError || e?.message === 'no such room') throw new ApiError(meta.errors.noSuchRoom);
				if (e?.message === 'you are not a member of the room') throw new ApiError(meta.errors.notAMember);
				throw e;
			}
		});
	}
}
