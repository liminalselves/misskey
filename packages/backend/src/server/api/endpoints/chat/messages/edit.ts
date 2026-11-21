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
		ref: 'ChatMessage',
	},

	errors: {
		noSuchMessage: {
			message: 'No such message.',
			code: 'NO_SUCH_MESSAGE',
			id: '9ebb0cc4-bc10-4e58-a31f-3addcc845bc8',
		},
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'ab806711-7b0f-476d-b660-65724b912770',
		},
		contentRequired: {
			message: 'Content required. Text cannot be empty.',
			code: 'CONTENT_REQUIRED',
			id: 'b1e2e5a1-ae99-4bc4-b2e7-5424c87ab907',
		},
		notAMember: {
			message: 'You are not a member of this room.',
			code: 'NOT_A_MEMBER',
			id: 'a893ae85-84f2-4d48-beeb-8153572bad42',
			httpStatusCode: 403,
		},
		roomSuspended: {
			message: 'You have been suspended from this room.',
			code: 'ROOM_SUSPENDED',
			id: 'a1acf76c-dcb0-4b68-b508-6a9ede5c85d6',
			httpStatusCode: 403,
		},
		roomArchived: {
			message: 'This room has been archived.',
			code: 'ROOM_ARCHIVED',
			id: '2e870893-f040-4257-9c40-a9510bcfdfba',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		messageId: { type: 'string', format: 'misskey:id' },
		text: { type: 'string', minLength: 1, maxLength: 2000 },
	},
	required: ['messageId', 'text'],
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
				const updated = await this.chatService.editMessage(me.id, ps.messageId, ps.text);
				return await this.chatEntityService.packMessageDetailed(updated, me);
			} catch (e: any) {
				if (e?.message === 'content required') throw new ApiError(meta.errors.contentRequired);
				if (e?.message === 'no such message') throw new ApiError(meta.errors.noSuchMessage);
				if (e?.message === 'no such room') throw new ApiError(meta.errors.noSuchRoom);
				if (e?.message === 'you are not a member of the room') throw new ApiError(meta.errors.notAMember);
				if (e?.message === 'user has been suspended from this room') throw new ApiError(meta.errors.roomSuspended, e?.info);
				if (e?.message === 'room is archived') throw new ApiError(meta.errors.roomArchived);
				throw e;
			}
		});
	}
}
