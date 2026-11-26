/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { KeepAlive, defineComponent, h, nextTick, ref } from 'vue';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import MkChatHistories from '@/components/MkChatHistories.vue';
import { misskeyApi } from '@/utility/misskey-api.js';

const { disposeMock, onMock } = vi.hoisted(() => ({
	disposeMock: vi.fn(),
	onMock: vi.fn(),
}));

vi.mock('@@/js/locale.js', () => ({ locale: {} }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn(), formatApiError: vi.fn() }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'me1', policies: { chatAvailability: 'available' } }) }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: vi.fn() }));
vi.mock('@/stream.js', () => ({
	useStream: () => ({
		useChannel: () => ({
			on: onMock,
			dispose: disposeMock,
		}),
	}),
}));
vi.mock('@/components/MkDriveFileThumbnail.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			you: 'You',
			unknown: 'Unknown',
			retry: 'Retry',
			loading: 'Loading',
			loadMore: 'Load more',
			_chat: {
				noHistory: 'No history',
				attachmentPlaceholder: '[Attachment]',
				mutedBadge: 'Muted',
				archivedBadge: 'Archived',
			},
		},
		tsx: {
			_chat: {
				recalledMessageNotice: ({ user }: { user: string }) => `${user} recalled a message`,
				groupRecalledMessageNotice: ({ actor, target }: { actor: string; target: string }) => `${actor} recalled ${target}'s message`,
			},
		},
	},
}));

const apiMock = vi.mocked(misskeyApi);

const global = {
	components: {
		MkA: { props: ['to'], template: '<a :data-to="to"><slot/></a>' },
		MkResult: { props: ['type', 'text'], template: '<div :data-result="type">{{ text }}<slot/></div>' },
		MkLoading: { template: '<span data-loading>Loading</span>' },
		MkTime: { template: '<time/>' },
		MkAvatar: { props: ['user'], template: '<span class="avatar" :data-user-id="user?.id"/>' },
		MkUserName: { props: ['user'], template: '<span>{{ user?.name }}</span>' },
		MkAcct: { props: ['user'], template: '<span>@{{ user?.username }}</span>' },
		MkButton: {
			props: ['disabled'],
			emits: ['click'],
			template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot/></button>',
		},
	},
};

function makeDmMessage(id: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		createdAt: '2026-11-21T00:00:00Z',
		fromUserId: 'peer1',
		fromUser: { id: 'peer1', username: 'peer1', host: null, name: 'Peer One', avatarUrl: '', avatarBlurhash: null, avatarDecorations: [], emojis: {} },
		toUserId: 'me1',
		toUser: { id: 'me1', username: 'me1', host: null, name: 'Me', avatarUrl: '', avatarBlurhash: null, avatarDecorations: [], emojis: {} },
		text: 'hello',
		isRead: false,
		reactions: [],
		...overrides,
	};
}

function makeRoomMessage(id: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		createdAt: '2026-11-21T01:00:00Z',
		fromUserId: 'peer1',
		fromUser: { id: 'peer1', username: 'peer1', host: null, name: 'Peer One', avatarUrl: '', avatarBlurhash: null, avatarDecorations: [], emojis: {} },
		toRoomId: 'room1',
		toRoom: {
			id: 'room1',
			createdAt: '2026-11-20T00:00:00Z',
			ownerId: 'owner1',
			owner: { id: 'owner1', username: 'owner1', host: null, name: 'Owner', avatarUrl: '', avatarBlurhash: null, avatarDecorations: [], emojis: {} },
			name: 'Test Room',
			description: '',
			iconUrl: 'https://example.com/room.png',
			isPublic: true,
			isMember: true,
			isMuted: true,
			isArchived: true,
		},
		text: 'room hello',
		isRead: true,
		reactions: [],
		...overrides,
	};
}

async function flush() {
	await nextTick();
	await new Promise(resolve => setTimeout(resolve, 0));
	await nextTick();
}

afterEach(() => {
	cleanup();
	apiMock.mockReset();
	disposeMock.mockReset();
	onMock.mockReset();
});

describe('MkChatHistories', () => {
	test('disposes main stream channel on unmount', async () => {
		apiMock.mockResolvedValue([] as never);
		const view = render(MkChatHistories, { global });
		await flush();
		expect(disposeMock).not.toHaveBeenCalled();
		view.unmount();
		expect(disposeMock).toHaveBeenCalledOnce();
	});

	test('handles null/deleted peer user safely and shows attachment placeholder', async () => {
		apiMock.mockImplementation(((_ep: string, data: { room?: boolean }) => {
			if (data?.room === false) {
				return Promise.resolve([
					makeDmMessage('m1', { fromUser: null, text: null, fileId: 'f1', file: { id: 'f1' } }),
				]);
			}
			return Promise.resolve([]);
		}) as typeof misskeyApi);

		const { container } = render(MkChatHistories, { global });
		await flush();

		expect(container.textContent).toContain('Unknown');
		expect(container.textContent).toContain('[Attachment]');
		expect(container.querySelector('[data-to="/chat/user/peer1"]')).not.toBeNull();
	});

	test('renders room iconUrl, muted badge, and archived badge', async () => {
		apiMock.mockImplementation(((_ep: string, data: { room?: boolean }) => {
			if (data?.room === true) {
				return Promise.resolve([makeRoomMessage('r1')]);
			}
			return Promise.resolve([]);
		}) as typeof misskeyApi);

		const { container } = render(MkChatHistories, { global });
		await flush();

		const img = container.querySelector('img[src="https://example.com/room.png"]');
		expect(img).not.toBeNull();
		expect(container.textContent).toContain('Test Room');
		expect(container.textContent).toContain('Archived');
		expect(container.querySelector('[title="Muted"]')).not.toBeNull();
	});

	test('shows error state with retry button on initial fetch failure', async () => {
		apiMock.mockRejectedValueOnce(new Error('network error'));
		const { container } = render(MkChatHistories, { global });
		await flush();

		expect(container.querySelector('[data-result="error"]')).not.toBeNull();
		expect(container.textContent).toContain('Retry');

		apiMock.mockResolvedValue([] as never);
		await fireEvent.click(container.querySelector('button')!);
		await flush();
		expect(container.querySelector('[data-result="empty"]')).not.toBeNull();
	});

	test('supports filter prop (direct / rooms) and untilId loadMore pagination', async () => {
		const page1Rooms = Array.from({ length: 31 }, (_, i) => makeRoomMessage(`room-msg-${i}`, {
			toRoomId: `room-${i}`,
			toRoom: {
				id: `room-${i}`,
				createdAt: '2026-11-20T00:00:00Z',
				ownerId: 'owner1',
				owner: { id: 'owner1', username: 'owner1', host: null, name: 'Owner', avatarUrl: '', avatarBlurhash: null, avatarDecorations: [], emojis: {} },
				name: `Room ${i}`,
				description: '',
				isPublic: false,
				isMember: true,
			},
		}));
		const page2Rooms = [makeRoomMessage('room-msg-last', {
			toRoomId: 'room-last',
			toRoom: {
				id: 'room-last',
				createdAt: '2026-11-19T00:00:00Z',
				ownerId: 'owner1',
				owner: { id: 'owner1', username: 'owner1', host: null, name: 'Owner', avatarUrl: '', avatarBlurhash: null, avatarDecorations: [], emojis: {} },
				name: 'Room Last',
				description: '',
				isPublic: false,
				isMember: true,
			},
		})];

		apiMock.mockImplementation(((_ep: string, data: { room?: boolean; untilId?: string }) => {
			expect(data.room).toBe(true);
			if (data.untilId === 'room-msg-29') {
				return Promise.resolve(page2Rooms);
			}
			return Promise.resolve(page1Rooms);
		}) as typeof misskeyApi);

		const { container } = render(MkChatHistories, { props: { filter: 'rooms' }, global });
		await flush();

		expect(apiMock).toHaveBeenCalledTimes(1);
		expect(container.textContent).toContain('Room 0');
		expect(container.textContent).toContain('Load more');

		await fireEvent.click(container.querySelector('button')!);
		await flush();

		expect(container.textContent).toContain('Room Last');
		expect(container.textContent).not.toContain('Load more');
	});

	test('does not double-fetch immediately after mount inside KeepAlive, refreshes on re-activation', async () => {
		vi.useFakeTimers();
		try {
			apiMock.mockResolvedValue([] as never);
			const show = ref(true);
			const Host = defineComponent({
				setup() {
					return () => h(KeepAlive, null, {
						default: () => show.value ? h(MkChatHistories, { filter: 'direct' }) : null,
					});
				},
			});

			render(Host, { global });
			await vi.advanceTimersByTimeAsync(250);
			expect(apiMock).toHaveBeenCalledTimes(1);

			show.value = false;
			await nextTick();
			show.value = true;
			await vi.advanceTimersByTimeAsync(250);
			expect(apiMock).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});
});
