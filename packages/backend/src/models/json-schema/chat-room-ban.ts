/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedChatRoomBanSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: false,
		},
		roomId: {
			type: 'string',
			optional: false, nullable: false,
		},
		userId: {
			type: 'string',
			optional: false, nullable: false,
		},
		user: {
			type: 'object',
			optional: true, nullable: false,
			ref: 'UserLite',
		},
		bannedById: {
			type: 'string',
			optional: false, nullable: true,
		},
		bannedBy: {
			type: 'object',
			optional: true, nullable: true,
			ref: 'UserLite',
		},
		reason: {
			type: 'string',
			optional: false, nullable: true,
		},
	},
} as const;
