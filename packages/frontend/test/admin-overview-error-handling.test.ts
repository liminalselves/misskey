/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import OverviewStats from '@/pages/admin/overview.stats.vue';
import OverviewActiveUsers from '@/pages/admin/overview.active-users.vue';
import OverviewApRequests from '@/pages/admin/overview.ap-requests.vue';
import { misskeyApi, misskeyApiGet } from '@/utility/misskey-api.js';

const { ChartMock } = vi.hoisted(() => ({
	ChartMock: vi.fn(function () {
		return { destroy: vi.fn() };
	}),
}));
vi.mock('chart.js', () => ({ Chart: ChartMock }));
vi.mock('chartjs-plugin-gradient', () => ({ default: {} }));
vi.mock('chromatic', () => ({ default: () => false }));
vi.mock('@/utility/init-chart.js', () => ({ initChart: vi.fn() }));
vi.mock('@/composables/use-chart-tooltip.js', () => ({ useChartTooltip: () => ({ handler: vi.fn() }) }));
vi.mock('@/utility/chart-vline.js', () => ({ chartVLine: () => ({ id: 'vline' }) }));
vi.mock('@/utility/color.js', () => ({ alpha: (c: string) => c }));
vi.mock('@/store.js', () => ({ store: { s: { darkMode: false } } }));
vi.mock('@/custom-emojis.js', () => ({ customEmojis: [] }));
vi.mock('@/components/MkNumber.vue', () => ({ default: { props: ['value'], template: '<span>{{ value }}</span>' } }));
vi.mock('@/components/MkNumberDiff.vue', () => ({ default: { props: ['value'], template: '<span>{{ value }}</span>' } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn(), misskeyApiGet: vi.fn() }));

const api = vi.mocked(misskeyApi);
const apiGet = vi.mocked(misskeyApiGet);

const global = {
	components: {
		MkLoading: { template: '<span data-loading/>' },
		MkError: { template: '<div data-error><button @click="$emit(\'retry\')">Retry</button></div>' },
	},
	directives: {
		tooltip: {},
	},
};

async function settle() {
	await Promise.resolve();
	await nextTick();
	await Promise.resolve();
	await nextTick();
	await nextTick();
}

beforeEach(() => {
	api.mockReset();
	apiGet.mockReset();
	ChartMock.mockClear();
});

afterEach(cleanup);

describe('Admin overview panels error handling (no stuck MkLoading)', () => {
	test('overview.stats.vue exits loading, renders MkError on failure, and recovers on retry', async () => {
		api.mockRejectedValueOnce(new Error('stats failed'));
		apiGet.mockRejectedValueOnce(new Error('online failed'));

		const view = render(OverviewStats, { global });
		await settle();

		expect(view.container.querySelector('[data-loading]')).toBeNull();
		const retryBtn = view.container.querySelector('[data-error] button')!;
		expect(retryBtn).not.toBeNull();

		api.mockResolvedValueOnce({ originalUsersCount: 10, originalNotesCount: 20, instances: 2 } as never);
		apiGet.mockImplementation((ep) => {
			if (ep === 'get-online-users-count') return Promise.resolve({ count: 3 }) as never;
			return Promise.resolve({ local: { total: [0, 0] } }) as never;
		});

		await fireEvent.click(retryBtn);
		await settle();

		expect(view.container.querySelector('[data-loading]')).toBeNull();
		expect(view.container.querySelector('[data-error]')).toBeNull();
		expect(view.container.textContent).toContain('10');
	});

	test('overview.active-users.vue exits loading, renders MkError on failure, and recovers on retry', async () => {
		api.mockRejectedValueOnce(new Error('active-users failed'));

		const view = render(OverviewActiveUsers, { global });
		await settle();

		expect(view.container.querySelector('[data-loading]')).toBeNull();
		const retryBtn = view.container.querySelector('[data-error] button')!;
		expect(retryBtn).not.toBeNull();

		api.mockResolvedValueOnce({ read: [1, 2], write: [1, 1] } as never);
		await fireEvent.click(retryBtn);
		await settle();

		expect(view.container.querySelector('[data-loading]')).toBeNull();
		expect(view.container.querySelector('[data-error]')).toBeNull();
		expect(ChartMock).toHaveBeenCalledTimes(1);
	});

	test('overview.ap-requests.vue exits loading, renders MkError on failure, and recovers on retry', async () => {
		api.mockRejectedValueOnce(new Error('ap-request failed'));

		const view = render(OverviewApRequests, { global });
		await settle();

		expect(view.container.querySelector('[data-loading]')).toBeNull();
		const retryBtn = view.container.querySelector('[data-error] button')!;
		expect(retryBtn).not.toBeNull();

		api.mockResolvedValueOnce({ deliverSucceeded: [1], deliverFailed: [0], inboxReceived: [2] } as never);
		await fireEvent.click(retryBtn);
		await settle();

		expect(view.container.querySelector('[data-loading]')).toBeNull();
		expect(view.container.querySelector('[data-error]')).toBeNull();
		expect(ChartMock).toHaveBeenCalledTimes(2);
	});
});
