/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
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
		max: 10,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoom',
	},

	errors: {
		invalidName: {
			message: 'Invalid room name.',
			code: 'INVALID_NAME',
			id: 'b3d4e049-324c-435c-bb0d-b33ef9089647',
		},
		invalidIconUrl: {
			message: 'Invalid icon URL.',
			code: 'INVALID_ICON_URL',
			id: '5282b8b0-2cde-4149-9b36-e9f4ec449424',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1, maxLength: 256 },
		description: { type: 'string', maxLength: 2048 },
		isPublic: { type: 'boolean', default: false },
		iconUrl: { type: 'string', nullable: true, maxLength: 1024 },
		allowMemberInvite: { type: 'boolean', default: false },
		announcement: { type: 'string', nullable: true, maxLength: 2048 },
	},
	required: ['name'],
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
				const room = await this.chatService.createRoom(me, {
					name: ps.name,
					description: ps.description ?? '',
					isPublic: ps.isPublic,
					iconUrl: ps.iconUrl ?? null,
					allowMemberInvite: ps.allowMemberInvite,
					announcement: ps.announcement ?? null,
				});
				return await this.chatEntityService.packRoom(room, me);
			} catch (e: any) {
				if (e?.message === 'invalid name') throw new ApiError(meta.errors.invalidName);
				if (e?.message === 'invalid iconUrl') throw new ApiError(meta.errors.invalidIconUrl);
				throw e;
			}
		});
	}
}
