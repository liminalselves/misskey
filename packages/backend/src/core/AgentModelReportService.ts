/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import type { MiMeta } from '@/models/Meta.js';
import { agentModelUsageKinds } from '@/models/AgentModelUsageLog.js';
import type { AgentModelUsageKind } from '@/models/AgentModelUsageLog.js';
import { AGENT_USER_MODEL_ID_PREFIX } from '@/core/AgentUserModelService.js';
import { nonModelUsageKinds } from '@/core/AgentModelUsageService.js';
import { getEffectiveLlmModels } from '@/misc/agent-llm-models.js';
import { getEffectiveImageModels } from '@/misc/agent-image-models.js';

/** Pseudo model keys: all BYOK models merged, and logs without a resolved model. */
export const REPORT_BYOK_MODEL_KEY = '__byok__';
export const REPORT_UNASSIGNED_MODEL_KEY = '__unassigned__';
export const REPORT_OTHER_GROUP_KEY = '__other__';

/** Model-call usage kinds; credit flows (checkin/rewards/migration) are never part of model reports. */
export const reportUsageKinds = agentModelUsageKinds.filter(k => !nonModelUsageKinds.includes(k));

export type ReportBucketUnit = 'hour' | 'day' | 'week';
export type ReportBreakdown = 'none' | 'status' | 'model' | 'usageKind' | 'billing';
export type ReportUserSort = 'credits' | 'total' | 'tokens' | 'failed';

export type ReportFilter = {
	since: Date;
	until: Date;
	/** Model keys (configured ids or the pseudo keys); empty = all models. */
	modelIds?: string[];
	/** Subset of reportUsageKinds; empty = all model-call kinds. */
	usageKinds?: AgentModelUsageKind[];
};

/** One metric set; every report table, card and chart uses exactly these definitions. */
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
	/** Latency is measured over successful calls only. */
	avgMs: number | null;
	p50Ms: number | null;
	p95Ms: number | null;
};

export type ReportModelCategory = 'llm' | 'image' | 'vision' | 'byok' | 'unassigned' | 'deleted';
export type ReportModelState = 'active' | 'unlisted' | 'disabled' | 'deleted';

export type ReportModelCatalogEntry = {
	id: string;
	name: string;
	category: ReportModelCategory;
	state: ReportModelState;
};

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Hourly buckets are only allowed for short windows (a week plus slack for custom ranges). */
export const REPORT_MAX_HOURLY_SPAN_MS = 8 * DAY_MS;

const METRICS_SQL = `
	COUNT(*)::int AS "total",
	COUNT(*) FILTER (WHERE "status" = 'success')::int AS "success",
	COUNT(*) FILTER (WHERE "status" = 'failed')::int AS "failed",
	COUNT(*) FILTER (WHERE "status" = 'aborted')::int AS "aborted",
	COUNT(*) FILTER (WHERE "status" = 'pending')::int AS "pending",
	COUNT(*) FILTER (WHERE "usedFreeQuota" = TRUE)::int AS "freeCalls",
	COUNT(*) FILTER (WHERE "cost" > 0)::int AS "paidCalls",
	COALESCE(SUM("cost") FILTER (WHERE "cost" > 0), 0)::float8 AS "credits",
	COUNT(DISTINCT "userId")::int AS "users",
	COALESCE(SUM("promptTokens"), 0)::float8 AS "promptTokens",
	COALESCE(SUM("completionTokens"), 0)::float8 AS "completionTokens",
	COALESCE(SUM("promptCacheHitTokens"), 0)::float8 AS "cacheHitTokens",
	(AVG("durationMs") FILTER (WHERE "status" = 'success'))::float8 AS "avgMs",
	(percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs") FILTER (WHERE "status" = 'success' AND "durationMs" IS NOT NULL))::float8 AS "p50Ms",
	(percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs") FILTER (WHERE "status" = 'success' AND "durationMs" IS NOT NULL))::float8 AS "p95Ms"`;

const MODEL_KEY_SQL = `CASE WHEN "modelId" IS NULL THEN '${REPORT_UNASSIGNED_MODEL_KEY}' WHEN "modelId" LIKE '${AGENT_USER_MODEL_ID_PREFIX}%' THEN '${REPORT_BYOK_MODEL_KEY}' ELSE "modelId" END`;

/** Mutually exclusive billing categories (pending calls fall into "pending"). */
const BILLING_KEY_SQL = `CASE
	WHEN "cost" > 0 THEN 'paid'
	WHEN "usedFreeQuota" = TRUE THEN 'free'
	WHEN "status" = 'failed' THEN 'failed'
	WHEN "status" = 'pending' THEN 'pending'
	WHEN "modelId" LIKE '${AGENT_USER_MODEL_ID_PREFIX}%' THEN 'byok'
	WHEN "modelId" IS NULL THEN 'unassigned'
	ELSE 'zeroPriced' END`;

type RawMetrics = Record<keyof ReportMetrics, number | string | null>;

function toMetrics(r: RawMetrics | undefined): ReportMetrics {
	const n = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
	const nn = (v: number | string | null | undefined) => (v == null ? null : Number(v));
	return {
		total: n(r?.total),
		success: n(r?.success),
		failed: n(r?.failed),
		aborted: n(r?.aborted),
		pending: n(r?.pending),
		freeCalls: n(r?.freeCalls),
		paidCalls: n(r?.paidCalls),
		credits: n(r?.credits),
		users: n(r?.users),
		promptTokens: n(r?.promptTokens),
		completionTokens: n(r?.completionTokens),
		cacheHitTokens: n(r?.cacheHitTokens),
		avgMs: nn(r?.avgMs),
		p50Ms: nn(r?.p50Ms),
		p95Ms: nn(r?.p95Ms),
	};
}

export function emptyReportMetrics(): ReportMetrics {
	return toMetrics(undefined);
}

/** Start of the Beijing-time bucket containing `t` (Asia/Shanghai has no DST, a fixed offset is exact). */
export function alignReportBucket(t: number, unit: ReportBucketUnit): number {
	if (unit === 'hour') return Math.floor(t / HOUR_MS) * HOUR_MS;
	const local = new Date(t + BEIJING_OFFSET_MS);
	let dayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
	if (unit === 'week') dayStart -= ((local.getUTCDay() + 6) % 7) * DAY_MS;
	return dayStart - BEIJING_OFFSET_MS;
}

/** Every bucket start overlapping [since, until), so charts get explicit zero buckets. */
export function listReportBuckets(since: Date, until: Date, unit: ReportBucketUnit): number[] {
	const step = unit === 'hour' ? HOUR_MS : unit === 'day' ? DAY_MS : 7 * DAY_MS;
	const out: number[] = [];
	for (let t = alignReportBucket(since.getTime(), unit); t < until.getTime(); t += step) out.push(t);
	return out;
}

export function resolveReportBucketUnit(since: Date, until: Date, requested: ReportBucketUnit | 'auto' | undefined): ReportBucketUnit {
	const span = until.getTime() - since.getTime();
	const auto: ReportBucketUnit = span <= 2 * DAY_MS ? 'hour' : span <= 120 * DAY_MS ? 'day' : 'week';
	if (requested == null || requested === 'auto') return auto;
	if (requested === 'hour' && span > REPORT_MAX_HOURLY_SPAN_MS) return 'day';
	return requested;
}

class SqlParams {
	public readonly values: unknown[] = [];

	public add(value: unknown): string {
		this.values.push(value);
		return `$${this.values.length}`;
	}
}

/**
 * Admin model-usage reports. All aggregates share one WHERE builder and one metric
 * definition, so cards, charts and tables of the same filter always agree.
 */
@Injectable()
export class AgentModelReportService {
	constructor(
		@Inject(DI.db)
		private db: DataSource,
	) {}

	private where(p: SqlParams, f: ReportFilter, opts: { ignoreModels?: boolean } = {}): string {
		const parts = [
			`"requestedAt" >= ${p.add(f.since)}`,
			`"requestedAt" < ${p.add(f.until)}`,
		];
		const kinds = f.usageKinds != null && f.usageKinds.length > 0 ? f.usageKinds : reportUsageKinds;
		parts.push(`"usageKind" IN (${kinds.map(k => p.add(k)).join(', ')})`);
		if (opts.ignoreModels !== true && f.modelIds != null && f.modelIds.length > 0) {
			const ors: string[] = [];
			const plain = f.modelIds.filter(id => id !== REPORT_BYOK_MODEL_KEY && id !== REPORT_UNASSIGNED_MODEL_KEY);
			if (plain.length > 0) ors.push(`"modelId" IN (${plain.map(id => p.add(id)).join(', ')})`);
			if (f.modelIds.includes(REPORT_BYOK_MODEL_KEY)) ors.push(`"modelId" LIKE '${AGENT_USER_MODEL_ID_PREFIX}%'`);
			if (f.modelIds.includes(REPORT_UNASSIGNED_MODEL_KEY)) ors.push('"modelId" IS NULL');
			parts.push(`(${ors.join(' OR ')})`);
		}
		return parts.join(' AND ');
	}

	/** Truncate in Beijing time explicitly; date_trunc on timestamptz would use the session time zone. */
	private bucketSql(unit: ReportBucketUnit): string {
		return `(date_trunc('${unit}', "requestedAt" AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')`;
	}

	@bindThis
	public async metrics(f: ReportFilter): Promise<ReportMetrics> {
		const p = new SqlParams();
		const rows = await this.db.query<RawMetrics[]>(`SELECT ${METRICS_SQL} FROM "agent_model_usage_log" WHERE ${this.where(p, f)}`, p.values);
		return toMetrics(rows[0]);
	}

	/** Zero-filled time series for one group (breakdown none). */
	@bindThis
	public async series(f: ReportFilter, unit: ReportBucketUnit): Promise<Array<{ t: string; m: ReportMetrics }>> {
		const grouped = await this.groupedSeries(f, unit, '\'all\'');
		const byT = grouped.get('all') ?? new Map<number, ReportMetrics>();
		return listReportBuckets(f.since, f.until, unit).map(t => ({ t: new Date(t).toISOString(), m: byT.get(t) ?? emptyReportMetrics() }));
	}

	/** `buildKey` may bind its own parameters; it runs after the WHERE clause has bound its own. */
	private async groupedSeries(f: ReportFilter, unit: ReportBucketUnit, staticKeySql: string, buildKey?: (p: SqlParams) => string): Promise<Map<string, Map<number, ReportMetrics>>> {
		const p = new SqlParams();
		const where = this.where(p, f);
		const keySql = buildKey != null ? buildKey(p) : staticKeySql;
		const rows = await this.db.query<Array<RawMetrics & { bucket: Date; key: string }>>(
			`SELECT ${this.bucketSql(unit)} AS "bucket", ${keySql} AS "key", ${METRICS_SQL}
			FROM "agent_model_usage_log" WHERE ${where}
			GROUP BY 1, 2`, p.values);
		const out = new Map<string, Map<number, ReportMetrics>>();
		for (const r of rows) {
			const key = String(r.key);
			let m = out.get(key);
			if (m == null) out.set(key, m = new Map());
			m.set(new Date(r.bucket).getTime(), toMetrics(r));
		}
		return out;
	}

	/**
	 * Trend grouped by a dimension. Model breakdown keeps the top 8 model keys by request
	 * count and folds the rest into one "__other__" group computed in SQL (so distinct users
	 * and percentiles stay exact instead of being summed).
	 */
	@bindThis
	public async trend(f: ReportFilter, unit: ReportBucketUnit, breakdown: ReportBreakdown): Promise<{
		buckets: string[];
		groups: Array<{ key: string; total: number; points: ReportMetrics[] }>;
	}> {
		let grouped: Map<string, Map<number, ReportMetrics>>;
		switch (breakdown) {
			case 'none':
				grouped = await this.groupedSeries(f, unit, '\'all\'');
				break;
			case 'status':
				grouped = await this.groupedSeries(f, unit, '"status"');
				break;
			case 'usageKind':
				grouped = await this.groupedSeries(f, unit, '"usageKind"');
				break;
			case 'billing':
				grouped = await this.groupedSeries(f, unit, BILLING_KEY_SQL);
				break;
			case 'model': {
				const p = new SqlParams();
				const top = await this.db.query<Array<{ key: string }>>(
					`SELECT ${MODEL_KEY_SQL} AS "key" FROM "agent_model_usage_log" WHERE ${this.where(p, f)}
					GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 10`, p.values);
				const keys = top.map(r => String(r.key));
				// Up to 9 models are shown as-is; beyond that the top 8 plus "other".
				const shown = keys.length <= 9 ? keys : keys.slice(0, 8);
				grouped = await this.groupedSeries(f, unit, '', q => {
					const list = shown.length > 0 ? shown.map(k => q.add(k)).join(', ') : 'NULL';
					return `CASE WHEN (${MODEL_KEY_SQL}) IN (${list}) THEN (${MODEL_KEY_SQL}) ELSE '${REPORT_OTHER_GROUP_KEY}' END`;
				});
				break;
			}
		}
		const starts = listReportBuckets(f.since, f.until, unit);
		const groups = [...grouped.entries()].map(([key, byT]) => {
			const points = starts.map(t => byT.get(t) ?? emptyReportMetrics());
			return { key, total: points.reduce((s, m) => s + m.total, 0), points };
		}).sort((a, b) => (a.key === REPORT_OTHER_GROUP_KEY ? 1 : b.key === REPORT_OTHER_GROUP_KEY ? -1 : b.total - a.total));
		return { buckets: starts.map(t => new Date(t).toISOString()), groups };
	}

	/** Per-model rows. Model selection is ignored so the table can show every model for comparison. */
	@bindThis
	public async byModel(f: ReportFilter): Promise<Array<{ modelId: string; m: ReportMetrics }>> {
		const p = new SqlParams();
		const rows = await this.db.query<Array<RawMetrics & { key: string }>>(
			`SELECT ${MODEL_KEY_SQL} AS "key", ${METRICS_SQL}
			FROM "agent_model_usage_log" WHERE ${this.where(p, f, { ignoreModels: true })}
			GROUP BY 1 ORDER BY 2 DESC`, p.values);
		return rows.map(r => ({ modelId: String(r.key), m: toMetrics(r) }));
	}

	@bindThis
	public async byUsageKind(f: ReportFilter): Promise<Array<{ usageKind: string; m: ReportMetrics }>> {
		const p = new SqlParams();
		const rows = await this.db.query<Array<RawMetrics & { key: string }>>(
			`SELECT "usageKind" AS "key", ${METRICS_SQL}
			FROM "agent_model_usage_log" WHERE ${this.where(p, f)}
			GROUP BY 1`, p.values);
		return rows.map(r => ({ usageKind: String(r.key), m: toMetrics(r) })).sort((a, b) => b.m.total - a.m.total);
	}

	@bindThis
	public async billing(f: ReportFilter): Promise<Array<{ category: string; count: number; credits: number }>> {
		const p = new SqlParams();
		const rows = await this.db.query<Array<{ key: string; count: number; credits: number | string }>>(
			`SELECT ${BILLING_KEY_SQL} AS "key", COUNT(*)::int AS "count", COALESCE(SUM("cost"), 0)::float8 AS "credits"
			FROM "agent_model_usage_log" WHERE ${this.where(p, f)}
			GROUP BY 1`, p.values);
		return rows.map(r => ({ category: String(r.key), count: Number(r.count) || 0, credits: Number(r.credits) || 0 }))
			.sort((a, b) => b.count - a.count);
	}

	@bindThis
	public async errorCodes(f: ReportFilter, limit = 10): Promise<Array<{ errorCode: string; count: number; models: number; users: number; lastAt: string }>> {
		const p = new SqlParams();
		const rows = await this.db.query<Array<{ code: string; count: number; models: number; users: number; lastAt: Date }>>(
			`SELECT COALESCE("errorCode", 'UNKNOWN') AS "code", COUNT(*)::int AS "count",
				COUNT(DISTINCT ${MODEL_KEY_SQL})::int AS "models", COUNT(DISTINCT "userId")::int AS "users",
				MAX("requestedAt") AS "lastAt"
			FROM "agent_model_usage_log" WHERE ${this.where(p, f)} AND "status" = 'failed'
			GROUP BY 1 ORDER BY 2 DESC LIMIT ${p.add(limit)}`, p.values);
		return rows.map(r => ({
			errorCode: String(r.code),
			count: Number(r.count) || 0,
			models: Number(r.models) || 0,
			users: Number(r.users) || 0,
			lastAt: new Date(r.lastAt).toISOString(),
		}));
	}

	/** Requests by Beijing-time ISO weekday (1=Mon) × hour. */
	@bindThis
	public async heatmap(f: ReportFilter): Promise<Array<{ dow: number; hour: number; count: number }>> {
		const p = new SqlParams();
		const rows = await this.db.query<Array<{ dow: number; hour: number; count: number }>>(
			`SELECT EXTRACT(ISODOW FROM ("requestedAt" AT TIME ZONE 'Asia/Shanghai'))::int AS "dow",
				EXTRACT(HOUR FROM ("requestedAt" AT TIME ZONE 'Asia/Shanghai'))::int AS "hour",
				COUNT(*)::int AS "count"
			FROM "agent_model_usage_log" WHERE ${this.where(p, f)}
			GROUP BY 1, 2`, p.values);
		return rows.map(r => ({ dow: Number(r.dow), hour: Number(r.hour), count: Number(r.count) || 0 }));
	}

	@bindThis
	public async users(f: ReportFilter, sort: ReportUserSort, offset: number, limit: number): Promise<{
		total: number;
		rows: Array<{ userId: string; m: ReportMetrics }>;
	}> {
		// Output aliases are only usable as bare names in ORDER BY; inside an expression
		// "promptTokens" would resolve to the ungrouped source column, so aggregate explicitly.
		const order = {
			credits: '"credits" DESC, "total" DESC',
			total: '"total" DESC, "credits" DESC',
			tokens: 'SUM(COALESCE("promptTokens", 0) + COALESCE("completionTokens", 0)) DESC, "total" DESC',
			failed: '"failed" DESC, "total" DESC',
		}[sort];
		const p = new SqlParams();
		const where = this.where(p, f);
		const countParams = [...p.values];
		const limitP = p.add(limit);
		const offsetP = p.add(offset);
		const [rows, count] = await Promise.all([
			this.db.query<Array<RawMetrics & { userId: string }>>(
				`SELECT "userId", ${METRICS_SQL}
				FROM "agent_model_usage_log" WHERE ${where}
				GROUP BY "userId" ORDER BY ${order}, "userId" LIMIT ${limitP} OFFSET ${offsetP}`, p.values),
			this.db.query<Array<{ cnt: number }>>(
				`SELECT COUNT(DISTINCT "userId")::int AS "cnt" FROM "agent_model_usage_log" WHERE ${where}`, countParams),
		]);
		return { total: Number(count[0]?.cnt) || 0, rows: rows.map(r => ({ userId: r.userId, m: toMetrics(r) })) };
	}

	/**
	 * Model catalog for the picker and table labels: every configured model regardless of
	 * the time window, the two pseudo groups, and any historical id seen in `seenIds`.
	 */
	@bindThis
	public catalog(instance: MiMeta, seenIds: Iterable<string>): ReportModelCatalogEntry[] {
		const out: ReportModelCatalogEntry[] = [];
		const known = new Set<string>();
		const push = (e: ReportModelCatalogEntry) => {
			if (known.has(e.id)) return;
			known.add(e.id);
			out.push(e);
		};
		for (const m of getEffectiveLlmModels(instance)) {
			push({ id: m.id, name: m.name || m.apiModelName || m.id, category: 'llm', state: m.unlisted ? 'unlisted' : 'active' });
		}
		for (const m of getEffectiveImageModels(instance, true)) {
			push({ id: m.id, name: m.name || (m.apiModelName ?? '') || m.id, category: 'image', state: m.enabled === false ? 'disabled' : 'active' });
		}
		for (const m of instance.agentVisionModels) {
			push({ id: m.id, name: m.name.trim() || m.apiModelName || m.id, category: 'vision', state: m.enabled === false ? 'disabled' : 'active' });
		}
		push({ id: REPORT_BYOK_MODEL_KEY, name: '用户自带模型', category: 'byok', state: 'active' });
		push({ id: REPORT_UNASSIGNED_MODEL_KEY, name: '未关联模型', category: 'unassigned', state: 'active' });
		for (const id of seenIds) {
			push({ id, name: id, category: 'deleted', state: 'deleted' });
		}
		return out;
	}
}
