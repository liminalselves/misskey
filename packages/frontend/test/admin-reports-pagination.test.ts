/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import UsageLogTables from '@/components/agent-report/UsageLogTables.vue';
import SiteModelReport from '@/components/agent-report/site/SiteModelReport.vue';
import Credits from '@/pages/admin/agents-settings-credits.vue';
import Migration from '@/pages/admin/agents-settings-migration.vue';
import { misskeyApi } from '@/utility/misskey-api.js';

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn(), formatApiError: (error: Error) => error.message }));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: vi.fn() }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/os.js', () => ({ alert: vi.fn(), toast: vi.fn(), confirm: vi.fn(), popup: vi.fn() }));
vi.mock('@/components/MkButton.vue', () => ({ default: { props: ['disabled', 'wait'], template: '<button :disabled="disabled || wait"><slot/></button>' } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkFolder.vue', () => ({ default: { template: '<section><slot/></section>' } }));
vi.mock('@/components/MkInput.vue', () => ({ default: { template: '<input/>' } }));
vi.mock('@/components/MkSelect.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkLoading.vue', () => ({ default: { template: '<span data-loading/>' } }));
vi.mock('@/components/global/MkUserName.vue', () => ({ default: { props: ['user'], template: '<span>{{ user?.username ?? "" }}</span>' } }));
vi.mock('@/components/global/MkAcct.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { template: '<a><slot/></a>' } }));
vi.mock('@/components/form/split.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/agent-report/ReportModeSwitch.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/agent-report/ReportFilterBar.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/agent-report/KpiCards.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/agent-report/TrendPanel.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/agent-report/MetricLineCharts.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/agent-report/BreakdownPanels.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/agent-report/ModelTable.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/agent-report/SimpleModelList.vue', () => ({ default: { render: () => null } }));

const api = vi.mocked(misskeyApi);

const global = {
	components: {
		MkLoading: { template: '<span data-loading/>' },
		MkResult: { props: ['type', 'text'], template: '<div data-result>{{ text }}<slot/></div>' },
		MkTime: { props: ['time'], template: '<time>{{ time }}</time>' },
		MkAvatar: { template: '<span/>' },
		MkUserName: { props: ['user'], template: '<span>{{ user?.username ?? "" }}</span>' },
	},
	directives: {
		panel: {},
		appear: {
			mounted(_el: Element, binding: { value: (() => void) | null }) {
				if (typeof binding.value === 'function') binding.value();
			},
			updated(_el: Element, binding: { value: (() => void) | null }) {
				if (typeof binding.value === 'function') binding.value();
			},
		},
	},
};

async function settle() {
	await Promise.resolve();
	await nextTick();
	await Promise.resolve();
	await nextTick();
	await nextTick();
}

function billingItem(id: string) {
	return {
		id,
		kind: 'usage' as const,
		createdAt: '2026-11-10T00:00:00.000Z',
		amount: -1,
		modelName: `Model-${id}`,
		usageKind: 'chat',
		status: 'success',
		redeemCode: null,
		usedFreeQuota: false,
		freeQuotaUsedAtCall: null,
		freeQuotaTotalAtCall: null,
	};
}

function logItem(id: string) {
	return {
		id,
		requestedAt: '2026-11-10T00:00:00.000Z',
		durationMs: 120,
		modelName: `Model-${id}`,
		modelSource: 'official' as const,
		modelApiName: 'gpt',
		usageKind: 'chat',
		status: 'success',
		cost: 0.5,
		promptTokens: 10,
		completionTokens: 20,
		usedFreeQuota: false,
		freeQuotaUsedAtCall: null,
		freeQuotaTotalAtCall: null,
	};
}

beforeEach(() => {
	window.localStorage.clear();
	api.mockReset();
});

afterEach(cleanup);

describe('UsageLogTables & MkPagerBar stale error and page sync', () => {
	test('renders staleBar on page-2 billing failure, keeps page 1 in pager, disables size buttons while loading, and retries page 2', async () => {
		let rejectPage2!: (err: Error) => void;
		let resolveRetry!: (res: unknown) => void;
		let billingCall = 0;

		api.mockImplementation((ep) => {
			if (ep === 'agents/billing-logs') {
				billingCall++;
				if (billingCall === 1) {
					return Promise.resolve({ items: [billingItem('b1')], total: 40 }) as never;
				}
				if (billingCall === 2) {
					return new Promise((_resolve, reject) => { rejectPage2 = reject; }) as never;
				}
				return new Promise((resolve) => { resolveRetry = resolve; }) as never;
			}
			return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 20 }) as never;
		});

		const view = render(UsageLogTables, {
			props: { billingEndpoint: 'agents/billing-logs', logsEndpoint: 'agents/usage/logs', params: {} },
			global,
		});
		await settle();

		expect(view.container.textContent).toContain('1 / 2');
		const nextBtn = () => view.container.querySelector('button[aria-label="下一页"]') as HTMLButtonElement;
		const sizeBtns = () => [...view.container.querySelectorAll('button')].filter(b => ['10', '20', '50'].includes(b.textContent?.trim() ?? '')) as HTMLButtonElement[];

		await fireEvent.click(nextBtn());
		await nextTick();
		expect(sizeBtns().every(b => b.disabled)).toBe(true);

		rejectPage2(new Error('network down'));
		await settle();

		// Pager stays on page 1 matching the stale page-1 rows, and staleBar offers Retry.
		expect(view.container.textContent).toContain('1 / 2');
		expect(view.container.textContent).toContain('Model-b1');
		expect(view.container.textContent).toContain('刷新失败，当前显示的是上次的数据。');

		const retryBtn = [...view.container.querySelectorAll('button')].find(b => b.textContent?.trim() === '重试')!;
		await fireEvent.click(retryBtn);
		await nextTick();
		expect(api).toHaveBeenLastCalledWith('agents/billing-logs', expect.objectContaining({ page: 2, pageSize: 20 }));

		resolveRetry({ items: [billingItem('b2')], total: 40 });
		await settle();
		expect(view.container.textContent).toContain('2 / 2');
		expect(view.container.textContent).toContain('Model-b2');
	});

	test('renders staleBar on page-2 requests log failure and keeps page 1 in pager', async () => {
		let logsCall = 0;
		api.mockImplementation((ep) => {
			if (ep === 'agents/billing-logs') {
				return Promise.resolve({ items: [], total: 0 }) as never;
			}
			if (ep === 'agents/usage/logs') {
				logsCall++;
				if (logsCall === 1) {
					return Promise.resolve({ items: [logItem('l1')], total: 40, page: 1, pageSize: 20 }) as never;
				}
				return Promise.reject(new Error('logs failed'));
			}
			return Promise.resolve({}) as never;
		});

		const view = render(UsageLogTables, {
			props: { billingEndpoint: 'agents/billing-logs', logsEndpoint: 'agents/usage/logs', params: {} },
			global,
		});
		await settle();

		const reqTab = [...view.container.querySelectorAll('button')].find(b => b.textContent?.includes('请求记录'))!;
		await fireEvent.click(reqTab);
		await settle();
		expect(view.container.textContent).toContain('1 / 2');

		const nextBtn = view.container.querySelector('button[aria-label="下一页"]') as HTMLButtonElement;
		await fireEvent.click(nextBtn);
		await settle();

		expect(view.container.textContent).toContain('1 / 2');
		expect(view.container.textContent).toContain('Model-l1');
		expect(view.container.textContent).toContain('刷新失败，当前显示的是上次的数据。');
	});
});

describe('SiteModelReport & UserTable page/rank sync and loading guards', () => {
	test('keeps rank 1 and page 1 when page-2 users fetch fails, and disables pageSize buttons while loading', async () => {
		window.localStorage.setItem('adminAgentModelReportMode', 'detailed');
		let usersCall = 0;
		let rejectUsersPage2!: (err: Error) => void;

		const metrics = {
			total: 10, success: 10, failed: 0, aborted: 0, pending: 0,
			freeCalls: 0, paidCalls: 10, credits: 1,
			promptTokens: 100, completionTokens: 50, cacheHitTokens: 0,
			avgMs: 100, p50Ms: 100, p95Ms: 100,
		};

		api.mockImplementation((ep) => {
			if (ep === 'admin/agents/reports/users') {
				usersCall++;
				if (usersCall === 1) {
					return Promise.resolve({
						items: [{ userId: 'u1', user: { id: 'u1', username: 'alice', name: 'Alice', host: null }, m: metrics }],
						total: 20,
						page: 1,
						pageSize: 10,
					}) as never;
				}
				return new Promise((_resolve, reject) => { rejectUsersPage2 = reject; }) as never;
			}
			if (ep === 'admin/agents/reports/summary') {
				return Promise.resolve({ since: '', until: '', bucket: 'day', current: metrics, previous: metrics, series: [] }) as never;
			}
			if (ep === 'admin/agents/reports/trend') {
				return Promise.resolve({ buckets: [], bucket: 'day', groups: [], previous: null }) as never;
			}
			if (ep === 'admin/agents/reports/models') {
				return Promise.resolve({ catalog: [], rows: [] }) as never;
			}
			return Promise.resolve({ usageKinds: [], billing: [], errorCodes: [], heatmap: [] }) as never;
		});

		const view = render(SiteModelReport, { global });
		await settle();

		expect(view.container.textContent).toContain('@alice');
		expect(view.container.textContent).toContain('1 / 2');

		const sizeBtns = () => [...view.container.querySelectorAll('button')].filter(b => ['10', '20', '50'].includes(b.textContent?.trim() ?? '')) as HTMLButtonElement[];
		const navBtns = () => [...view.container.querySelectorAll('button')].filter(b => b.querySelector('.ti-chevron-right')) as HTMLButtonElement[];

		await fireEvent.click(navBtns()[0]);
		await nextTick();
		expect(sizeBtns().every(b => b.disabled)).toBe(true);

		rejectUsersPage2(new Error('users page 2 failed'));
		await settle();

		expect(view.container.textContent).toContain('1 / 2');
		expect(view.container.textContent).toContain('刷新失败，当前显示的是上次的数据。');
		// Rank cell remains 1 (not 11) for stale page-1 item.
		const firstCellText = view.container.querySelector('[role="button"] > span')?.textContent?.trim();
		expect(firstCellText).toBe('1');
	});
});

describe('agents-settings-credits & agents-settings-migration pagination', () => {
	test('credits keeps pagerBar visible on empty page > 1 and disables pageSize buttons while loading', () => {
		const emptyPage2 = render(Credits, {
			props: {
				redeemForm: { amount: 1, count: 1, note: '', expiresAt: '' },
				redeemGenerating: false,
				generatedCodes: [],
				redeemLoading: true,
				redeemCodes: [],
				redeemRevoking: false,
				hasNext: false,
				listPage: 2,
				status: 'all',
				query: '',
				pageSize: 20,
				pageInput: '2',
				purchaseUrl: '',
			},
		});
		const nav = emptyPage2.container.querySelector('[role="navigation"]');
		expect(nav).not.toBeNull();
		const sizeBtns = [...emptyPage2.container.querySelectorAll('button')].filter(b => ['10', '20', '50'].includes(b.textContent?.trim() ?? '')) as HTMLButtonElement[];
		expect(sizeBtns).toHaveLength(3);
		expect(sizeBtns.every(b => b.disabled)).toBe(true);
		cleanup();

		const emptyPage1 = render(Credits, {
			props: {
				redeemForm: { amount: 1, count: 1, note: '', expiresAt: '' },
				redeemGenerating: false,
				generatedCodes: [],
				redeemLoading: false,
				redeemCodes: [],
				redeemRevoking: false,
				hasNext: false,
				listPage: 1,
				status: 'all',
				query: '',
				pageSize: 20,
				pageInput: '1',
				purchaseUrl: '',
			},
		});
		expect(emptyPage1.container.querySelector('[role="navigation"]')).toBeNull();
	});

	test('migration hides MkLoading while appending existing rows and respects hasMore instead of % 30', () => {
		const logs = Array.from({ length: 30 }, (_, i) => ({
			id: `m-${i}`,
			createdAt: '2026-11-10T00:00:00.000Z',
			targetUser: { id: `u-${i}`, username: `user${i}` },
			amount: 10,
			requestId: null,
			sourceInfo: 'old-site',
			operator: null,
			status: 'success',
			failReason: null,
		}));

		const exactMultipleDone = render(Migration, {
			props: { keyExists: true, keyGenerating: false, logsLoading: false, logs, hasMore: false },
		});
		expect(exactMultipleDone.container.textContent).not.toContain('加载更多');
		cleanup();

		const loadingMore = render(Migration, {
			props: { keyExists: true, keyGenerating: false, logsLoading: true, logs, hasMore: true },
		});
		expect(loadingMore.container.querySelector('[data-loading]')).toBeNull();
		expect(loadingMore.container.textContent).toContain('user0');
		const loadMoreBtn = [...loadingMore.container.querySelectorAll('button')].find(b => b.textContent?.includes('载入中')) as HTMLButtonElement;
		expect(loadMoreBtn).toBeDefined();
		expect(loadMoreBtn.disabled).toBe(true);
	});
});
