/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import { nextTick, ref } from 'vue';
import { prefer } from '@/preferences.js';
import MkAutocomplete from '@/components/MkAutocomplete.vue';
import { misskeyApi } from '@/utility/misskey-api.js';

vi.mock('@/custom-emojis.js', async () => {
	const { shallowRef } = await import('vue');
	return { customEmojis: shallowRef([]) };
});

vi.mock('@/store.js', () => ({
	store: {
		s: {
			additionalUnicodeEmojiIndexes: {},
			recentlyUsedEmojis: [],
		},
		set: vi.fn(),
	},
}));

vi.mock('@/os.js', () => ({
	claimZIndex: () => 3000100,
}));

vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: vi.fn(),
}));

vi.mock('@/i.js', () => ({
	$i: { id: 'me1', username: 'me1', host: null },
	iAmModerator: false,
	iAmAdmin: false,
	notesCount: 0,
	incNotesCount: vi.fn(),
	ensureSignin: () => ({ id: 'me1', username: 'me1', host: null }),
}));

const apiMock = vi.mocked(misskeyApi);

const global = {
	stubs: {
		MkUserName: { props: ['user'], template: '<span>{{ user?.username }}</span>' },
		MkCustomEmoji: true,
		MkEmoji: true,
	},
};

async function flush() {
	await nextTick();
	await new Promise(resolve => setTimeout(resolve, 0));
	await nextTick();
}

beforeEach(() => {
	prefer.r.emojiStyle = ref<'native' | 'twemoji' | 'fluentEmoji'>('fluentEmoji');
	window.sessionStorage.clear();
	window.localStorage.clear();
	apiMock.mockReset();
});

afterEach(() => {
	cleanup();
	window.sessionStorage.clear();
	window.localStorage.clear();
});

describe('MkAutocomplete bug fixes', () => {
	test('renders cached hashtag suggestions without variable shadowing', async () => {
		window.sessionStorage.setItem('autocomplete:hashtag:foo', JSON.stringify(['foobar', 'foobaz']));
		const textarea = window.document.createElement('textarea');
		window.document.body.appendChild(textarea);

		const { container } = render(MkAutocomplete, {
			props: {
				type: 'hashtag',
				q: 'foo',
				textarea,
				close: vi.fn(),
				x: 0,
				y: 0,
			},
			global,
		});
		await flush();

		expect(apiMock).not.toHaveBeenCalled();
		expect(container.textContent).toContain('foobar');
		expect(container.textContent).toContain('foobaz');
		textarea.remove();
	});

	test('does not render empty <ol> when type is emoji and emojis list is empty', async () => {
		const textarea = window.document.createElement('textarea');
		window.document.body.appendChild(textarea);

		const { container } = render(MkAutocomplete, {
			props: {
				type: 'emoji',
				q: 'zzzz_no_such_emoji_9999',
				textarea,
				close: vi.fn(),
				x: 0,
				y: 0,
			},
			global,
		});
		await flush();

		expect(container.querySelector('ol')).toBeNull();
		textarea.remove();
	});

	test('mfmParam with paramless/unlisted MFM tag does not throw TypeError', async () => {
		const textarea = window.document.createElement('textarea');
		window.document.body.appendChild(textarea);

		const { container } = render(MkAutocomplete, {
			props: {
				type: 'mfmParam',
				q: { tag: 'sparkle', params: ['foo'] },
				textarea,
				close: vi.fn(),
				x: 0,
				y: 0,
			},
			global,
		});
		await flush();

		expect(container.querySelector('ol')).toBeNull();
		textarea.remove();
	});

	test('userSearchSeq ignores late @ab API response after backspacing to @ in roomContext', async () => {
		let resolveQuery!: (rows: unknown[]) => void;
		apiMock.mockImplementation((endpoint) => {
			if (endpoint === 'chat/rooms/members') {
				return new Promise(resolve => { resolveQuery = resolve; }) as never;
			}
			return Promise.resolve([]) as never;
		});

		const textarea = window.document.createElement('textarea');
		window.document.body.appendChild(textarea);
		const member = { id: 'u-local', username: 'alice', host: null, name: 'Alice' };

		const view = render(MkAutocomplete, {
			props: {
				type: 'user',
				q: 'ab',
				textarea,
				close: vi.fn(),
				x: 0,
				y: 0,
				roomContext: {
					roomId: 'room-1',
					getMembers: () => [member as never],
				},
			},
			global,
		});
		await flush();

		// Backspace from @ab to @ (q becomes null) before @ab API resolves
		await view.rerender({
			type: 'user',
			q: null,
			textarea,
			close: vi.fn(),
			x: 0,
			y: 0,
			roomContext: {
				roomId: 'room-1',
				getMembers: () => [member as never],
			},
		});
		await flush();

		resolveQuery([
			{ user: { id: 'u-late', username: 'abraham', host: null, name: 'Abraham' } },
		]);
		await flush();

		expect(view.container.textContent).toContain('alice');
		expect(view.container.textContent).not.toContain('abraham');
		textarea.remove();
	});

	test('captures Enter in capture phase before bubble listener and guards IME events', async () => {
		const textarea = window.document.createElement('textarea');
		window.document.body.appendChild(textarea);

		// Bubble listener registered BEFORE MkAutocomplete mounts (mirrors <textarea @keydown="onKeydown"> in room.form.vue)
		const formEnterSpy = vi.fn();
		textarea.addEventListener('keydown', (ev) => {
			if (ev.key === 'Enter') formEnterSpy();
		});

		const closeSpy = vi.fn();
		const onDone = vi.fn();
		apiMock.mockResolvedValue([
			{ id: 'u1', username: 'bob', host: null, name: 'Bob', avatarUrl: '' },
		] as never);

		const view = render(MkAutocomplete, {
			props: {
				type: 'user',
				q: 'bo',
				textarea,
				close: closeSpy,
				x: 0,
				y: 0,
				onDone,
			},
			global,
		});
		await waitFor(() => expect(view.container.textContent).toContain('bob'));

		// 1) IME composition events must be ignored (no close, no selection)
		const imeEsc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		Object.defineProperty(imeEsc, 'isComposing', { value: true });
		textarea.dispatchEvent(imeEsc);

		const imeProcess = new KeyboardEvent('keydown', { key: 'Process', bubbles: true, cancelable: true });
		textarea.dispatchEvent(imeProcess);

		const ime229 = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true });
		textarea.dispatchEvent(ime229);

		expect(closeSpy).not.toHaveBeenCalled();

		// 2) ArrowDown highlights first item, then Enter selects it and stops propagation before formEnterSpy
		textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
		await nextTick();

		const selectedEl = view.container.querySelector('li[data-selected="true"]') as HTMLElement;
		expect(selectedEl).not.toBeNull();
		// Even if Enter originates on textarea (or selected li), bubble form listener must not run.
		textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		await nextTick();

		expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ type: 'user' }));
		expect(formEnterSpy).not.toHaveBeenCalled();
		textarea.remove();
	});
});
