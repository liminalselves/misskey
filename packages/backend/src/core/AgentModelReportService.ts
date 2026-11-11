/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as Redis from 'ioredis';
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
	/** Restrict to one user (per-user usage pages); the (userId, requestedAt) index serves it. */
	userId?: string;
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

/** Report results are cached briefly; the client minute-aligns windows so repeated loads share keys. */
const CACHE_TTL_SEC = 60;
/** Windows that ended more than a minute ago no longer change; cache them longer. */
const CLOSED_WINDOW_CACHE_TTL_SEC = 600;
/** Report statements allowed at once per process, so a report load never takes over the DB pool. */
const MAX_CONCURRENT_QUERIES = 2;

/** Monday 00:00 Beijing time. date_bin from this origin equals date_trunc in Asia/Shanghai for hour/day/week. */
const BUCKET_ORIGIN = '2000-01-03T00:00:00+08:00';

/** Cheap additive columns. avgMs is still success-only, like the percentiles. */
const BASE_METRICS_SQL = `
	COUNT(*)::int AS "total",
	COUNT(*) FILTER (WHERE "status" = 'success')::int AS "success",
	COUNT(*) FILTER (WHERE "status" = 'failed')::int AS "failed",
	COUNT(*) FILTER (WHERE "status" = 'aborted')::int AS "aborted",
	COUNT(*) FILTER (WHERE "status" = 'pending')::int AS "pending",
	COUNT(*) FILTER (WHERE "usedFreeQuota" = TRUE)::int AS "freeCalls",
	COUNT(*) FILTER (WHERE "cost" > 0)::int AS "paidCalls",
	COALESCE(SUM("cost") FILTER (WHERE "cost" > 0), 0)::float8 AS "credits",
	COALESCE(SUM("promptTokens"), 0)::float8 AS "promptTokens",
	COALESCE(SUM("completionTokens"), 0)::float8 AS "completionTokens",
	COALESCE(SUM("promptCacheHitTokens"), 0)::float8 AS "cacheHitTokens",
	(AVG("durationMs") FILTER (WHERE "status" = 'success'))::float8 AS "avgMs"`;

/** Percentiles sort every success row per group; the most expensive column after distinct users. */
const PERCENTILE_SQL = `
	(percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs") FILTER (WHERE "status" = 'success' AND "durationMs" IS NOT NULL))::float8 AS "p50Ms",
	(percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs") FILTER (WHERE "status" = 'success' AND "durationMs" IS NOT NULL))::float8 AS "p95Ms"`;

/**
 * Column set per query. Distinct users and percentiles roughly double/triple a scan's cost
 * (measured on 3M rows), so panels that never show them skip them; skipped users read as 0
 * and skipped percentiles as null.
 */
function metricsSql(opts: ReportExtraColumns): string {
	return [
		BASE_METRICS_SQL,
		opts.users ? 'COUNT(DISTINCT "userId")::int AS "users"' : '0::int AS "users"',
		opts.percentiles ? PERCENTILE_SQL : 'NULL::float8 AS "p50Ms", NULL::float8 AS "p95Ms"',
	].join(',\n');
}

/** Which of the two expensive columns a query computes. */
export type ReportExtraColumns = { users: boolean; percentiles: boolean };
const ALL_COLUMNS: ReportExtraColumns = { users: true, percentiles: true };
const METRICS_SQL = metricsSql(ALL_COLUMNS);

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
	private running = 0;
	private readonly waiting: Array<() => void> = [];
	private readonly inflight = new Map<string, Promise<unknown>>();

	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,
	) {}

	private where(p: SqlParams, f: ReportFilter, opts: { ignoreModels?: boolean } = {}): string {
		const parts = [
			`"requestedAt" >= ${p.add(f.since)}`,
			`"requestedAt" < ${p.add(f.until)}`,
		];
		const kinds = f.usageKinds != null && f.usageKinds.length > 0 ? f.usageKinds : reportUsageKinds;
		parts.push(`"usageKind" IN (${kinds.map(k => p.add(k)).join(', ')})`);
		if (f.userId != null) parts.push(`"userId" = ${p.add(f.userId)}`);
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

	/**
	 * Beijing-time bucket start. date_bin from a Monday-midnight +08 origin gives the same buckets
	 * as date_trunc(... AT TIME ZONE 'Asia/Shanghai') (no DST there) and is about 3x cheaper per row.
	 */
	private bucketSql(p: SqlParams, unit: ReportBucketUnit): string {
		const step = unit === 'hour' ? '1 hour' : unit === 'day' ? '1 day' : '7 days';
		return `date_bin(${p.add(step)}::interval, "requestedAt", ${p.add(BUCKET_ORIGIN)}::timestamptz)`;
	}

	/** Every report statement goes through the per-process concurrency gate. */
	private async query<T>(sql: string, params: unknown[]): Promise<T> {
		if (this.running >= MAX_CONCURRENT_QUERIES) {
			await new Promise<void>(resolve => this.waiting.push(resolve));
		} else {
			this.running++;
		}
		try {
			return await this.db.query<T>(sql, params);
		} finally {
			// Hand the slot straight to the next waiter; only free it when nobody waits.
			const next = this.waiting.shift();
			if (next != null) next();
			else this.running--;
		}
	}

	/**
	 * Cache a result in Redis keyed by the filter and extra inputs. Identical requests that arrive
	 * while one is running share it (the page asks summary and trend for the same overview at once).
	 * Windows that ended more than a minute ago live longer because their rows no longer change.
	 */
	@bindThis
	public async cached<T>(name: string, f: ReportFilter, extra: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
		const input = JSON.stringify({
			s: f.since.toISOString(),
			u: f.until.toISOString(),
			m: [...(f.modelIds ?? [])].sort(),
			k: [...(f.usageKinds ?? [])].sort(),
			who: f.userId ?? null,
			...extra,
		});
		const key = `agentModelReport:${name}:${createHash('sha1').update(input).digest('hex')}`;
		const running = this.inflight.get(key);
		if (running != null) return running as Promise<T>;
		const task = (async () => {
			const hit = await this.redisClient.get(key);
			if (hit != null) return JSON.parse(hit) as T;
			const value = await fn();
			const ttl = f.until.getTime() < Date.now() - 60_000 ? CLOSED_WINDOW_CACHE_TTL_SEC : CACHE_TTL_SEC;
			await this.redisClient.set(key, JSON.stringify(value), 'EX', ttl);
			return value;
		})();
		this.inflight.set(key, task);
		try {
			return await task;
		} finally {
			this.inflight.delete(key);
		}
	}

	/**
	 * Window totals and the zero-filled ungrouped series in one scan (GROUPING SETS). Grouping
	 * also keeps the planner on the time index: an ungrouped aggregate with COUNT(DISTINCT
	 * "userId") tends to pick the (userId, requestedAt) index and runs about 10x slower.
	 */
	@bindThis
	public async overview(f: ReportFilter, unit: ReportBucketUnit): Promise<{ totals: ReportMetrics; series: Array<{ t: string; m: ReportMetrics }> }> {
		const p = new SqlParams();
		const where = this.where(p, f);
		const bucket = this.bucketSql(p, unit);
		const rows = await this.query<Array<RawMetrics & { bucket: Date | null }>>(
			`SELECT ${bucket} AS "bucket", ${METRICS_SQL}
			FROM "agent_model_usage_log" WHERE ${where}
			GROUP BY GROUPING SETS ((), (1))`, p.values);
		let totals = emptyReportMetrics();
		const byT = new Map<number, ReportMetrics>();
		for (const r of rows) {
			if (r.bucket == null) totals = toMetrics(r);
			else byT.set(new Date(r.bucket).getTime(), toMetrics(r));
		}
		const series = listReportBuckets(f.since, f.until, unit).map(t => ({ t: new Date(t).toISOString(), m: byT.get(t) ?? emptyReportMetrics() }));
		return { totals, series };
	}

	/** Cached overview; summary and trend (compare line) request the same windows and share it. */
	@bindThis
	public cachedOverview(f: ReportFilter, unit: ReportBucketUnit): Promise<{ totals: ReportMetrics; series: Array<{ t: string; m: ReportMetrics }> }> {
		return this.cached('overview', f, { unit }, () => this.overview(f, unit));
	}

	/** `buildKey` may bind its own parameters; it runs after the WHERE clause has bound its own. */
	private async groupedSeries(f: ReportFilter, unit: ReportBucketUnit, cols: ReportExtraColumns, staticKeySql: string, buildKey?: (p: SqlParams) => string): Promise<Map<string, Map<number, ReportMetrics>>> {
		const p = new SqlParams();
		const where = this.where(p, f);
		const keySql = buildKey != null ? buildKey(p) : staticKeySql;
		const bucket = this.bucketSql(p, unit);
		const rows = await this.query<Array<RawMetrics & { bucket: Date; key: string }>>(
			`SELECT ${bucket} AS "bucket", ${keySql} AS "key", ${metricsSql(cols)}
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
	 * and percentiles stay exact instead of being summed). `cols` lets the caller skip the two
	 * expensive columns when the chart's metric does not need them.
	 */
	@bindThis
	public async trend(f: ReportFilter, unit: ReportBucketUnit, breakdown: ReportBreakdown, cols: ReportExtraColumns = ALL_COLUMNS): Promise<{
		buckets: string[];
		groups: Array<{ key: string; total: number; points: ReportMetrics[] }>;
	}> {
		let grouped: Map<string, Map<number, ReportMetrics>>;
		switch (breakdown) {
			case 'none':
				grouped = await this.groupedSeries(f, unit, cols, '\'all\'');
				break;
			case 'status':
				grouped = await this.groupedSeries(f, unit, cols, '"status"');
				break;
			case 'usageKind':
				grouped = await this.groupedSeries(f, unit, cols, '"usageKind"');
				break;
			case 'billing':
				grouped = await this.groupedSeries(f, unit, cols, BILLING_KEY_SQL);
				break;
			case 'model': {
				const p = new SqlParams();
				const top = await this.query<Array<{ key: string }>>(
					`SELECT ${MODEL_KEY_SQL} AS "key" FROM "agent_model_usage_log" WHERE ${this.where(p, f)}
					GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 10`, p.values);
				const keys = top.map(r => String(r.key));
				// Up to 9 models are shown as-is; beyond that the top 8 plus "other".
				const shown = keys.length <= 9 ? keys : keys.slice(0, 8);
				grouped = await this.groupedSeries(f, unit, cols, '', q => {
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

	/**
	 * Per-model rows. Model selection is ignored so the table can show every model for comparison.
	 * `splitByok` keeps each BYOK model as its own row (per-user pages, where the user knows them);
	 * site-wide reports merge them.
	 */
	@bindThis
	public async byModel(f: ReportFilter, opts: { splitByok?: boolean } = {}): Promise<Array<{ modelId: string; m: ReportMetrics }>> {
		const p = new SqlParams();
		const keySql = opts.splitByok === true ? `COALESCE("modelId", '${REPORT_UNASSIGNED_MODEL_KEY}')` : MODEL_KEY_SQL;
		const rows = await this.query<Array<RawMetrics & { key: string }>>(
			`SELECT ${keySql} AS "key", ${METRICS_SQL}
			FROM "agent_model_usage_log" WHERE ${this.where(p, f, { ignoreModels: true })}
			GROUP BY 1 ORDER BY 2 DESC`, p.values);
		return rows.map(r => ({ modelId: String(r.key), m: toMetrics(r) }));
	}

	@bindThis
	public async byUsageKind(f: ReportFilter): Promise<Array<{ usageKind: string; m: ReportMetrics }>> {
		const p = new SqlParams();
		const rows = await this.query<Array<RawMetrics & { key: string }>>(
			`SELECT "usageKind" AS "key", ${metricsSql({ users: false, percentiles: true })}
			FROM "agent_model_usage_log" WHERE ${this.where(p, f)}
			GROUP BY 1`, p.values);
		return rows.map(r => ({ usageKind: String(r.key), m: toMetrics(r) })).sort((a, b) => b.m.total - a.m.total);
	}

	@bindThis
	public async billing(f: ReportFilter): Promise<Array<{ category: string; count: number; credits: number }>> {
		const p = new SqlParams();
		const rows = await this.query<Array<{ key: string; count: number; credits: number | string }>>(
			`SELECT ${BILLING_KEY_SQL} AS "key", COUNT(*)::int AS "count", COALESCE(SUM("cost"), 0)::float8 AS "credits"
			FROM "agent_model_usage_log" WHERE ${this.where(p, f)}
			GROUP BY 1`, p.values);
		return rows.map(r => ({ category: String(r.key), count: Number(r.count) || 0, credits: Number(r.credits) || 0 }))
			.sort((a, b) => b.count - a.count);
	}

	@bindThis
	public async errorCodes(f: ReportFilter, limit = 10): Promise<Array<{ errorCode: string; count: number; models: number; users: number; lastAt: string }>> {
		const p = new SqlParams();
		const rows = await this.query<Array<{ code: string; count: number; models: number; users: number; lastAt: Date }>>(
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

	/**
	 * Requests by Beijing-time ISO weekday (1=Mon) × hour. SQL only groups by hour bucket
	 * (EXTRACT ... AT TIME ZONE per row is about 2.5x slower); the 7×24 fold happens here.
	 */
	@bindThis
	public async heatmap(f: ReportFilter): Promise<Array<{ dow: number; hour: number; count: number }>> {
		const p = new SqlParams();
		const where = this.where(p, f);
		const bucket = this.bucketSql(p, 'hour');
		const rows = await this.query<Array<{ bucket: Date; count: number }>>(
			`SELECT ${bucket} AS "bucket", COUNT(*)::int AS "count"
			FROM "agent_model_usage_log" WHERE ${where}
			GROUP BY 1`, p.values);
		const cells = new Map<number, number>();
		for (const r of rows) {
			const local = new Date(new Date(r.bucket).getTime() + BEIJING_OFFSET_MS);
			const key = (((local.getUTCDay() + 6) % 7) + 1) * 100 + local.getUTCHours();
			cells.set(key, (cells.get(key) ?? 0) + (Number(r.count) || 0));
		}
		return [...cells.entries()].map(([k, count]) => ({ dow: Math.floor(k / 100), hour: k % 100, count }));
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
		// COUNT(*) OVER () counts the grouped rows (= distinct users) in the same scan.
		const rows = await this.query<Array<RawMetrics & { userId: string; userCount: number }>>(
			`SELECT "userId", ${metricsSql({ users: false, percentiles: false })}, COUNT(*) OVER ()::int AS "userCount"
			FROM "agent_model_usage_log" WHERE ${where}
			GROUP BY "userId" ORDER BY ${order}, "userId" LIMIT ${limitP} OFFSET ${offsetP}`, p.values);
		let total = rows.length > 0 ? Number(rows[0].userCount) || 0 : 0;
		// Past the last page there is no row to carry the window count; count separately.
		if (rows.length === 0 && offset > 0) {
			const count = await this.query<Array<{ cnt: number }>>(
				`SELECT COUNT(*)::int AS "cnt" FROM (SELECT DISTINCT "userId" FROM "agent_model_usage_log" WHERE ${where}) d`, countParams);
			total = Number(count[0]?.cnt) || 0;
		}
		return { total, rows: rows.map(r => ({ userId: r.userId, m: toMetrics(r) })) };
	}

	/**
	 * Requests by character or dialogue style (page/pageSize, with the distinct total). Rows
	 * without the dimension (non-session calls) are excluded.
	 */
	@bindThis
	public async byDimension(f: ReportFilter, dim: 'characterId' | 'dialogueStyleId', offset: number, limit: number): Promise<{
		total: number;
		rows: Array<{ id: string; m: ReportMetrics }>;
	}> {
		const col = dim === 'characterId' ? '"characterId"' : '"dialogueStyleId"';
		const p = new SqlParams();
		const where = `${this.where(p, f)} AND ${col} IS NOT NULL`;
		const limitP = p.add(limit);
		const offsetP = p.add(offset);
		const rows = await this.query<Array<RawMetrics & { key: string; n: number }>>(
			`SELECT ${col} AS "key", ${metricsSql({ users: false, percentiles: false })}, COUNT(*) OVER ()::int AS "n"
			FROM "agent_model_usage_log" WHERE ${where}
			GROUP BY 1 ORDER BY "total" DESC, 1 LIMIT ${limitP} OFFSET ${offsetP}`, p.values);
		return { total: rows.length > 0 ? Number(rows[0].n) || 0 : 0, rows: rows.map(r => ({ id: String(r.key), m: toMetrics(r) })) };
	}

	/**
	 * Model catalog for the picker and table labels: every configured model regardless of
	 * the time window, the two pseudo groups, and any historical id seen in `seenIds`.
	 */
	@bindThis
	public catalog(instance: MiMeta, seenIds: Iterable<string>, opts: { userModels?: Array<{ id: string; name: string }> } = {}): ReportModelCatalogEntry[] {
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
		for (const m of opts.userModels ?? []) {
			push({ id: m.id, name: m.name || m.id, category: 'byok', state: 'active' });
		}
		push({ id: REPORT_BYOK_MODEL_KEY, name: '用户自带模型', category: 'byok', state: 'active' });
		push({ id: REPORT_UNASSIGNED_MODEL_KEY, name: '未关联模型', category: 'unassigned', state: 'active' });
		for (const id of seenIds) {
			// A deleted BYOK model is still recognisable by its id prefix.
			if (id.startsWith(AGENT_USER_MODEL_ID_PREFIX)) push({ id, name: '已删除的自带模型', category: 'byok', state: 'deleted' });
			else push({ id, name: id, category: 'deleted', state: 'deleted' });
		}
		return out;
	}
}
