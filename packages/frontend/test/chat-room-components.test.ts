/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import { groupMessageReactions } from '@/pages/chat/XMessage.vue';
import { extractMentionQuery, filterRoomMentionCandidates } from '@/pages/chat/room.form.vue';
import { splitHighlightParts } from '@/pages/chat/room.search.vue';
import { applyOwnerTransferred, mergeLocalRoomUpdate, mergeSharedRoomMetadata } from '@/pages/chat/room.vue';
import XRoom from '@/pages/chat/XRoom.vue';
import XMessage from '@/pages/chat/XMessage.vue';
import ChatMessagePage from '@/pages/chat/message.vue';
import { misskeyApi } from '@/utility/misskey-api.js';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('@@/js/locale.js', () => ({ locale: {} }));
vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			menu: 'Menu',
			reaction: 'Reaction',
			copyContent: 'Copy',
			reportAbuse: 'Report',
			delete: 'Delete',
			deleteConfirm: 'Delete?',
			removed: 'Removed',
			retry: 'Retry',
			directMessage: 'Messages',
			_chat: {
				publicBadge: 'Public',
				archivedBadge: 'Archived',
				mutedBadge: 'Muted',
				reply: 'Reply',
				mention: '@Mention',
				editMessage: 'Edit',
				edited: 'Edited',
				pinMessage: 'Pin',
				unpinMessage: 'Unpin',
				pinnedMessage: 'Pinned',
				copyText: 'Copy text',
				attachmentPlaceholder: '[Attachment]',
				deletedMessage: '(Original message deleted)',
			},
		},
		tsx: {
			_chat: {
				memberCount: ({ count }: { count: number }) => `${count} members`,
			},
		},
	},
}));
const { mockAccount } = vi.hoisted(() => ({
	mockAccount: { id: 'me1', username: 'me', policies: { chatAvailability: 'available' } },
}));
vi.mock('@/i.js', () => ({
	$i: mockAccount,
	ensureSignin: () => mockAccount,
}));
vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: vi.fn(() => Promise.resolve({})),
	formatApiError: (e: unknown) => String(e),
}));
vi.mock('@/router.js', () => ({
	useRouter: () => ({ push: pushMock }),
}));
vi.mock('@/page.js', () => ({
	definePage: vi.fn(),
}));
vi.mock('@/preferences.js', () => ({
	prefer: { s: { animation: false, useStickyIcons: false, 'chat.showSenderName': true } },
}));
vi.mock('@/utility/reaction-picker.js', () => ({
	reactionPicker: { show: vi.fn() },
}));
vi.mock('@/utility/sound.js', () => ({
	playMisskeySfx: vi.fn(),
}));
vi.mock('@/os.js', () => ({
	alert: vi.fn(),
	confirm: vi.fn(),
	toast: vi.fn(),
	popupMenu: vi.fn(),
	contextMenu: vi.fn(),
	popupAsyncWithDialog: vi.fn(),
}));

const apiMock = vi.mocked(misskeyApi);

const globalStubs = {
	directives: {
		tooltip: () => {},
	},
	components: {
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
		MkAvatar: { props: ['user'], template: '<span class="avatar" :data-user="user?.id"></span>' },
		MkUserName: { props: ['user'], template: '<span class="username">{{ user?.name || user?.username }}</span>' },
		MkAcct: { props: ['user'], template: '<span class="acct">@{{ user?.username }}</span>' },
		MkFukidashi: { template: '<div class="fukidashi"><slot/></div>' },
		Mfm: { props: ['text'], template: '<span class="mfm">{{ text }}</span>' },
		MkMediaList: { template: '<div class="media"></div>' },
		MkUrlPreview: { template: '<div class="url-preview"></div>' },
		MkTime: { props: ['time'], template: '<time>{{ time }}</time>' },
		MkReactionIcon: { props: ['reaction'], template: '<span class="reaction-icon">{{ reaction }}</span>' },
		MkCustomEmoji: { props: ['name'], template: '<span>{{ name }}</span>' },
		MkEmoji: { props: ['emoji'], template: '<span>{{ emoji }}</span>' },
		MkLoading: { template: '<span class="loading"></span>' },
		MkResult: { props: ['type'], template: '<div class="result"><slot/></div>' },
		MkButton: { template: '<button><slot/></button>' },
		PageWithHeader: { template: '<div><slot/></div>' },
	},
};

function makeUser(id: string, username: string, name?: string): Misskey.entities.UserLite {
	return {
		id,
		username,
		name: name ?? null,
		host: null,
		avatarUrl: `https://example.com/${id}.png`,
		avatarBlurhash: null,
		avatarDecorations: [],
		isBot: false,
		isCat: false,
		emojis: {},
		onlineStatus: 'online',
		badgeRoles: [],
	};
}

afterEach(() => {
	cleanup();
	pushMock.mockReset();
	apiMock.mockReset();
	apiMock.mockResolvedValue({});
});

describe('Chat room helpers', () => {
	test('groupMessageReactions groups identical emojis, counts unique users, and marks meReacted', () => {
		const u1 = makeUser('me1', 'alice', 'Alice');
		const u2 = makeUser('u2', 'bob', 'Bob');
		const u3 = makeUser('u3', 'carol', 'Carol');

		const grouped = groupMessageReactions([
			{ reaction: '👍', user: u2 },
			{ reaction: '👍', user: u1 },
			{ reaction: '👍', user: u2 }, // duplicate
			{ reaction: '🎉', user: u3 },
		], 'me1');

		expect(grouped).toHaveLength(2);
		expect(grouped[0].reaction).toBe('👍');
		expect(grouped[0].count).toBe(2);
		expect(grouped[0].users.map(u => u.id)).toEqual(['u2', 'me1']);
		expect(grouped[0].meReacted).toBe(true);

		expect(grouped[1].reaction).toBe('🎉');
		expect(grouped[1].count).toBe(1);
		expect(grouped[1].meReacted).toBe(false);
	});

	test('extractMentionQuery extracts @mention query at caret and ignores invalid contexts', () => {
		expect(extractMentionQuery('@ali', 4)).toEqual({ start: 0, query: 'ali' });
		expect(extractMentionQuery('hello @bo', 9)).toEqual({ start: 6, query: 'bo' });
		expect(extractMentionQuery('foo@bar', 7)).toBeNull();
		expect(extractMentionQuery('hi @', 4)).toEqual({ start: 3, query: '' });
		expect(extractMentionQuery('line1\n@ca', 9)).toEqual({ start: 6, query: 'ca' });
	});

	test('filterRoomMentionCandidates excludes self, deduplicates, and matches username or display name', () => {
		const me = makeUser('me1', 'me', 'My Name');
		const alice = makeUser('u1', 'alice_dev', 'Alice Wonderland');
		const bob = makeUser('u2', 'bob', 'Bob Builder');

		const all = filterRoomMentionCandidates([me, alice, alice, bob], '', 'me1');
		expect(all.map(u => u.id)).toEqual(['u1', 'u2']);

		const byDisplayName = filterRoomMentionCandidates([me, alice, bob], 'wonder', 'me1');
		expect(byDisplayName.map(u => u.id)).toEqual(['u1']);

		const byUsername = filterRoomMentionCandidates([me, alice, bob], 'BOB', 'me1');
		expect(byUsername.map(u => u.id)).toEqual(['u2']);
	});

	test('splitHighlightParts highlights matched substrings case-insensitively', () => {
		const parts = splitHighlightParts('Hello World, hello!', 'hello');
		expect(parts).toEqual([
			{ text: 'Hello', match: true },
			{ text: ' World, ', match: false },
			{ text: 'hello', match: true },
			{ text: '!', match: false },
		]);
		expect(splitHighlightParts('plain text', '')).toEqual([{ text: 'plain text', match: false }]);
	});

	test('mergeSharedRoomMetadata updates shared room fields without overwriting per-user state', () => {
		const owner = makeUser('owner1', 'owner', 'Owner');
		const nextOwner = makeUser('u2', 'alice', 'Alice');
		const current: Misskey.entities.ChatRoom = {
			id: 'room1',
			createdAt: '2026-11-21T00:00:00Z',
			ownerId: 'owner1',
			owner,
			name: 'Old Name',
			description: 'Old Desc',
			iconUrl: null,
			isPublic: false,
			isMember: true,
			isMuted: true,
			invitationExists: false,
			allowMemberInvite: false,
			announcement: null,
			pinnedMessageId: null,
			pinnedMessage: null,
			isArchived: false,
			myRole: 'admin',
			isBanned: false,
			banReason: null,
			memberCount: 5,
			unreadCount: 3,
		};

		// Neutral broadcast payload packed without `me`
		const neutralBroadcast: Misskey.entities.ChatRoom = {
			id: 'room1',
			createdAt: '2026-11-21T00:00:00Z',
			ownerId: 'u2',
			owner: nextOwner,
			name: 'New Name',
			description: 'New Desc',
			iconUrl: 'https://example.com/new.png',
			isPublic: true,
			isMember: false,
			isMuted: false,
			invitationExists: true,
			allowMemberInvite: true,
			announcement: 'Hello',
			pinnedMessageId: 'm1',
			pinnedMessage: null,
			isArchived: true,
			myRole: null,
			isBanned: true,
			banReason: 'neutral',
			memberCount: 6,
			unreadCount: 0,
		};

		const merged = mergeSharedRoomMetadata(current, neutralBroadcast);
		expect(merged).toMatchObject({
			name: 'New Name',
			description: 'New Desc',
			iconUrl: 'https://example.com/new.png',
			isPublic: true,
			isArchived: true,
			allowMemberInvite: true,
			announcement: 'Hello',
			pinnedMessageId: 'm1',
			ownerId: 'u2',
			owner: nextOwner,
			memberCount: 6,
			// Per-user fields preserved:
			isMember: true,
			isMuted: true,
			invitationExists: false,
			myRole: 'admin',
			isBanned: false,
			banReason: null,
			unreadCount: 3,
		});
	});

	test('mergeLocalRoomUpdate applies shared metadata along with local isMuted and myRole updates', () => {
		const owner = makeUser('owner1', 'owner', 'Owner');
		const current: Misskey.entities.ChatRoom = {
			id: 'room1',
			createdAt: '2026-11-21T00:00:00Z',
			ownerId: 'owner1',
			owner,
			name: 'Old Name',
			description: 'Old Desc',
			iconUrl: null,
			isPublic: false,
			isMember: true,
			isMuted: false,
			invitationExists: false,
			allowMemberInvite: false,
			announcement: null,
			pinnedMessageId: null,
			pinnedMessage: null,
			isArchived: false,
			myRole: 'member',
			isBanned: false,
			banReason: null,
			memberCount: 5,
			unreadCount: 2,
		};

		const mutedUpdate = mergeLocalRoomUpdate(current, {
			...current,
			name: 'Renamed',
			isMuted: true,
			myRole: 'admin',
			isMember: false,
			unreadCount: 0,
		});
		expect(mutedUpdate).toMatchObject({
			name: 'Renamed',
			isMuted: true,
			myRole: 'admin',
			isMember: true,
			unreadCount: 2,
		});

		const omittedFields = mergeLocalRoomUpdate(mutedUpdate, {
			id: 'room1',
			createdAt: '2026-11-21T00:00:00Z',
			ownerId: 'owner1',
			owner,
			name: 'Renamed Again',
			description: 'Old Desc',
			isPublic: false,
			isMember: false,
		});
		expect(omittedFields.name).toBe('Renamed Again');
		expect(omittedFields.isMuted).toBe(true);
		expect(omittedFields.myRole).toBe('admin');
	});

	test('applyOwnerTransferred updates ownerId, owner, and myRole for new and old owners even if ownerId already changed', () => {
		const oldOwner = makeUser('owner1', 'owner', 'Owner');
		const newOwner = makeUser('u2', 'alice', 'Alice');
		const baseRoom: Misskey.entities.ChatRoom = {
			id: 'room1',
			createdAt: '2026-11-21T00:00:00Z',
			ownerId: 'u2', // simulate roomUpdated arriving before ownerTransferred
			owner: oldOwner,
			name: 'Room',
			description: '',
			isPublic: true,
			isMember: true,
			myRole: 'owner',
		};

		const forOldOwner = applyOwnerTransferred(baseRoom, {
			oldOwnerId: 'owner1',
			newOwnerId: 'u2',
			newOwner,
		}, 'owner1');
		expect(forOldOwner.ownerId).toBe('u2');
		expect(forOldOwner.owner).toEqual(newOwner);
		expect(forOldOwner.myRole).toBe('member');

		const forNewOwner = applyOwnerTransferred({ ...baseRoom, myRole: 'admin' }, {
			oldOwnerId: 'owner1',
			newOwnerId: 'u2',
			newOwner,
		}, 'u2');
		expect(forNewOwner.ownerId).toBe('u2');
		expect(forNewOwner.owner).toEqual(newOwner);
		expect(forNewOwner.myRole).toBe('owner');
	});
});

describe('Chat room components', () => {
	test('XRoom renders room.iconUrl, badges, memberCount and hides <hr> when description is empty', async () => {
		const owner = makeUser('owner1', 'owner', 'Owner');
		const { container, rerender } = render(XRoom, {
			props: {
				room: {
					id: 'room1',
					createdAt: '2026-11-21T00:00:00Z',
					ownerId: owner.id,
					owner,
					name: 'Dev Group',
					description: '',
					iconUrl: 'https://example.com/room.png',
					isPublic: true,
					isArchived: true,
					isMuted: true,
					isMember: true,
					memberCount: 12,
				},
			},
			global: globalStubs,
		});

		const img = container.querySelector('img');
		expect(img?.getAttribute('src')).toBe('https://example.com/room.png');
		expect(container.querySelector('hr')).toBeNull();
		expect(container.textContent).toContain('Public');
		expect(container.textContent).toContain('Archived');
		expect(container.textContent).toContain('Muted');
		expect(container.textContent).toContain('12 members');

		await rerender({
			room: {
				id: 'room1',
				createdAt: '2026-11-21T00:00:00Z',
				ownerId: owner.id,
				owner,
				name: 'Dev Group',
				description: 'Group chat description',
				iconUrl: null,
				isPublic: false,
				isMember: true,
			},
		});
		expect(container.querySelector('hr')).not.toBeNull();
		expect(container.textContent).toContain('Group chat description');
	});

	test('XMessage renders grouped reactions as <button>s, edited indicator, and deleted reply placeholder', () => {
		const sender = makeUser('u2', 'bob', 'Bob');
		const me = makeUser('me1', 'me', 'Me');

		const { container } = render(XMessage, {
			props: {
				roomOwnerId: 'u2',
				message: {
					id: 'm1',
					createdAt: '2026-11-21T00:00:00Z',
					editedAt: '2026-11-21T00:05:00Z',
					fromUserId: 'u2',
					fromUser: sender,
					toRoomId: 'room1',
					text: 'Updated message',
					replyId: 'm0',
					reply: null,
					reactions: [
						{ reaction: '❤️', user: sender },
						{ reaction: '❤️', user: me },
					],
				},
			},
			global: globalStubs,
		});

		expect(container.textContent).toContain('(Original message deleted)');
		expect(container.textContent).toContain('(Edited)');
		const reactionButtons = container.querySelectorAll('button[aria-pressed]');
		expect(reactionButtons).toHaveLength(1);
		expect(reactionButtons[0].getAttribute('aria-pressed')).toBe('true');
		expect(reactionButtons[0].textContent).toContain('2');
	});

	test('message.vue navigates to target room when clicking search-result room message', async () => {
		const sender = makeUser('u2', 'bob', 'Bob');
		apiMock.mockResolvedValue({
			id: 'msg99',
			createdAt: '2026-11-21T00:00:00Z',
			fromUserId: 'u2',
			fromUser: sender,
			toRoomId: 'room42',
			toRoom: {
				id: 'room42',
				createdAt: '2026-11-21T00:00:00Z',
				ownerId: 'u2',
				owner: sender,
				name: 'Room 42',
				description: '',
				isPublic: true,
				isMember: true,
			},
			text: 'Find me',
			reactions: [],
		} as unknown as Misskey.entities.ChatMessage);

		const { container } = render(ChatMessagePage, {
			props: { messageId: 'msg99' },
			global: globalStubs,
		});

		await vi.waitFor(() => {
			expect(container.textContent).toContain('Find me');
		});

		const msgRoot = container.querySelector('[data-message-id="msg99"]') as HTMLElement;
		expect(msgRoot).not.toBeNull();
		await fireEvent.click(msgRoot);
		expect(pushMock).toHaveBeenCalledWith('/chat/room/:roomId', {
			params: { roomId: 'room42' },
			query: { messageId: 'msg99' },
		});
	});
});
