/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { ChatService } from '@/core/ChatService.js';
import type { DriveFilesRepository, MiUser } from '@/models/_.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	limit: {
		duration: ms('1hour'),
		max: 500,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatMessageLiteFor1on1',
	},

	errors: {
		recipientIsYourself: {
			message: 'You can not send a message to yourself.',
			code: 'RECIPIENT_IS_YOURSELF',
			id: '17e2ba79-e22a-4cbc-bf91-d327643f4a7e',
		},

		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '11795c64-40ea-4198-b06e-3c873ed9039d',
		},

		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: '4372b8e2-185d-4146-8749-2f68864a3e5f',
		},

		contentRequired: {
			message: 'Content required. You need to set text or fileId.',
			code: 'CONTENT_REQUIRED',
			id: '25587321-b0e6-449c-9239-f8925092942c',
		},

		youHaveBeenBlocked: {
			message: 'You cannot send a message because you have been blocked by this user.',
			code: 'YOU_HAVE_BEEN_BLOCKED',
			id: 'c15a5199-7422-4968-941a-2a462c478f7d',
		},

		recipientChatScopeNone: {
			message: 'This user does not accept chat messages from anyone.',
			code: 'RECIPIENT_CHAT_SCOPE_NONE',
			id: 'a3f1c8e2-9b4d-4e7f-a6c1-2d5e8f0a1b3c',
		},

		recipientChatScopeFollowers: {
			message: 'This user only accepts chat messages from their followers.',
			code: 'RECIPIENT_CHAT_SCOPE_FOLLOWERS',
			id: 'b4e2d9f3-0c5e-4f8a-b7d2-3e6f9a1b2c4d',
		},

		recipientChatScopeFollowing: {
			message: 'This user only accepts chat messages from users they follow.',
			code: 'RECIPIENT_CHAT_SCOPE_FOLLOWING',
			id: 'c5f3e0a4-1d6f-4a9b-c8e3-4f7a0b2c3d5e',
		},

		recipientChatScopeMutual: {
			message: 'This user only accepts chat messages from mutual followers.',
			code: 'RECIPIENT_CHAT_SCOPE_MUTUAL',
			id: 'd6a4f1b5-2e7a-4b0c-d9f4-5a8b1c3d4e6f',
		},

		recipientChatUnavailable: {
			message: 'This user cannot use chat due to server policy.',
			code: 'RECIPIENT_CHAT_UNAVAILABLE',
			id: 'e7b5a2c6-3f8b-4c1d-e0a5-6b9c2d4e5f7a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		text: { type: 'string', nullable: true, maxLength: 2000 },
		fileId: { type: 'string', format: 'misskey:id' },
		toUserId: { type: 'string', format: 'misskey:id' },
		replyId: { type: 'string', format: 'misskey:id' },
	},
	required: ['toUserId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private getterService: GetterService,
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			let file = null;
			if (ps.fileId != null) {
				file = await this.driveFilesRepository.findOneBy({
					id: ps.fileId,
					userId: me.id,
				});

				if (file == null) {
					throw new ApiError(meta.errors.noSuchFile);
				}
			}

			// テキストが無いかつ添付ファイルも無かったらエラー
			if (ps.text == null && file == null) {
				throw new ApiError(meta.errors.contentRequired);
			}

			// Myself
			if (ps.toUserId === me.id) {
				throw new ApiError(meta.errors.recipientIsYourself);
			}

			const toUser = await this.getterService.getUser(ps.toUserId).catch(err => {
				if (err.id === '15348ddd-432d-49c2-8a5a-8069753becff') throw new ApiError(meta.errors.noSuchUser);
				throw err;
			});

			try {
				return await this.chatService.createMessageToUser(me, toUser, {
					text: ps.text,
					file: file,
					replyId: ps.replyId,
				});
			} catch (e: any) {
				if (e.message === 'recipient is cannot chat (none)') throw new ApiError(meta.errors.recipientChatScopeNone);
				if (e.message === 'recipient is cannot chat (followers)') throw new ApiError(meta.errors.recipientChatScopeFollowers);
				if (e.message === 'recipient is cannot chat (following)') throw new ApiError(meta.errors.recipientChatScopeFollowing);
				if (e.message === 'recipient is cannot chat (mutual)') throw new ApiError(meta.errors.recipientChatScopeMutual);
				if (e.message === 'recipient is cannot chat (policy)') throw new ApiError(meta.errors.recipientChatUnavailable);
				if (e.message === 'blocked') throw new ApiError(meta.errors.youHaveBeenBlocked);
				throw e;
			}
		});
	}
}
