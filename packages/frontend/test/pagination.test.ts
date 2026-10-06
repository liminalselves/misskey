/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, withDirectives } from 'vue';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { Paginator } from '@/utility/paginator.js';
import MkPagination from '@/components/MkPagination.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { appearDirective } from '@/directives/appear.js';
import { useGovernancePagination } from '@/composables/use-governance-pagination.js';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: api }));
vi.mock('@/preferences.js', () => ({ prefer: {
	s: { animation: false, enablePullToRefresh: false }, r: { enableInfiniteScroll: { value: true } },
} }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { loadMore: 'Load more', loadMoreFailed: 'Retry loading' } } }));
vi.mock('@/os.js', () => ({}));
vi.mock('@/components/MkPaginationControl.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPullToRefresh.vue', () => ({ default: { render: () => null } }));

const rows = (count: number, start = 0) => Array.from({ length: count }, (_, i) => ({
	id: String(start + i).padStart(4, '0'), createdAt: '2026-10-06T00:00:00.000Z',
}));

function observeVisibleButtons() {
	vi.stubGlobal('IntersectionObserver', class {
		private active = true;
		constructor(private callback: IntersectionObserverCallback) {}
		observe(target: Element) {
			queueMicrotask(() => {
				if (this.active) this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
			});
		}
		disconnect() { this.active = false; }
	});
}

function mountPagination(paginator: Paginator<'users/search'>) {
	return render(MkPagination, {
		props: { paginator, autoLoad: false },
		slots: { default: ({ items }) => h('div', items.map(item => h('div', { 'data-item': item.id }, item.id))) },
		global: { components: { MkLoading }, stubs: { MkError: true, MkResult: true, MkA: true }, directives: { appear: appearDirective } },
	});
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	api.mockReset();
});

describe('Paginator exhaustion', () => {
	test('an empty page stops further requests', async () => {
		api.mockResolvedValueOnce(rows(2)).mockResolvedValue([]);
		const paginator = new Paginator('users/search', { offsetMode: true });
		await paginator.init();
		await paginator.fetchOlder();
		await paginator.fetchOlder();
		expect(paginator.canFetchOlder.value).toBe(false);
		expect(api).toHaveBeenCalledTimes(2);
	});

	test('a duplicate-only page cannot leave an unchanging list loading forever', async () => {
		api.mockResolvedValue(rows(2));
		const paginator = new Paginator('users/search', { offsetMode: true });
		await paginator.init();
		await paginator.fetchOlder();
		await paginator.fetchOlder();
		expect(paginator.items.value).toHaveLength(2);
		expect(paginator.canFetchOlder.value).toBe(false);
		expect(api).toHaveBeenCalledTimes(2);
	});

	test('offsets count consumed API rows, not deduplicated or removed display rows', async () => {
		api.mockResolvedValueOnce(rows(2)).mockResolvedValueOnce(rows(3, 1)).mockResolvedValueOnce([]);
		const paginator = new Paginator('users/search', { offsetMode: true });
		await paginator.init();
		await paginator.fetchOlder();
		paginator.removeItem('0000');
		await paginator.fetchOlder();
		expect(api.mock.calls[2][1].offset).toBe(5);
	});

	test.each([[10, 10, true], [30, 20, false]])('initial limit %i with %i results hasMore=%s', async (limit, count, hasMore) => {
		api.mockResolvedValue(rows(count));
		const paginator = new Paginator('users/search', { limit, canFetchDetection: 'limit' });
		await paginator.init();
		expect(paginator.canFetchOlder.value).toBe(hasMore);
	});

	test('a partial subsequent page uses its actual request limit', async () => {
		api.mockResolvedValueOnce(rows(30, 30)).mockResolvedValueOnce(rows(20));
		const paginator = new Paginator('users/search', { limit: 30, canFetchDetection: 'limit' });
		await paginator.init();
		await paginator.fetchOlder();
		expect(paginator.canFetchOlder.value).toBe(false);
	});

	test('safe detection keeps partial pages available until exhaustion', async () => {
		api.mockResolvedValueOnce(rows(2, 10)).mockResolvedValueOnce(rows(1)).mockResolvedValueOnce([]);
		const paginator = new Paginator('users/search', {});
		await paginator.init();
		await paginator.fetchOlder();
		expect(paginator.canFetchOlder.value).toBe(true);
		await paginator.fetchOlder();
		expect(paginator.canFetchOlder.value).toBe(false);
	});

	test('noPaging also applies to limit-based detection', async () => {
		api.mockResolvedValue(rows(30));
		const paginator = new Paginator('users/search', { noPaging: true, canFetchDetection: 'limit' });
		await paginator.init();
		expect(paginator.canFetchOlder.value).toBe(false);
	});

	test('newer requests do not overlap, and polling can still discover new items after an empty page', async () => {
		api.mockResolvedValueOnce(rows(2));
		const paginator = new Paginator('users/search', {});
		await paginator.init();
		let resolve!: (items: ReturnType<typeof rows>) => void;
		api.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
		const pending = paginator.fetchNewer();
		await paginator.fetchNewer();
		expect(api).toHaveBeenCalledTimes(2);
		resolve([]);
		await pending;
		api.mockResolvedValueOnce(rows(1, 2));
		await paginator.fetchNewer();
		expect(paginator.items.value.some(item => item.id === '0002')).toBe(true);
	});

	test('newer pagination failures retain manual retry and exhaustion prevents further page requests', async () => {
		api.mockResolvedValueOnce(rows(2));
		const paginator = new Paginator('users/search', { initialDirection: 'newer', order: 'oldest' });
		await paginator.init();
		api.mockRejectedValueOnce(new Error('Unavailable'));
		await paginator.fetchNewer({ pagination: true });
		expect(paginator.fetchError.value).toBe(true);
		expect(paginator.canFetchNewer.value).toBe(true);
		api.mockResolvedValueOnce([]);
		await paginator.fetchNewer({ pagination: true });
		await paginator.fetchNewer({ pagination: true });
		expect(paginator.fetchError.value).toBe(false);
		expect(paginator.canFetchNewer.value).toBe(false);
		expect(api).toHaveBeenCalledTimes(3);
	});

	test('newer duplicate-only pages stop without duplicating queued items', async () => {
		api.mockResolvedValueOnce(rows(2)).mockResolvedValue(rows(1, 2));
		const paginator = new Paginator('users/search', {});
		await paginator.init();
		await paginator.fetchNewer({ toQueue: true });
		await paginator.fetchNewer({ toQueue: true });
		expect(paginator.queuedAheadItemsCount.value).toBe(1);
		expect(paginator.canFetchNewer.value).toBe(false);
	});
});

describe('Governance pagination', () => {
	test('duplicate-only pages stop, and manual retry remains possible after a failed page', async () => {
		const fetch = vi.fn().mockResolvedValueOnce(rows(3)).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(rows(3));
		const paginator = useGovernancePagination(fetch, { pageSize: 2 });
		await paginator.load(true);
		expect(paginator.hasMore.value).toBe(true);
		await paginator.load();
		expect(paginator.error.value).not.toBeNull();
		expect(paginator.hasMore.value).toBe(true);
		await paginator.load();
		await paginator.load();
		expect(paginator.items.value).toHaveLength(2);
		expect(paginator.hasMore.value).toBe(false);
		expect(fetch).toHaveBeenCalledTimes(3);
	});
});

describe('Appear directive lifecycle', () => {
	test('enabling observes an existing element, uses the current callback, and disables pending callbacks', async () => {
		let observerCallback!: IntersectionObserverCallback;
		const disconnect = vi.fn();
		vi.stubGlobal('IntersectionObserver', class {
			constructor(callback: IntersectionObserverCallback) { observerCallback = callback; }
			observe() {}
			disconnect = disconnect;
		});
		const first = vi.fn();
		const second = vi.fn();
		const callback = ref<(() => void) | null>(null);
		const { container } = render(defineComponent(() => () => withDirectives(h('button'), [[appearDirective, callback.value]])));
		const rect = container.getBoundingClientRect();
		const entry: IntersectionObserverEntry[] = [{
			target: container.querySelector('button')!, isIntersecting: true, time: 0,
			boundingClientRect: rect, intersectionRect: rect, rootBounds: null, intersectionRatio: 1,
		}];
		callback.value = first;
		await nextTick();
		observerCallback(entry, {} as IntersectionObserver);
		expect(first).toHaveBeenCalledOnce();
		callback.value = second;
		await nextTick();
		await new Promise(r => window.setTimeout(r, 510));
		observerCallback(entry, {} as IntersectionObserver);
		expect(second).toHaveBeenCalledOnce();
		observerCallback(entry, {} as IntersectionObserver);
		callback.value = null;
		await nextTick();
		await new Promise(r => window.setTimeout(r, 510));
		expect(second).toHaveBeenCalledOnce();
		expect(disconnect).toHaveBeenCalledOnce();
	});
});

describe('Automatic pagination controls', () => {
	test('a failed request leaves a stable manual retry button instead of automatically retrying', async () => {
		observeVisibleButtons();
		api.mockResolvedValueOnce(rows(2));
		const paginator = new Paginator('users/search', { offsetMode: true });
		await paginator.init();
		api.mockImplementation(() => new Promise((_, reject) => window.setTimeout(() => reject(new Error('Network unavailable')), 20)));
		const { container } = mountPagination(paginator);
		const button = container.querySelector('button');
		await waitFor(() => expect(paginator.fetchError.value).toBe(true));
		await new Promise(r => window.setTimeout(r, 650));
		expect(api).toHaveBeenCalledTimes(2);
		expect(container.querySelector('button')).toBe(button);
		expect(button?.disabled).toBe(false);
		expect(button?.textContent).toContain('Retry loading');
		api.mockResolvedValueOnce([]);
		await fireEvent.click(button!);
		await waitFor(() => expect(paginator.canFetchOlder.value).toBe(false));
		expect(api).toHaveBeenCalledTimes(3);
	});

	test('successful short pages keep auto-loading while visible and stop at the end', async () => {
		observeVisibleButtons();
		api.mockResolvedValueOnce(rows(2, 10)).mockResolvedValueOnce(rows(1)).mockResolvedValue([]);
		const paginator = new Paginator('users/search', {});
		await paginator.init();
		mountPagination(paginator);
		await waitFor(() => expect(paginator.canFetchOlder.value).toBe(false));
		expect(paginator.items.value).toHaveLength(3);
		expect(api).toHaveBeenCalledTimes(3);
	});
});
