/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedChatRoomSchema = {
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
		ownerId: {
			type: 'string',
			optional: false, nullable: false,
		},
		owner: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserLite',
		},
		name: {
			type: 'string',
			optional: false, nullable: false,
		},
		description: {
			type: 'string',
			optional: false, nullable: false,
		},
		iconUrl: {
			type: 'string',
			optional: true, nullable: true,
		},
		isPublic: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		isMember: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		isMuted: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		invitationExists: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		allowMemberInvite: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		announcement: {
			type: 'string',
			optional: true, nullable: true,
		},
		pinnedMessageId: {
			type: 'string',
			optional: true, nullable: true,
		},
		pinnedMessage: {
			type: 'object',
			optional: true, nullable: true,
			ref: 'ChatMessage',
		},
		isArchived: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		myRole: {
			type: 'string',
			enum: ['owner', 'admin', 'member'],
			optional: true, nullable: true,
		},
		isBanned: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		banReason: {
			type: 'string',
			optional: true, nullable: true,
		},
		memberCount: {
			type: 'number',
			optional: true, nullable: false,
		},
		unreadCount: {
			type: 'number',
			optional: true, nullable: false,
		},
	},
} as const;
