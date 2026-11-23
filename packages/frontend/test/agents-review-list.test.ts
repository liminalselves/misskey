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
vi.mock('@/os.js', () => ({ alert: vi.fn(), toast: vi.fn(), confirm: vi.fn(), popup: vi.fn() }));
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
vi.mock('@/components/MkInput.vue', () => ({ default: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>' } }));
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
			template: '<div><button data-overview @click="$emit(\'update:tab\', \'overview\')"/><button data-queue @click="$emit(\'update:tab\', \'queue\')"/><button data-sessions @click="$emit(\'update:tab\', \'sessions\')"/><button data-external @click="$emit(\'update:tab\', \'externalAudit\')"/><button data-review @click="$emit(\'update:tab\', \'review\')"/><button data-images @click="$emit(\'update:tab\', \'images\')"/><button data-logs @click="$emit(\'update:tab\', \'logs\')"/><button data-refresh @click="actions[0].handler()"/><slot/></div>',
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
	await Promise.resolve();
	await nextTick();
	await Promise.resolve();
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

afterEach(() => {
	vi.useRealTimers();
	cleanup();
});

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

function sampleRows(view: 'queue' | 'sessions' | 'externalAudit' | 'images' | 'logs' | 'messages', count: number, prefix = 'row') {
	return Array.from({ length: count }, (_, i) => {
		const id = `${prefix}-${i}`;
		if (view === 'queue') {
			return { kind: 'character', id, userId: 'u1', name: id, summary: 's', reviewStatus: 'pending', isPublished: false, publishedVersion: null, moderationBanned: false, promptOpenSourced: false, reviewRejectReason: null, reviewRejectMessage: null, reviewInternalNote: null, createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z', user: null, avatar: null, worldbookCount: 0, riskTags: [] };
		}
		if (view === 'sessions') {
			return { id, createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z', userId: 'u1', name: id, characterId: 'c1', dialogueStyleId: null, sessionKind: 'community', lastMessageAt: null, agentReplyPending: false, moderationBanned: false, characterName: 'char', user: null, messageCount: 1 };
		}
		if (view === 'externalAudit') {
			return { id, createdAt: '2026-11-09T00:00:00Z', completedAt: null, durationMs: null, userId: 'u1', user: null, sessionId: 's1', sessionName: 's1', characterId: 'c1', characterName: 'char', dialogueStyleId: null, modelId: 'm1', modelName: 'model', apiModelName: null, baseUrl: null, priority: 0, attemptIndex: 0, status: 'block', blockCode: id, category: 'cat', reason: 'r', confidence: null, userText: 'u', assistantText: 'a', responseText: null, errorCode: null, errorMessage: null };
		}
		if (view === 'images') {
			return { id, createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z', userId: 'u1', user: null, sessionId: 's1', messageId: null, placeholderIndex: 0, tag: id, size: 'square', provider: 'aurora', imageModelId: 'im1', imageModelName: id, status: 'succeeded', fileId: null, file: null, errorCode: null, errorMessage: null, cost: 0, isBlocked: false, blockedReason: null, autoCleanedAt: null, autoCleanedReason: null };
		}
		if (view === 'logs') {
			return { id, createdAt: '2026-11-09T00:00:00Z', type: 'resolveAgentReview', info: { name: id, kind: 'character', id, reviewStatus: 'published' }, userId: 'mod1', user: null };
		}
		return { id, role: 'user', content: id, createdAt: '2026-11-09T00:00:00Z', sessionId: 's1', sessionName: 's1', sessionKind: 'community', userId: 'u1', user: null, characterId: 'c1', characterName: 'char', dialogueStyleId: null, sessionModerationBanned: false, characterModerationBanned: false };
	});
}

describe('Governance tabs pagination errors, openFiltered, and quick-action state', () => {
	test.each([
		['queue', 'admin/agents/governance/review/list'],
		['sessions', 'admin/agents/governance/sessions/list'],
		['externalAudit', 'admin/agents/governance/external-audit/list'],
		['images', 'admin/agents/governance/images/list'],
		['logs', 'admin/agents/governance/logs/list'],
	] as const)('%s tab alerts on load-more failure and retries cleanly on click', async (tab, tabEndpoint) => {
		vi.mocked(os.alert).mockReset();
		api.mockImplementation((ep) => {
			if (ep === tabEndpoint) {
				const calls = api.mock.calls.filter(([e]) => e === tabEndpoint).length;
				if (calls === 1) return Promise.resolve(sampleRows(tab, 31, 'p1')) as never;
				if (calls === 2) return Promise.reject(new Error(`${tab}-page2-failed`));
				return Promise.resolve(sampleRows(tab, 1, 'p2')) as never;
			}
			return Promise.resolve(ep.endsWith('/summary') ? {} : []) as never;
		});
		const view = render(AgentsReview, { props: { view: tab }, global });
		await settle();
		const loadMore = () => [...view.container.querySelectorAll('button')].find(b => b.textContent?.includes('继续载入'))!;
		expect(loadMore()).toBeDefined();

		await fireEvent.click(loadMore());
		await settle();
		expect(os.alert).toHaveBeenCalledWith({ type: 'error', text: `${tab}-page2-failed` });

		await fireEvent.click(loadMore());
		await settle();
		expect(view.container.textContent).toContain('p2-0');
	});

	test('messages tab alerts on load-more failure and retries cleanly on click', async () => {
		vi.useFakeTimers();
		vi.mocked(os.alert).mockReset();
		const msgEndpoint = 'admin/agents/governance/messages/list';
		api.mockImplementation((ep) => {
			if (ep === msgEndpoint) {
				const calls = api.mock.calls.filter(([e]) => e === msgEndpoint).length;
				if (calls === 1) return Promise.resolve(sampleRows('messages', 31, 'm1')) as never;
				if (calls === 2) return Promise.reject(new Error('messages-page2-failed'));
				return Promise.resolve(sampleRows('messages', 1, 'm2')) as never;
			}
			return Promise.resolve(ep.endsWith('/summary') ? {} : []) as never;
		});
		const view = render(AgentsReview, { props: { view: 'sessions' }, global });
		await settle();
		const firstInput = view.container.querySelector('input')!;
		await fireEvent.update(firstInput, 'alice');
		vi.advanceTimersByTime(360);
		await settle();
		const loadMore = () => [...view.container.querySelectorAll('button')].find(b => b.textContent?.includes('继续载入'))!;
		expect(loadMore()).toBeDefined();

		await fireEvent.click(loadMore());
		await settle();
		expect(os.alert).toHaveBeenCalledWith({ type: 'error', text: 'messages-page2-failed' });

		await fireEvent.click(loadMore());
		await settle();
		expect(view.container.textContent).toContain('m2-0');
	});

	test('openFiltered resets unrelated filters and triggers a single immediate load without 350ms duplicate', async () => {
		vi.useFakeTimers();
		localStorage.setItem('agents-review-filters', JSON.stringify({
			image: { userId: 'stale-user', sessionId: 'stale-sess', messageId: 'm1', status: 'failed', blocked: '', query: 'stale' },
		}));
		const imageCalls: unknown[] = [];
		api.mockImplementation((ep, params) => {
			if (ep === 'admin/agents/governance/images/list') {
				imageCalls.push(params);
				return Promise.resolve(sampleRows('images', 1, 'img')) as never;
			}
			return Promise.resolve(ep.endsWith('/summary') ? { blockedImages: 2 } : []) as never;
		});

		const view = render(AgentsReview, { props: { view: 'images' }, global });
		await settle();
		expect(imageCalls).toHaveLength(1);

		await fireEvent.click(view.container.querySelector('[data-overview]')!);
		await settle();
		const cardBtn = [...view.container.querySelectorAll('button')].find(b => b.textContent?.includes('封禁图片'))!;
		await fireEvent.click(cardBtn);
		await settle();

		expect(imageCalls).toHaveLength(2);
		expect(imageCalls[1]).toEqual(expect.objectContaining({
			userId: null,
			sessionId: null,
			messageId: null,
			status: null,
			blocked: true,
			query: null,
		}));

		vi.advanceTimersByTime(400);
		await settle();
		expect(imageCalls).toHaveLength(2);
	});

	test('openQuickActionForUser patches banned sessions already loaded in the sessions tab', async () => {
		vi.mocked(os.popup).mockImplementation((_comp, _props, cbs) => {
			(cbs as { done?: (res: unknown) => void })?.done?.({
				sessionIds: ['s1'],
				sessionBanReason: 'policy',
				suspendDurationHours: -1,
				userSuspendReason: null,
				moderationNote: null,
				violationCategory: 'other',
			});
			return { dispose: vi.fn() } as never;
		});
		api.mockImplementation((ep) => {
			if (ep === 'admin/agents/governance/sessions/list') {
				return Promise.resolve([{ ...sampleRows('sessions', 1, 's')[0], id: 's1', name: 'target-session', moderationBanned: false }]) as never;
			}
			if (ep === endpoint) {
				return Promise.resolve([{ ...card('u1', 's1'), sessionName: 'target-session' }]) as never;
			}
			if (ep === 'admin/agents/governance/quick-action') {
				return Promise.resolve({ sessionsBanned: 1 }) as never;
			}
			return Promise.resolve(ep.endsWith('/summary') ? {} : []) as never;
		});

		const view = render(AgentsReview, { props: { view: 'sessions' }, global });
		await settle();
		expect(view.container.textContent).not.toContain('已封禁');

		await fireEvent.click(view.container.querySelector('[data-review]')!);
		await settle();
		const handleBtn = [...view.container.querySelectorAll('button')].find(b => b.textContent?.includes('处理'))!;
		await fireEvent.click(handleBtn);
		await vi.waitFor(() => expect(api).toHaveBeenCalledWith('admin/agents/governance/quick-action', expect.anything()));
		await settle();

		const sessionCallsBeforeRevisit = api.mock.calls.filter(([ep]) => ep === 'admin/agents/governance/sessions/list').length;
		await fireEvent.click(view.container.querySelector('[data-sessions]')!);
		await settle();
		expect(api.mock.calls.filter(([ep]) => ep === 'admin/agents/governance/sessions/list')).toHaveLength(sessionCallsBeforeRevisit);
		expect(view.container.textContent).toContain('target-session');
		expect(view.container.textContent).toContain('已封禁');
	});
});
