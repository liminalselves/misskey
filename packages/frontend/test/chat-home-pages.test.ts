/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, h, nextTick, provide } from 'vue';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import ChatHomeHome from '@/pages/chat/home.home.vue';
import ChatHomeInvitations from '@/pages/chat/home.invitations.vue';
import ChatHomeJoiningRooms from '@/pages/chat/home.joiningRooms.vue';
import MkNotification from '@/components/MkNotification.vue';
import WidgetChat from '@/widgets/WidgetChat.vue';
import MkWidgets from '@/components/MkWidgets.vue';
import ChatColumn from '@/ui/deck/chat-column.vue';
import ChatHome from '@/pages/chat/home.vue';
import { provideMetadataReceiver } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { DI } from '@/di.js';
import * as os from '@/os.js';

const { mockState, pushMock, pushByPathMock } = vi.hoisted(() => ({
	mockState: {
		account: {
			id: 'me1',
			policies: { chatAvailability: 'available' as 'available' | 'readonly' | 'unavailable' },
		} as { id: string; policies: { chatAvailability: 'available' | 'readonly' | 'unavailable' } } | null,
	},
	pushMock: vi.fn(),
	pushByPathMock: vi.fn(),
}));

vi.mock('@@/js/locale.js', () => ({ locale: {} }));
vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: vi.fn(),
	formatApiError: (e: any) => String(e?.message ?? e),
}));
vi.mock('@/i.js', () => ({
	get $i() {
		return mockState.account;
	},
	ensureSignin: () => {
		if (!mockState.account) throw new Error('signin required');
		return mockState.account;
	},
}));
vi.mock('@/instance.js', () => ({
	instance: { federation: 'all', agentFeatureEnabled: false },
}));
vi.mock('@/preferences.js', () => ({
	prefer: { s: { enableInfiniteScroll: false, animation: false } },
}));
vi.mock('@/stream.js', () => ({
	useStream: () => ({
		useChannel: () => ({ on: vi.fn(), dispose: vi.fn() }),
	}),
}));
vi.mock('@/router.js', () => ({
	useRouter: () => ({
		push: pushMock,
		pushByPath: pushByPathMock,
		replaceByPath: vi.fn(),
		getCurrentFullPath: () => '/chat',
	}),
}));
vi.mock('@/os.js', () => ({
	alert: vi.fn().mockResolvedValue(undefined),
	popupMenu: vi.fn(),
	contextMenu: vi.fn(),
	selectUser: vi.fn(),
	form: vi.fn().mockResolvedValue({ canceled: true }),
	pageFolderTeleportCount: { value: 0 },
}));
vi.mock('@/components/MkInput.vue', () => ({
	default: defineComponent({
		props: ['modelValue', 'placeholder', 'type'],
		emits: ['update:modelValue', 'enter'],
		template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown.enter="$emit(\'enter\', $event)">',
	}),
}));
vi.mock('@/components/MkFoldableSection.vue', () => ({
	default: defineComponent({
		template: '<section><slot name="header"/><slot/></section>',
	}),
}));
vi.mock('@/components/MkFolder.vue', () => ({
	default: defineComponent({
		props: ['defaultOpen'],
		template: '<div><slot name="icon"/><slot name="label"/><slot name="suffix"/><slot/><slot name="footer"/></div>',
	}),
}));
vi.mock('@/components/MkButton.vue', () => ({
	default: defineComponent({
		props: ['disabled'],
		emits: ['click'],
		template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot/></button>',
	}),
}));
vi.mock('@/components/MkInfo.vue', () => ({
	default: defineComponent({
		props: ['warn'],
		template: '<div data-mk-info :data-warn="warn"><slot/></div>',
	}),
}));
vi.mock('@/components/MkContainer.vue', () => ({
	default: defineComponent({
		props: ['showHeader'],
		template: '<div><slot name="icon"/><slot name="header"/><slot name="func" buttonStyleClass="btn"/><slot/></div>',
	}),
}));
vi.mock('@/components/MkSelect.vue', () => ({
	default: defineComponent({
		props: ['items', 'modelValue'],
		template: '<select><option v-for="i in items" :key="String(i.value)" :value="i.value">{{ i.label }}</option></select>',
	}),
}));
vi.mock('@/ui/deck/column.vue', () => ({
	default: defineComponent({
		props: ['column', 'isStacked'],
		template: '<div><slot name="header"/><slot/></div>',
	}),
}));
vi.mock('@/components/MkDraggable.vue', () => ({
	default: defineComponent({ template: '<div/>' }),
}));
vi.mock('@/widgets/widget.js', () => ({
	useWidgetPropsManager: () => ({
		widgetProps: { showHeader: true },
		configure: vi.fn(),
		save: vi.fn(),
	}),
}));
vi.mock('@/composables/use-mkselect.js', () => ({
	useMkSelect: (opts: { items: { value: unknown[] } }) => ({
		model: { value: null },
		def: opts.items,
	}),
}));
vi.mock('@/components/MkAd.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkChatHistories.vue', () => ({
	default: defineComponent({
		props: ['filter', 'includeAgentSessions', 'directOnly'],
		template: '<div data-chat-histories :data-filter="filter ?? \'all\'"/>',
	}),
}));
vi.mock('@/pages/chat/XMessage.vue', () => ({
	default: defineComponent({
		props: ['message', 'isSearchResult'],
		emits: ['navigate'],
		template: '<button data-xmessage @click="$emit(\'navigate\', message.id)">{{ message.text }}</button>',
	}),
}));
vi.mock('@/pages/chat/XRoom.vue', () => ({
	default: defineComponent({
		props: ['room'],
		template: '<div data-xroom :data-room-id="room.id">{{ room.name }}</div>',
	}),
}));
vi.mock('@/components/MkReactionIcon.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			startChat: 'Start chat',
			search: 'Search',
			searchResult: 'Search result',
			retry: 'Retry',
			loading: 'Loading',
			name: 'Name',
			description: 'Description',
			noDescription: 'No description',
			public: 'Public',
			signinRequired: 'Sign in required',
			selectWidget: 'Select widget',
			add: 'Add',
			close: 'Close',
			none: 'None',
			settings: 'Settings',
			accept: 'Accept',
			reject: 'Reject',
			directMessage: 'Direct messages',
			directMessage_short: 'Messages',
			_chat: {
				home: 'Home',
				invitations: 'Invitations',
				joiningRooms: 'Joined rooms',
				yourRooms: 'Owned rooms',
				searchMessages: 'Search messages',
				searchRoom: 'Search rooms',
				history: 'History',
				createRoom: 'Create room',
				join: 'Join',
				ignore: 'Ignore',
				noInvitations: 'No invitations',
				noRooms: 'No rooms',
				loadMore: 'Load more',
				filterAll: 'All',
				filterDirect: 'Direct',
				filterRooms: 'Rooms',
				memberCount: '{count} members',
				publicBadge: 'Public',
				publicRoomHint: 'Public hint',
				allowMemberInvite: 'Allow invite',
				allowMemberInviteHint: 'Allow invite hint',
				roomNameRequired: 'Room name required',
				chatIsReadOnlyForThisAccountOrServer: 'Readonly chat',
				chatNotAvailableForThisAccountOrServer: 'Unavailable chat',
				individualChat: 'Direct',
				individualChat_description: 'Direct desc',
				roomChat: 'Rooms',
				roomChat_description: 'Rooms desc',
			},
			_notification: {
				chatRoomInvitationReceived: 'Room invitation received',
				_types: {
					chatRoomMemberJoined: 'joined the room',
					chatRoomKicked: 'You were kicked from the room',
					chatRoomSuspended: 'You were muted in the room',
					chatRoomUnsuspended: 'Your mute was lifted',
					chatRoomMention: 'mentioned you in the room',
				},
			},
			_widgets: {
				chat: 'Chat',
				profile: 'Profile',
			},
			_widgetOptions: {
				showHeader: 'Show header',
			},
			_deck: {
				_columns: {
					chat: 'Chat',
				},
			},
		},
		tsx: {
			_chat: {
				memberCount: ({ count }: { count: number }) => `${count} members`,
			},
		},
	},
}));

const apiMock = vi.mocked(misskeyApi);

const global = {
	components: {
		MkA: { props: ['to'], template: '<a :data-to="to"><slot/></a>' },
		MkButton: {
			props: ['disabled'],
			emits: ['click'],
			template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot/></button>',
		},
		MkInfo: { props: ['warn'], template: '<div data-mk-info :data-warn="warn"><slot/></div>' },
		MkInput: defineComponent({
			props: ['modelValue', 'placeholder', 'type'],
			emits: ['update:modelValue', 'enter'],
			template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown.enter="$emit(\'enter\', $event)">',
		}),
		MkFoldableSection: { template: '<section><slot name="header"/><slot/></section>' },
		MkResult: { props: ['type', 'text'], template: '<div :data-result="type">{{ text }}<slot/></div>' },
		MkLoading: { template: '<span data-loading>Loading</span>' },
		MkFolder: { template: '<div><slot name="icon"/><slot name="label"/><slot name="suffix"/><slot/><slot name="footer"/></div>' },
		MkAvatar: { props: ['user'], template: '<span class="avatar"/>' },
		MkUserName: { props: ['user'], template: '<span>{{ user?.name }}</span>' },
		MkTime: { template: '<time/>' },
		MkContainer: { template: '<div><slot name="icon"/><slot name="header"/><slot name="func" buttonStyleClass="btn"/><slot/></div>' },
		MkSelect: {
			props: ['items', 'modelValue'],
			template: '<select><option v-for="i in items" :key="String(i.value)" :value="i.value">{{ i.label }}</option></select>',
		},
		MkDraggable: { template: '<div/>' },
		MkAd: { render: () => null },
		Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
	},
	directives: {
		appear: {},
		tooltip: {},
		'user-preview': {},
	},
};

async function flush() {
	await nextTick();
	await new Promise(resolve => setTimeout(resolve, 0));
	await nextTick();
}

afterEach(() => {
	cleanup();
	mockState.account = { id: 'me1', policies: { chatAvailability: 'available' } };
	apiMock.mockReset();
	pushMock.mockReset();
	pushByPathMock.mockReset();
	vi.mocked(os.alert).mockClear();
	vi.mocked(os.form).mockClear();
});

describe('Chat home pages & entries', () => {
	test('home.home.vue navigates incoming 1v1 search results to sender (not self), searches on Enter, and resets when cleared', async () => {
		apiMock.mockResolvedValue([
			{ id: 'msg1', fromUserId: 'bob', toUserId: 'me1', text: 'hi from bob' },
		] as never);

		const { container } = render(ChatHomeHome, { global });
		const input = container.querySelector('input')!;
		await fireEvent.update(input, '  hi  ');
		await fireEvent.keyDown(input, { key: 'Enter' });
		await flush();

		expect(apiMock).toHaveBeenCalledWith('chat/messages/search', { query: 'hi', limit: 21 });
		await fireEvent.click(container.querySelector('[data-xmessage]')!);
		expect(pushByPathMock).toHaveBeenCalledWith('/chat/user/bob?messageId=msg1');

		await fireEvent.update(input, '   ');
		await nextTick();
		expect(container.querySelector('[data-xmessage]')).toBeNull();
	});

	test('home.home.vue allows readonly users to search rooms', async () => {
		mockState.account = { id: 'me1', policies: { chatAvailability: 'readonly' } };
		const { container } = render(ChatHomeHome, { global });
		const searchRoomsBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Search rooms'));
		expect(searchRoomsBtn).toBeDefined();
		await fireEvent.click(searchRoomsBtn!);
		expect(pushMock).toHaveBeenCalledWith('/chat/search');
	});

	test('home.invitations.vue removes invitation after join, emits updateCount, and shows room icon/memberCount', async () => {
		const onUpdateCount = vi.fn();
		apiMock.mockImplementation(((ep: string) => {
			if (ep === 'chat/rooms/invitations/inbox') {
				return Promise.resolve([{
					id: 'inv1',
					createdAt: '2026-11-21T00:00:00Z',
					userId: 'me1',
					roomId: 'room1',
					room: {
						id: 'room1',
						createdAt: '2026-11-20T00:00:00Z',
						ownerId: 'owner1',
						owner: { id: 'owner1', username: 'owner1', host: null, name: 'Owner', avatarUrl: '', avatarBlurhash: null, avatarDecorations: [], emojis: {} },
						name: 'Cool Room',
						description: 'Welcome',
						iconUrl: 'https://example.com/cool.png',
						isPublic: true,
						isMember: false,
						memberCount: 12,
					},
				}]);
			}
			return Promise.resolve({});
		}) as typeof misskeyApi);

		const { container } = render(ChatHomeInvitations, {
			props: { onUpdateCount },
			global,
		});
		await flush();

		expect(container.querySelector('img[src="https://example.com/cool.png"]')).not.toBeNull();
		expect(container.textContent).toContain('12 members');
		expect(onUpdateCount).toHaveBeenCalledWith(1);

		const joinBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Join'))!;
		await fireEvent.click(joinBtn);
		await flush();

		expect(apiMock).toHaveBeenCalledWith('chat/rooms/join', { roomId: 'room1' });
		expect(onUpdateCount).toHaveBeenCalledWith(0);
		expect(pushMock).toHaveBeenCalledWith('/chat/room/:roomId', { params: { roomId: 'room1' } });
		expect(container.textContent).not.toContain('Cool Room');
	});

	test('home.joiningRooms.vue filters out rooms owned by current user', async () => {
		apiMock.mockResolvedValue([
			{
				id: 'm-owned',
				createdAt: '2026-11-21T00:00:00Z',
				userId: 'me1',
				roomId: 'room-owned',
				suspendedUntil: null,
				room: { id: 'room-owned', ownerId: 'me1', name: 'My Owned Room' },
			},
			{
				id: 'm-other',
				createdAt: '2026-11-21T00:00:00Z',
				userId: 'me1',
				roomId: 'room-other',
				suspendedUntil: null,
				room: { id: 'room-other', ownerId: 'someone-else', name: 'Joined Room' },
			},
		] as never);

		const { container } = render(ChatHomeJoiningRooms, { global });
		await flush();

		expect(container.textContent).not.toContain('My Owned Room');
		expect(container.textContent).toContain('Joined Room');
	});

	test('MkNotification renders chatRoomMention link, i18n room events, and clickable invitation with Accept/Ignore', async () => {
		apiMock.mockResolvedValue({} as never);
		const mentionNotif = {
			id: 'n1',
			createdAt: '2026-11-21T00:00:00Z',
			type: 'chatRoomMention',
			userId: 'bob',
			user: { id: 'bob', username: 'bob', host: null, name: 'Bob', avatarUrl: '', avatarBlurhash: null, avatarDecorations: [], emojis: {} },
			chatRoomId: 'room1',
			chatRoom: { id: 'room1', name: 'Dev Room' },
			messageId: 'msg99',
		};
		const { container: c1 } = render(MkNotification, { props: { notification: mentionNotif as never }, global });
		expect(c1.textContent).toContain('Bob');
		expect(c1.textContent).toContain('mentioned you in the room');
		expect(c1.querySelector('a[data-to="/chat/room/room1?messageId=msg99"]')).not.toBeNull();

		const inviteNotif = {
			id: 'n2',
			createdAt: '2026-11-21T00:00:00Z',
			type: 'chatRoomInvitationReceived',
			invitation: {
				id: 'inv1',
				createdAt: '2026-11-21T00:00:00Z',
				userId: 'me1',
				roomId: 'room2',
				room: {
					id: 'room2',
					name: 'Invite Room',
					isMember: false,
					owner: { id: 'owner1', username: 'owner1', host: null, name: 'Owner', avatarUrl: '', avatarBlurhash: null, avatarDecorations: [], emojis: {} },
				},
			},
		};
		const { container: c2 } = render(MkNotification, { props: { notification: inviteNotif as never }, global });
		expect(c2.querySelector('a[data-to="/chat?view=invitations"]')).not.toBeNull();
		const acceptBtn = Array.from(c2.querySelectorAll('button')).find(b => b.textContent?.includes('Join'))!;
		await fireEvent.click(acceptBtn);
		await flush();
		expect(apiMock).toHaveBeenCalledWith('chat/rooms/join', { roomId: 'room2' });
	});

	test('WidgetChat guards unavailable/unauthenticated states and MkWidgets excludes chat widget when unavailable', async () => {
		mockState.account = null;
		const w1 = render(WidgetChat, { props: { widget: { id: 'w1', data: { showHeader: true } } }, global });
		expect(w1.container.textContent).toContain('Sign in required');
		expect(w1.container.querySelector('[data-chat-histories]')).toBeNull();

		mockState.account = { id: 'me1', policies: { chatAvailability: 'unavailable' } };
		const w2 = render(WidgetChat, { props: { widget: { id: 'w2', data: { showHeader: true } } }, global });
		expect(w2.container.textContent).toContain('Unavailable chat');
		expect(w2.container.querySelector('[data-chat-histories]')).toBeNull();

		const picker = render(MkWidgets, { props: { widgets: [], edit: true }, global });
		const options = Array.from(picker.container.querySelectorAll('option')).map(o => o.getAttribute('value'));
		expect(options).not.toContain('chat');

		mockState.account = { id: 'me1', policies: { chatAvailability: 'available' } };
		const w3 = render(WidgetChat, { props: { widget: { id: 'w3', data: { showHeader: true } } }, global });
		expect(w3.container.querySelector('[data-chat-histories]')?.getAttribute('data-filter')).toBe('all');
		expect(w3.container.querySelector('a[data-to="/chat"]')).not.toBeNull();
		const roomsFilterBtn = Array.from(w3.container.querySelectorAll('button')).find(b => b.textContent?.includes('Rooms'))!;
		await fireEvent.click(roomsFilterBtn);
		await nextTick();
		expect(w3.container.querySelector('[data-chat-histories]')?.getAttribute('data-filter')).toBe('rooms');
	});

	test('chat-column.vue provides All/Direct/Rooms filter and quick links to /chat and /chat/search', async () => {
		const view = render(ChatColumn, {
			props: { column: { id: 'c1', type: 'chat', name: null, width: 320, active: true }, isStacked: false },
			global: {
				...global,
				stubs: {
					XColumn: { template: '<div><slot name="header"/><slot/></div>' },
				},
			},
		});
		expect(view.container.querySelector('a[data-to="/chat"]')).not.toBeNull();
		expect(view.container.querySelector('a[data-to="/chat/search"]')).not.toBeNull();
		const directBtn = Array.from(view.container.querySelectorAll('button')).find(b => b.textContent?.includes('Direct'))!;
		await fireEvent.click(directBtn);
		await nextTick();
		expect(view.container.querySelector('[data-chat-histories]')?.getAttribute('data-filter')).toBe('direct');
	});

	test('home.vue exposes Create/Search room header actions and invitation count badge', async () => {
		mockState.account = { id: 'me1', token: 'tok1', policies: { chatAvailability: 'available' } } as never;
		apiMock.mockResolvedValue([{ id: 'inv1' }, { id: 'inv2' }] as never);

		const HeaderStub = defineComponent({
			props: ['tab', 'tabs', 'actions'],
			template: '<div><div data-actions>{{ (actions ?? []).map(a => a.text).join("|") }}</div><div data-tabs>{{ (tabs ?? []).map(t => `${t.key}:${t.title}:${t.icon}:${Boolean(t.indicated)}`).join("|") }}</div><slot/></div>',
		});

		const Host = defineComponent({
			setup() {
				provideMetadataReceiver(() => {});
				return () => h(ChatHome, {});
			},
		});

		const { container } = render(Host, {
			global: {
				...global,
				stubs: {
					PageWithHeader: HeaderStub,
					MkPolkadots: { render: () => null },
					XHome: { render: () => null },
					XDirectMessages: { render: () => null },
					XAgents: { render: () => null },
					XInvitations: { render: () => null },
					XJoiningRooms: { render: () => null },
					XOwnedRooms: { render: () => null },
				},
			},
		});
		await flush();

		expect(container.querySelector('[data-actions]')?.textContent).toBe('Create room|Search rooms');
		const tabsText = container.querySelector('[data-tabs]')?.textContent ?? '';
		expect(tabsText).toContain('invitations:Invitations (2):ti ti-ticket:true');
		expect(tabsText).toContain('ownedRooms:Owned rooms:ti ti-crown:false');
	});
});
