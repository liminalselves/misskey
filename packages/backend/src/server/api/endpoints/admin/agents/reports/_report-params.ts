/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { AgentModelUsageKind } from '@/models/AgentModelUsageLog.js';
import { reportUsageKinds } from '@/core/AgentModelReportService.js';
import type { ReportFilter, ReportMetrics } from '@/core/AgentModelReportService.js';

/** since/until span cap (one natural year) to keep scans bounded. */
const MAX_WINDOW_MS = 366 * 24 * 60 * 60 * 1000;

/** Filter properties shared by every admin/agents/reports/* endpoint. */
export const reportFilterProperties = {
	// ISO 8601 strings (the validator has no date-time format registered)
	since: { type: 'string' },
	until: { type: 'string' },
	modelIds: { type: 'array', maxItems: 200, uniqueItems: true, items: { type: 'string', maxLength: 64 } },
	usageKinds: { type: 'array', uniqueItems: true, items: { type: 'string', enum: reportUsageKinds } },
} as const;

export const reportMetricsSchema = {
	type: 'object',
	optional: false, nullable: false,
	properties: {
		total: { type: 'integer', optional: false, nullable: false },
		success: { type: 'integer', optional: false, nullable: false },
		failed: { type: 'integer', optional: false, nullable: false },
		aborted: { type: 'integer', optional: false, nullable: false },
		pending: { type: 'integer', optional: false, nullable: false },
		freeCalls: { type: 'integer', optional: false, nullable: false },
		paidCalls: { type: 'integer', optional: false, nullable: false },
		credits: { type: 'number', optional: false, nullable: false },
		users: { type: 'integer', optional: false, nullable: false },
		promptTokens: { type: 'number', optional: false, nullable: false },
		completionTokens: { type: 'number', optional: false, nullable: false },
		cacheHitTokens: { type: 'number', optional: false, nullable: false },
		avgMs: { type: 'number', optional: false, nullable: true },
		p50Ms: { type: 'number', optional: false, nullable: true },
		p95Ms: { type: 'number', optional: false, nullable: true },
	},
} as const;

export function resolveReportFilter(ps: { since?: string; until?: string; modelIds?: string[]; usageKinds?: string[] }): ReportFilter {
	const now = Date.now();
	let until = ps.until != null ? new Date(ps.until) : new Date(now);
	if (Number.isNaN(until.getTime()) || until.getTime() > now) until = new Date(now);
	let since = ps.since != null ? new Date(ps.since) : new Date(until.getTime() - 24 * 60 * 60 * 1000);
	if (Number.isNaN(since.getTime()) || since.getTime() >= until.getTime()) since = new Date(until.getTime() - 24 * 60 * 60 * 1000);
	if (until.getTime() - since.getTime() > MAX_WINDOW_MS) since = new Date(until.getTime() - MAX_WINDOW_MS);
	return {
		since,
		until,
		modelIds: ps.modelIds ?? [],
		usageKinds: (ps.usageKinds ?? []) as AgentModelUsageKind[],
	};
}

/** The equally long window right before `f`, for period-over-period comparison. */
export function previousReportFilter(f: ReportFilter): ReportFilter {
	const span = f.until.getTime() - f.since.getTime();
	return { ...f, since: new Date(f.since.getTime() - span), until: f.since };
}

export type { ReportMetrics };
