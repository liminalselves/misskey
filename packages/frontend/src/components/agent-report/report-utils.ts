/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** Shared types, Beijing-time range math and formatting for the admin model report. */

export type ReportMetrics = {
	total: number;
	success: number;
	failed: number;
	aborted: number;
	pending: number;
	freeCalls: number;
	paidCalls: number;
	credits: number;
	users: number;
	promptTokens: number;
	completionTokens: number;
	cacheHitTokens: number;
	avgMs: number | null;
	p50Ms: number | null;
	p95Ms: number | null;
};

export type ModelCategory = 'llm' | 'image' | 'vision' | 'byok' | 'unassigned' | 'deleted';
export type ModelState = 'active' | 'unlisted' | 'disabled' | 'deleted';
export type CatalogEntry = { id: string; name: string; category: ModelCategory; state: ModelState };

export type RangePreset = 'today' | 'yesterday' | '24h' | '7d' | '30d' | '90d' | 'thisMonth' | 'lastMonth' | 'custom';
export type BucketChoice = 'auto' | 'hour' | 'day' | 'week';
export type BucketUnit = 'hour' | 'day' | 'week';
export type Breakdown = 'none' | 'status' | 'model' | 'usageKind' | 'billing';
export type MetricKey = 'total' | 'successRate' | 'credits' | 'users' | 'tokens' | 'latency';
export type UserSort = 'credits' | 'total' | 'tokens' | 'failed';

export const USAGE_KINDS = ['chat', 'compression', 'image_generation', 'vision', 'sticker_description', 'proactive_random', 'proactive_scheduled'] as const;
export type UsageKind = typeof USAGE_KINDS[number];

export const BYOK_KEY = '__byok__';
export const UNASSIGNED_KEY = '__unassigned__';
export const OTHER_KEY = '__other__';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const BJ_OFFSET = 8 * HOUR;
/** Matches the backend: hourly buckets only for spans up to 8 days. */
export const MAX_HOURLY_SPAN = 8 * DAY;

export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
	{ key: 'today', label: '今天' },
	{ key: 'yesterday', label: '昨天' },
	{ key: '24h', label: '24 小时' },
	{ key: '7d', label: '7 天' },
	{ key: '30d', label: '30 天' },
	{ key: '90d', label: '90 天' },
	{ key: 'thisMonth', label: '本月' },
	{ key: 'lastMonth', label: '上月' },
	{ key: 'custom', label: '自定义' },
];

export const USAGE_KIND_LABELS: Record<UsageKind, string> & Partial<Record<string, string>> = {
	chat: '对话',
	compression: '压缩',
	image_generation: '生图',
	vision: '识图',
	sticker_description: '贴纸描述',
	proactive_random: '随机主动',
	proactive_scheduled: '定时主动',
};

export const CATEGORY_LABELS: Record<ModelCategory, string> = {
	llm: '对话模型',
	image: '生图模型',
	vision: '识图模型',
	byok: '用户自带',
	unassigned: '未关联',
	deleted: '已删除',
};

export const STATUS_LABELS: Record<string, string> = {
	success: '成功',
	failed: '失败',
	aborted: '中断',
	pending: '处理中',
};

export const BILLING_LABELS: Record<string, string> = {
	paid: '付费',
	free: '免费额度',
	zeroPriced: '零价模型',
	byok: '用户自带',
	failed: '失败未扣费',
	unassigned: '未关联模型',
	pending: '处理中',
};

/** Beijing midnight (as epoch ms) of the Beijing calendar day `offsetDays` from the day containing `now`. */
export function beijingDayStart(now: number, offsetDays = 0): number {
	const bj = new Date(now + BJ_OFFSET);
	return Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate() + offsetDays) - BJ_OFFSET;
}

export function beijingMonthStart(now: number, offsetMonths = 0): number {
	const bj = new Date(now + BJ_OFFSET);
	return Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth() + offsetMonths, 1) - BJ_OFFSET;
}

/** "YYYY-MM-DD" in Beijing time. */
export function beijingDateString(t: number): string {
	return new Date(t + BJ_OFFSET).toISOString().slice(0, 10);
}

/** Parse "YYYY-MM-DD" as Beijing midnight; null on invalid input. */
export function parseBeijingDate(s: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
	if (m == null) return null;
	const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - BJ_OFFSET;
	return Number.isNaN(t) ? null : t;
}

/**
 * Resolve a preset into [since, until). Custom ranges are inclusive of both dates
 * (until = day after `customTo`) and clamped to now.
 */
export function resolveRange(preset: RangePreset, now: number, customFrom?: string, customTo?: string): { since: number; until: number } {
	switch (preset) {
		case 'today': return { since: beijingDayStart(now), until: now };
		case 'yesterday': return { since: beijingDayStart(now, -1), until: beijingDayStart(now) };
		case '24h': return { since: now - DAY, until: now };
		case '7d': return { since: now - 7 * DAY, until: now };
		case '30d': return { since: now - 30 * DAY, until: now };
		case '90d': return { since: now - 90 * DAY, until: now };
		case 'thisMonth': return { since: beijingMonthStart(now), until: now };
		case 'lastMonth': return { since: beijingMonthStart(now, -1), until: beijingMonthStart(now) };
		case 'custom': {
			const from = parseBeijingDate(customFrom ?? '');
			const to = parseBeijingDate(customTo ?? '');
			if (from == null || to == null || to < from) return { since: beijingDayStart(now, -6), until: now };
			return { since: from, until: Math.min(now, to + DAY) };
		}
	}
}

export function bucketAvailability(spanMs: number): Record<BucketChoice, boolean> {
	return { auto: true, hour: spanMs <= MAX_HOURLY_SPAN, day: spanMs > 2 * HOUR, week: spanMs >= 28 * DAY };
}

/** Same rule as the backend's resolveReportBucketUnit. */
export function resolveBucket(spanMs: number, choice: BucketChoice): BucketUnit {
	const auto: BucketUnit = spanMs <= 2 * DAY ? 'hour' : spanMs <= 120 * DAY ? 'day' : 'week';
	if (choice === 'auto' || !bucketAvailability(spanMs)[choice]) return auto;
	return choice;
}

export function bucketLabel(iso: string, unit: BucketUnit, sameDay: boolean): string {
	const bj = new Date(new Date(iso).getTime() + BJ_OFFSET);
	const md = `${bj.getUTCMonth() + 1}/${bj.getUTCDate()}`;
	if (unit === 'hour') {
		const hh = `${bj.getUTCHours().toString().padStart(2, '0')}:00`;
		return sameDay ? hh : `${md} ${hh}`;
	}
	return unit === 'week' ? `${md} 周` : md;
}

export function bucketTitle(iso: string, unit: BucketUnit): string {
	const t = new Date(iso).getTime();
	const d = beijingDateString(t);
	if (unit === 'hour') return `${d} ${new Date(t + BJ_OFFSET).getUTCHours().toString().padStart(2, '0')}:00`;
	if (unit === 'week') return `${d} 起一周`;
	return d;
}

export function allSameBeijingDay(isos: string[]): boolean {
	if (isos.length === 0) return true;
	const first = beijingDateString(new Date(isos[0]).getTime());
	return isos.every(s => beijingDateString(new Date(s).getTime()) === first);
}

// ---------- metrics ----------

/** Success rate excludes pending calls (not yet settled). */
export function successRate(m: ReportMetrics): number | null {
	const settled = m.total - m.pending;
	return settled > 0 ? (m.success / settled) * 100 : null;
}

export function totalTokens(m: ReportMetrics): number {
	return m.promptTokens + m.completionTokens;
}

export function cacheHitRate(m: ReportMetrics): number | null {
	return m.promptTokens > 0 ? (m.cacheHitTokens / m.promptTokens) * 100 : null;
}

export function metricValue(m: ReportMetrics, key: MetricKey): number | null {
	switch (key) {
		case 'total': return m.total;
		case 'successRate': return successRate(m);
		case 'credits': return m.credits;
		case 'users': return m.users;
		case 'tokens': return totalTokens(m);
		case 'latency': return m.p50Ms;
	}
}

/** Whether a metric adds up across groups (stacked bars) or not (lines). */
export function isAdditiveMetric(key: MetricKey): boolean {
	return key === 'total' || key === 'credits' || key === 'tokens';
}

export type Delta = { value: number; unit: '%' | 'pp' } | null;

export function deltaOf(key: MetricKey, cur: ReportMetrics, prev: ReportMetrics): Delta {
	const a = metricValue(cur, key);
	const b = metricValue(prev, key);
	if (a == null || b == null) return null;
	if (key === 'successRate') return { value: a - b, unit: 'pp' };
	if (b <= 0) return null;
	return { value: ((a - b) / b) * 100, unit: '%' };
}

/** 'good' / 'bad' / 'neutral' tone of a delta for a given metric. */
export function deltaTone(key: MetricKey, d: Delta): 'good' | 'bad' | 'neutral' {
	if (d == null || Math.abs(d.value) < 0.05) return 'neutral';
	if (key === 'successRate') return d.value > 0 ? 'good' : 'bad';
	if (key === 'latency') return d.value < 0 ? 'good' : 'bad';
	return 'neutral';
}

export function deltaText(d: Delta): string {
	if (d == null) return '—';
	if (Math.abs(d.value) < 0.05) return `±0.0${d.unit}`;
	return `${d.value > 0 ? '▲' : '▼'} ${Math.abs(d.value).toFixed(1)}${d.unit}`;
}

// ---------- formatting ----------

export function fmtInt(n: number): string {
	if (!Number.isFinite(n)) return '—';
	return Math.round(n).toLocaleString('zh-CN');
}

export function fmtCompact(n: number): string {
	if (!Number.isFinite(n)) return '—';
	const abs = Math.abs(n);
	if (abs >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
	if (abs >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
	return Math.round(n).toLocaleString('zh-CN');
}

export function fmtCredits(n: number): string {
	if (n === 0) return '0';
	return n >= 100 ? n.toFixed(2) : n.toFixed(4);
}

export function fmtPct(v: number | null, digits = 1): string {
	return v == null ? '—' : `${v.toFixed(digits)}%`;
}

export function fmtMs(ms: number | null): string {
	if (ms == null) return '—';
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
}

export function fmtMetric(key: MetricKey, v: number | null): string {
	if (v == null) return '—';
	switch (key) {
		case 'total':
		case 'users': return fmtInt(v);
		case 'successRate': return fmtPct(v);
		case 'credits': return fmtCredits(v);
		case 'tokens': return fmtCompact(v);
		case 'latency': return fmtMs(v);
	}
}

export function share(part: number, whole: number): number | null {
	return whole > 0 ? (part / whole) * 100 : null;
}

// ---------- CSV ----------

export function csvCell(v: string | number | null): string {
	const s = v == null ? '' : String(v);
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(head: string[], rows: (string | number | null)[][]): string {
	return '\uFEFF' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
	const url = URL.createObjectURL(new Blob([text], { type: mime }));
	const a = window.document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

export function emptyMetrics(): ReportMetrics {
	return {
		total: 0, success: 0, failed: 0, aborted: 0, pending: 0, freeCalls: 0, paidCalls: 0, credits: 0, users: 0,
		promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, avgMs: null, p50Ms: null, p95Ms: null,
	};
}
