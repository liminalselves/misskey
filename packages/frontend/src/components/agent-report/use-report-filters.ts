/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, reactive, ref, watch } from 'vue';
import {
	beijingDateString, beijingDayStart, bucketAvailability, resolveBucket, resolveRange,
	RANGE_PRESETS, USAGE_KINDS, USAGE_KIND_LABELS,
} from './report-utils.js';
import type { Breakdown, BucketChoice, BucketUnit, RangePreset, UsageKind } from './report-utils.js';

/** Filter state shared by the site-wide model report and the per-user usage reports. */
export type ReportFilters = {
	range: RangePreset;
	customFrom: string;
	customTo: string;
	bucket: BucketChoice;
	modelIds: string[];
	usageKinds: UsageKind[];
	compare: boolean;
	breakdown: Breakdown;
};

export const BUCKET_CHOICES: { key: BucketChoice; label: string }[] = [
	{ key: 'auto', label: '自动' },
	{ key: 'hour', label: '时' },
	{ key: 'day', label: '日' },
	{ key: 'week', label: '周' },
];

export const BREAKDOWNS: { key: Breakdown; label: string }[] = [
	{ key: 'none', label: '不分组' },
	{ key: 'status', label: '状态' },
	{ key: 'model', label: '模型' },
	{ key: 'usageKind', label: '用途' },
	{ key: 'billing', label: '计费' },
];

const BUCKET_UNIT_LABELS: Record<BucketUnit, string> = { hour: '小时', day: '天', week: '周' };

function defaults(range: RangePreset): ReportFilters {
	const now = Date.now();
	return {
		range,
		customFrom: beijingDateString(beijingDayStart(now, -6)),
		customTo: beijingDateString(now),
		bucket: 'auto',
		modelIds: [],
		usageKinds: [],
		compare: false,
		breakdown: 'none',
	};
}

function restore(key: string, base: ReportFilters): ReportFilters {
	try {
		const raw = window.localStorage.getItem(key);
		if (raw == null) return base;
		const saved = JSON.parse(raw) as Partial<ReportFilters>;
		const pick = <T>(v: T | undefined, ok: boolean, fallback: T): T => (ok && v !== undefined ? v : fallback);
		return {
			range: pick(saved.range, RANGE_PRESETS.some(r => r.key === saved.range), base.range),
			customFrom: typeof saved.customFrom === 'string' ? saved.customFrom : base.customFrom,
			customTo: typeof saved.customTo === 'string' ? saved.customTo : base.customTo,
			bucket: pick(saved.bucket, BUCKET_CHOICES.some(b => b.key === saved.bucket), base.bucket),
			modelIds: Array.isArray(saved.modelIds) ? saved.modelIds.filter((x): x is string => typeof x === 'string') : [],
			usageKinds: Array.isArray(saved.usageKinds) ? saved.usageKinds.filter((x): x is UsageKind => (USAGE_KINDS as readonly string[]).includes(x)) : [],
			compare: saved.compare === true,
			breakdown: pick(saved.breakdown, BREAKDOWNS.some(b => b.key === saved.breakdown), base.breakdown),
		};
	} catch {
		return base;
	}
}

/**
 * Persisted filters plus the derived window. The window is resolved once per apply and "now" is
 * floored to the minute, so every section of one load queries the same [since, until) and repeat
 * loads within a minute hit the server cache. Restore runs synchronously in setup, before callers
 * register their watchers.
 */
export function useReportFilters(opts: { storageKey: string; collapseKey: string; defaultRange: RangePreset; modelName: (id: string) => string }) {
	const filters = reactive<ReportFilters>(restore(opts.storageKey, defaults(opts.defaultRange)));

	watch(() => JSON.stringify(filters), () => {
		try {
			window.localStorage.setItem(opts.storageKey, JSON.stringify(filters));
		} catch { /* storage full or disabled */ }
	});

	// Phones start collapsed so the sticky bar is a single line; the choice is remembered afterwards.
	const collapsed = ref((() => {
		try {
			const v = window.localStorage.getItem(opts.collapseKey);
			if (v != null) return v === '1';
		} catch { /* storage disabled */ }
		return window.matchMedia('(max-width: 600px)').matches;
	})());
	watch(collapsed, v => {
		try {
			window.localStorage.setItem(opts.collapseKey, v ? '1' : '0');
		} catch { /* storage disabled */ }
	});

	function currentWindow() {
		return resolveRange(filters.range, Math.floor(Date.now() / 60_000) * 60_000, filters.customFrom, filters.customTo);
	}

	const windowRange = ref(currentWindow());

	function refreshWindow() {
		windowRange.value = currentWindow();
	}

	const span = computed(() => windowRange.value.until - windowRange.value.since);
	const bucketAvail = computed(() => bucketAvailability(span.value));
	const bucketUnit = computed<BucketUnit>(() => resolveBucket(span.value, filters.bucket));

	// If the range no longer allows the chosen granularity, fall back to auto.
	watch(bucketAvail, a => {
		if (!a[filters.bucket]) filters.bucket = 'auto';
	});

	const activeCount = computed(() => {
		const d = defaults(opts.defaultRange);
		return (filters.range !== d.range ? 1 : 0)
			+ (filters.bucket !== d.bucket ? 1 : 0)
			+ (filters.modelIds.length > 0 ? 1 : 0)
			+ (filters.usageKinds.length > 0 ? 1 : 0)
			+ (filters.compare ? 1 : 0);
	});

	function reset() {
		const d = defaults(opts.defaultRange);
		Object.assign(filters, { ...d, breakdown: filters.breakdown });
	}

	function params(): Record<string, unknown> {
		return {
			since: new Date(windowRange.value.since).toISOString(),
			until: new Date(windowRange.value.until).toISOString(),
			modelIds: filters.modelIds,
			usageKinds: filters.usageKinds,
		};
	}

	const summary = computed(() => {
		const parts: string[] = [];
		const range = RANGE_PRESETS.find(r => r.key === filters.range)?.label ?? '';
		parts.push(filters.range === 'custom' ? `${filters.customFrom} 至 ${filters.customTo}` : range);
		parts.push(`按${BUCKET_UNIT_LABELS[bucketUnit.value]}`);
		parts.push(filters.modelIds.length === 0 ? '全部模型' : (filters.modelIds.length === 1 ? opts.modelName(filters.modelIds[0]) : `${filters.modelIds.length} 个模型`));
		if (filters.usageKinds.length > 0) parts.push(filters.usageKinds.map(k => USAGE_KIND_LABELS[k]).join('/'));
		if (filters.compare) parts.push('对比上一周期');
		return parts.join(' · ');
	});

	const rangeText = computed(() => {
		const fmt = (t: number) => {
			const d = new Date(t + 8 * 3600_000).toISOString();
			return `${d.slice(0, 10)} ${d.slice(11, 16)}`;
		};
		const days = span.value / 86400_000;
		const len = days >= 1 ? `${days.toFixed(days % 1 === 0 ? 0 : 1)} 天` : `${Math.round(span.value / 3600_000)} 小时`;
		return `北京时间 ${fmt(windowRange.value.since)} — ${fmt(windowRange.value.until)} · 共 ${len} · 按${BUCKET_UNIT_LABELS[bucketUnit.value]}`;
	});

	function toggleModel(id: string) {
		filters.modelIds = filters.modelIds.includes(id) ? filters.modelIds.filter(x => x !== id) : [...filters.modelIds, id];
	}

	function toggleUsageKind(k: UsageKind) {
		filters.usageKinds = filters.usageKinds.includes(k) ? filters.usageKinds.filter(x => x !== k) : [...filters.usageKinds, k];
	}

	/** Watch sources that change the data window (range, models, usage kinds). */
	const windowKey = () => [filters.range, filters.customFrom, filters.customTo, filters.modelIds.join(','), filters.usageKinds.join(',')];

	return {
		filters, collapsed, windowRange, refreshWindow, bucketAvail, bucketUnit, activeCount, reset, params,
		summary, rangeText, toggleModel, toggleUsageKind, windowKey,
	};
}

export type ReportFiltersState = ReturnType<typeof useReportFilters>;

/** 350ms debounce shared by filter watchers. */
export function useDebouncedApply() {
	let timer: number | null = null;

	function schedule(fn: () => void) {
		if (timer != null) window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			timer = null;
			fn();
		}, 350);
	}

	function cancel() {
		if (timer != null) window.clearTimeout(timer);
		timer = null;
	}

	return { schedule, cancel };
}
