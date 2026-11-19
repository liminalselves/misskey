/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cacheHitRate, successRate, CATEGORY_LABELS } from './report-utils.js';
import type { BreakdownsData } from './BreakdownPanels.vue';
import type { BucketUnit, CatalogEntry, MetricKey, ReportMetrics } from './report-utils.js';

/**
 * Response shape and CSV layout of the per-user report endpoints (`agents/usage/report` and
 * `admin/users/agent-usage-report`). Pure definitions only; each report component owns its own loading.
 */
export type NamedPage = { items: { id: string; name: string | null; m: ReportMetrics }[]; total: number; page: number; pageSize: number };

export type UserReportRes = BreakdownsData & {
	creditBalance: number;
	since: string;
	until: string;
	bucket: BucketUnit;
	current: ReportMetrics;
	previous: ReportMetrics;
	series: { t: string; m: ReportMetrics }[];
	trend: { buckets: string[]; groups: { key: string; total: number; points: ReportMetrics[] }[]; previous: ReportMetrics[] | null };
	catalog: CatalogEntry[];
	models: { modelId: string; m: ReportMetrics }[];
	characters: NamedPage;
	styles: NamedPage;
};

/** The per-user pages show no "active users" metric. */
export const USER_METRICS: { key: MetricKey; label: string }[] = [
	{ key: 'total', label: '请求' },
	{ key: 'successRate', label: '成功率' },
	{ key: 'credits', label: '扣费' },
	{ key: 'tokens', label: 'Token' },
	{ key: 'latency', label: '耗时' },
];

export function userModelsCsv(models: UserReportRes['models'], catalog: Map<string, CatalogEntry>): { head: string[]; rows: (string | number | null)[][] } {
	const head = ['模型', '分类', '请求', '成功', '失败', '中断', '成功率%', '免费', '付费', '扣费', '输入Token', '输出Token', '缓存命中率%', 'P50ms', 'P95ms'];
	const rows = models.map(r => {
		const entry = catalog.get(r.modelId);
		const m = r.m;
		return [
			entry?.name ?? r.modelId, entry != null ? CATEGORY_LABELS[entry.category] : '',
			m.total, m.success, m.failed, m.aborted, successRate(m)?.toFixed(2) ?? '', m.freeCalls, m.paidCalls, m.credits.toFixed(4),
			m.promptTokens, m.completionTokens, cacheHitRate(m)?.toFixed(2) ?? '',
			m.p50Ms != null ? Math.round(m.p50Ms) : '', m.p95Ms != null ? Math.round(m.p95Ms) : '',
		];
	});
	return { head, rows };
}
