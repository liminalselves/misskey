/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import './init';
import MkChatHistories from '@/components/MkChatHistories.vue';
import { misskeyApi } from '@/utility/misskey-api.js';

vi.mock('@@/js/locale.js', () => ({ locale: {} }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn(), formatApiError: vi.fn() }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'user1' }) }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: vi.fn() }));
vi.mock('@/stream.js', () => ({ useStream: () => ({ useChannel: () => ({ on: vi.fn(), dispose: vi.fn() }) }) }));
vi.mock('@/components/MkDriveFileThumbnail.vue', () => ({ default: { render: () => null } }));

const apiMock = vi.mocked(misskeyApi);

const global = {
	components: {
		MkA: { template: '<a><slot/></a>' },
		MkResult: { template: '<div data-result><slot/></div>' },
		MkLoading: { template: '<span data-loading>Loading</span>' },
		MkTime: { template: '<time/>' },
		MkAvatar: { template: '<span/>' },
		MkUserName: { template: '<span><slot/></span>' },
		MkAcct: { template: '<span/>' },
	},
};

const sessionRow = {
	id: 'agent-session-1',
	name: 'Agent chat',
	sessionKind: 'draft_test' as const,
	lastMessageAt: '2026-10-26T00:00:00Z',
	characterName: 'Chara',
	characterAvatar: null,
	lastMessagePreview: 'hello there',
	lastMessageRole: 'assistant',
	hasUnread: false,
	unreadCount: 0,
	sessionModerationBanned: false,
	characterModerationBanned: false,
};

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	cleanup();
});

describe('MkChatHistories agent sessions merge', () => {
	test('10s polling refreshes list-mine every tick and failures keep loaded sessions', async () => {
		let listMineCalls = 0;
		let historyCalls = 0;
		apiMock.mockReset();
		apiMock.mockImplementation(((endpoint: string) => {
			if (endpoint === 'agents/sessions/list-mine') {
				listMineCalls += 1;
				// 第二次开始模拟 429 限流/网络失败
				return listMineCalls === 1
					? Promise.resolve([sessionRow])
					: Promise.reject(new Error('rate limited'));
			}
			if (endpoint === 'chat/history') {
				historyCalls += 1;
				return Promise.resolve([]);
			}
			return Promise.resolve([]);
		}) as typeof misskeyApi);

		const { container } = render(MkChatHistories, { props: { includeAgentSessions: true }, global });

		await vi.advanceTimersByTimeAsync(0);
		expect(historyCalls).toBe(2);
		expect(listMineCalls).toBe(1);
		expect(container.textContent).toContain('Agent chat');

		// 每次 10s 轮询都会刷新 list-mine；本次失败（429）时已加载的智能体会话必须保留
		await vi.advanceTimersByTimeAsync(10_000);
		expect(historyCalls).toBe(4);
		expect(listMineCalls).toBe(2);
		expect(container.querySelector('[data-loading]')).toBeNull();
		expect(container.textContent).toContain('Agent chat');
	});
});
