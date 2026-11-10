/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import AgentsReview from '@/pages/admin/agents-review.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn(), formatApiError: (error: Error) => error.message }));
vi.mock('@/os.js', () => ({ alert: vi.fn(), toast: vi.fn(), confirm: vi.fn() }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ getCurrentFullPath: () => '/admin/agents-review?view=review', replaceByPath: vi.fn() }) }));
vi.mock('@/i.js', () => ({ iAmModerator: true, $i: { id: 'moderator', username: 'moderator' } }));
vi.mock('@/utility/agent-governance-events.js', () => ({ onGovernanceEvent: () => () => {} }));
vi.mock('@/utility/prefer-mobile-navigation.js', () => ({ preferMobileNavigation: () => false }));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: vi.fn() }));
vi.mock('@/utility/format-time-string.js', () => ({ formatDateTimeString: (value: string) => value }));
vi.mock('@/components/global/MkLoading.vue', () => ({ default: { template: '<span data-loading/>' } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkInput.vue', () => ({ default: { template: '<input/>' } }));
vi.mock('@/components/MkSelect.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkFilterBand.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/form/split.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkDriveFileThumbnail.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkAgentQuickActionDialog.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkUserAcctInline.vue', () => ({ default: { props: ['fallback'], template: '<span>{{ fallback }}</span>' } }));

const endpoint = 'admin/agents/governance/external-audit/review-list';
const api = vi.mocked(misskeyApi);
const global = {
	stubs: {
		PageWithHeader: {
			props: ['tab', 'actions'], emits: ['update:tab'],
			template: '<div><button data-external @click="$emit(\'update:tab\', \'externalAudit\')"/><button data-review @click="$emit(\'update:tab\', \'review\')"/><button data-refresh @click="actions[0].handler()"/><slot/></div>',
		},
	},
	components: { MkResult: { props: ['text'], template: '<div data-error>{{ text }}<slot/></div>' } },
	directives: { panel: {}, appear: {} },
};
let requests: { resolve: (rows: unknown[]) => void; reject: (error: Error) => void }[];

function card(userId: string, sessionId: string | null = null) {
	return { userId, sessionId, sessionName: sessionId, sessionModerationBanned: false, userReviewUntilId: `${userId}-user-last`, user: null, isSuspended: false, suspendedUntil: null, moderationNote: null, blockCount: 3, latestBlockAt: null, reviewUntilId: `${userId}-last`, logs: [] };
}

async function settle() {
	await nextTick();
	await nextTick();
	await nextTick();
}

async function finish(rows: unknown[]) {
	const request = requests.shift();
	expect(request).toBeDefined();
	request!.resolve(rows);
	await settle();
}

beforeEach(() => {
	localStorage.clear();
	requests = [];
	api.mockReset();
	api.mockImplementation((ep) => {
		if (ep === endpoint) return new Promise((resolve, reject) => requests.push({ resolve, reject }));
		return Promise.resolve(ep.endsWith('/summary') ? {} : []) as never;
	});
});

afterEach(cleanup);

describe('External audit review list', () => {
	test('refreshes existing review cards when returning from the external audit tab', async () => {
		const view = render(AgentsReview, { props: { view: 'review' }, global });
		await finish([card('old-user')]);
		await fireEvent.click(view.container.querySelector('[data-external]')!);
		await fireEvent.click(view.container.querySelector('[data-review]')!);
		expect(requests).toHaveLength(1);
		await finish([card('old-user'), card('new-user')]);
		expect(view.container.textContent).toContain('old-user');
		expect(view.container.textContent).toContain('new-user');
	});

	test('shows a retry instead of an empty-review message when the initial request fails', async () => {
		const view = render(AgentsReview, { props: { view: 'review' }, global });
		requests.shift()!.reject(new Error('offline'));
		await settle();
		expect(view.container.querySelector('[data-error]')?.textContent).toContain('offline');
		expect(view.container.textContent).not.toContain('暂无需要复审的用户');
		await fireEvent.click(view.container.querySelector('[data-error] button')!);
		await finish([card('retried-user')]);
		expect(view.container.textContent).toContain('retried-user');
	});

	test('preserves previously loaded evidence while refreshing and after a refresh failure', async () => {
		const view = render(AgentsReview, { props: { view: 'review' }, global });
		await finish([card('existing-user')]);
		await fireEvent.click(view.container.querySelector('[data-refresh]')!);
		await settle();
		expect(view.container.textContent).toContain('existing-user');
		requests.shift()!.reject(new Error('offline'));
		await settle();
		expect(view.container.textContent).toContain('existing-user');
		expect(os.alert).toHaveBeenCalledWith({ type: 'error', text: 'offline' });
	});

	test('advances the raw offset and keeps loading after a duplicate-only page', async () => {
		const view = render(AgentsReview, { props: { view: 'review' }, global });
		const rows = Array.from({ length: 31 }, (_, i) => card(`user-${i}`));
		await finish(rows);
		const loadMore = () => [...view.container.querySelectorAll('button')].find(button => button.textContent?.includes('加载更多用户'))!;
		await fireEvent.click(loadMore());
		await finish(rows);
		expect(loadMore()).toBeDefined();
		await fireEvent.click(loadMore());
		expect(api).toHaveBeenLastCalledWith(endpoint, { userId: null, limit: 31, offset: 60 });
		await finish([card('last-user')]);
		expect(view.container.textContent).toContain('last-user');
	});

	test('ignores every unreviewed block up to the listed upper id, not just displayed details', async () => {
		vi.mocked(os).confirm = vi.fn().mockResolvedValue({ canceled: false }) as never;
		const view = render(AgentsReview, { props: { view: 'review' }, global });
		await finish([{ ...card('owner'), blockCount: 80, logs: [] }]);
		const ignore = [...view.container.querySelectorAll('button')].find(button => button.textContent?.includes('忽略'))!;
		await fireEvent.click(ignore);
		await settle();
		expect(os.confirm).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('80 条') }));
		expect(api).toHaveBeenCalledWith('admin/agents/governance/external-audit/review-ignore', { userId: 'owner', untilId: 'owner-last', sessionId: null });
	});

	test('shows one card per user and session, with the session link on the group header', async () => {
		const view = render(AgentsReview, { props: { view: 'review' }, global });
		const log = { id: 'l1', createdAt: '2026-11-09T00:00:00Z', sessionId: 'a', sessionName: 'a', sessionModerationBanned: false, characterName: 'c', blockCode: null, category: null, reason: null, userText: 'u', assistantText: 'r' };
		await finish([{ ...card('owner', 'a'), logs: [log] }, { ...card('owner', 'b'), logs: [{ ...log, id: 'l2', sessionId: 'b' }] }]);
		expect(view.container.querySelectorAll('article')).toHaveLength(2);
		const sessionLinks = () => [...view.container.querySelectorAll('button')].filter(b => b.textContent?.includes('查看会话'));
		expect(sessionLinks()).toHaveLength(2);
		for (const toggle of [...view.container.querySelectorAll('button')].filter(b => b.textContent?.includes('展开'))) await fireEvent.click(toggle);
		// 展开明细后，层级仍只在组头，不在每条拦截下重复
		expect(sessionLinks()).toHaveLength(2);
	});

	test('discards an in-flight response when a newer tab entry requests a reset', async () => {
		const view = render(AgentsReview, { props: { view: 'review' }, global });
		await fireEvent.click(view.container.querySelector('[data-external]')!);
		await fireEvent.click(view.container.querySelector('[data-review]')!);
		await finish([card('stale-user')]);
		expect(view.container.textContent).not.toContain('stale-user');
		await finish([card('fresh-user')]);
		expect(view.container.textContent).toContain('fresh-user');
	});
});
