/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import {
	beijingDayStart,
	beijingMonthStart,
	bucketAvailability,
	bucketLabel,
	deltaOf,
	emptyMetrics,
	resolveBucket,
	resolveRange,
	successRate,
} from '@/pages/admin/agents-model-reports/report-utils.js';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

// 2026-11-11 01:30 Beijing = 2026-11-10 17:30 UTC
const NOW = Date.UTC(2026, 10, 10, 17, 30);

describe('agents-model-reports report-utils', () => {
	test('day boundaries follow Beijing time, not UTC', () => {
		expect(new Date(beijingDayStart(NOW)).toISOString()).toBe('2026-11-10T16:00:00.000Z');
		expect(new Date(beijingDayStart(NOW, -1)).toISOString()).toBe('2026-11-09T16:00:00.000Z');
	});

	test('month presets cross year boundaries in Beijing time', () => {
		// 2027-01-01 00:30 Beijing is still 2026-12-31 in UTC
		const newYear = Date.UTC(2026, 11, 31, 16, 30);
		expect(new Date(beijingMonthStart(newYear)).toISOString()).toBe('2026-12-31T16:00:00.000Z');
		const last = resolveRange('lastMonth', newYear);
		expect(new Date(last.since).toISOString()).toBe('2026-11-30T16:00:00.000Z');
		expect(new Date(last.until).toISOString()).toBe('2026-12-31T16:00:00.000Z');
	});

	test('custom range includes both end dates and is clamped to now', () => {
		const r = resolveRange('custom', NOW, '2026-11-01', '2026-11-30');
		expect(new Date(r.since).toISOString()).toBe('2026-10-31T16:00:00.000Z');
		expect(r.until).toBe(NOW);
		const past = resolveRange('custom', NOW, '2026-11-01', '2026-11-02');
		expect(past.until - past.since).toBe(2 * DAY);
	});

	test('invalid custom range falls back to the last 7 Beijing days', () => {
		const r = resolveRange('custom', NOW, '2026-11-09', '2026-11-01');
		expect(r.since).toBe(beijingDayStart(NOW, -6));
		expect(r.until).toBe(NOW);
	});

	test('bucket rules match the backend', () => {
		expect(resolveBucket(DAY, 'auto')).toBe('hour');
		expect(resolveBucket(7 * DAY, 'auto')).toBe('day');
		expect(resolveBucket(7 * DAY, 'hour')).toBe('hour');
		expect(resolveBucket(30 * DAY, 'hour')).toBe('day');
		expect(resolveBucket(90 * DAY, 'week')).toBe('week');
		expect(resolveBucket(7 * DAY, 'week')).toBe('day');
		expect(resolveBucket(200 * DAY, 'auto')).toBe('week');
		expect(bucketAvailability(30 * DAY)).toEqual({ auto: true, hour: false, day: true, week: true });
	});

	test('bucket labels render in Beijing time', () => {
		expect(bucketLabel('2026-11-10T16:00:00.000Z', 'day', false)).toBe('11/11');
		expect(bucketLabel('2026-11-10T17:00:00.000Z', 'hour', true)).toBe('01:00');
		expect(bucketLabel('2026-11-10T17:00:00.000Z', 'hour', false)).toBe('11/11 01:00');
	});

	test('success rate excludes pending calls', () => {
		const m = { ...emptyMetrics(), total: 10, success: 6, failed: 2, pending: 2 };
		expect(successRate(m)).toBe(75);
		expect(successRate({ ...emptyMetrics(), total: 3, pending: 3 })).toBeNull();
	});

	test('success rate delta is in percentage points, counts in percent', () => {
		const cur = { ...emptyMetrics(), total: 100, success: 90 };
		const prev = { ...emptyMetrics(), total: 50, success: 40 };
		expect(deltaOf('successRate', cur, prev)).toEqual({ value: 10, unit: 'pp' });
		expect(deltaOf('total', cur, prev)).toEqual({ value: 100, unit: '%' });
		expect(deltaOf('total', cur, emptyMetrics())).toBeNull();
	});
});
