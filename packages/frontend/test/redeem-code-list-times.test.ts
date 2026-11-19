/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import Credits from '@/pages/admin/agents-settings-credits.vue';
import type { RedeemCodeRow } from '@/pages/admin/agents-settings-credits.vue';

vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: vi.fn() }));
vi.mock('@/components/MkFolder.vue', () => ({ default: { template: '<section><slot/></section>' } }));
vi.mock('@/components/MkInput.vue', () => ({ default: { template: '<input/>' } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkSelect.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkLoading.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkUserName.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkAcct.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { template: '<a><slot/></a>' } }));
vi.mock('@/components/form/split.vue', () => ({ default: { template: '<div><slot/></div>' } }));

afterEach(cleanup);

function row(id: string, patch: Partial<RedeemCodeRow>): RedeemCodeRow {
	return {
		id,
		createdAt: '2026-10-06T10:35:32.000Z',
		code: id.toUpperCase(),
		creditAmount: 5000,
		note: '',
		expiresAt: null,
		redeemedAt: null,
		redeemedBy: null,
		revoked: false,
		status: 'available',
		...patch,
	};
}

function mountList(redeemCodes: RedeemCodeRow[]) {
	return render(Credits, {
		props: {
			redeemForm: { amount: 1, count: 1, note: '', expiresAt: '' },
			redeemGenerating: false,
			generatedCodes: [],
			redeemLoading: false,
			redeemCodes,
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
}

function eventTimes(container: Element): (string | undefined)[] {
	return [...container.querySelectorAll('[data-testid="redeem-event-at"]')].map(el => el.textContent?.trim());
}

describe('redeem code list: redeemed / expired time column', () => {
	test('shows the time that explains each row state, in Beijing time', () => {
		const { container } = mountList([
			// Redeemed rows show when they were redeemed even if an expiry was also set.
			row('redeemed', { status: 'redeemed', redeemedAt: '2026-10-07T04:05:06.000Z', expiresAt: '2026-12-31T15:59:59.000Z' }),
			row('expired', { status: 'expired', expiresAt: '2026-10-01T07:08:09.000Z' }),
			// A live code with a deadline must not look like "never expires".
			row('live-deadline', { status: 'available', expiresAt: '2026-12-31T15:59:59.000Z' }),
			row('live-forever', { status: 'available' }),
			// Revoked rows have no recorded revoke time, so the stale expiry must not leak in.
			row('revoked', { status: 'revoked', revoked: true, expiresAt: '2026-10-01T07:08:09.000Z' }),
		]);

		expect(eventTimes(container)).toEqual([
			'2026/10/7 12:05:06',
			'2026/10/1 15:08:09',
			'有效期至 2026/12/31 23:59:59',
			'—',
			'—',
		]);
	});

	test('adds the column header next to the status column', () => {
		const { container } = mountList([row('redeemed', { status: 'redeemed', redeemedAt: '2026-10-07T04:05:06.000Z' })]);

		expect(container.textContent).toContain('兑换 / 过期时间');
		const cell = container.querySelector('[data-testid="redeem-event-at"]')!;
		// Status chip sits right before its time, so the pair reads as "state, when".
		expect(cell.previousElementSibling?.getAttribute('style')).toContain('color');
	});
});
