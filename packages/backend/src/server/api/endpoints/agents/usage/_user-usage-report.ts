/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { In } from 'typeorm';
import type { AgentCharactersRepository, AgentDialogueStylesRepository, AgentUserModelsRepository, UserProfilesRepository } from '@/models/_.js';
import type { MetaService } from '@/core/MetaService.js';
import { resolveReportBucketUnit } from '@/core/AgentModelReportService.js';
import type { AgentModelReportService, ReportBreakdown, ReportFilter } from '@/core/AgentModelReportService.js';
import { previousReportFilter, reportFilterProperties, reportMetricsSchema, resolveReportFilter } from '@/server/api/endpoints/admin/agents/reports/_report-params.js';

/**
 * Shared implementation of the per-user usage report (user page agents/usage/report and
 * moderator page admin/users/agent-usage-report). It reuses AgentModelReportService with a
 * userId filter, so the numbers follow exactly the same definitions as the site-wide report.
 * One user's rows are few, so the whole page comes back in one cached request; character/style
 * pages are cached on their own so paging them only recomputes that table.
 */
export const userUsageReportParamProperties = {
	...reportFilterProperties,
	bucket: { type: 'string', enum: ['auto', 'hour', 'day', 'week'], default: 'auto' },
	breakdown: { type: 'string', enum: ['none', 'status', 'model', 'usageKind', 'billing'], default: 'none' },
	compare: { type: 'boolean', default: false },
	characterPage: { type: 'integer', minimum: 1, default: 1 },
	stylePage: { type: 'integer', minimum: 1, default: 1 },
	dimensionPageSize: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
} as const;

const named = {
	type: 'object',
	optional: false, nullable: false,
	properties: {
		id: { type: 'string', optional: false, nullable: false },
		name: { type: 'string', optional: false, nullable: true },
		m: reportMetricsSchema,
	},
} as const;

const page = (items: typeof named) => ({
	type: 'object',
	optional: false, nullable: false,
	properties: {
		items: { type: 'array', optional: false, nullable: false, items },
		total: { type: 'integer', optional: false, nullable: false },
		page: { type: 'integer', optional: false, nullable: false },
		pageSize: { type: 'integer', optional: false, nullable: false },
	},
} as const);

const metricsList = { type: 'array', optional: false, nullable: false, items: reportMetricsSchema } as const;

export const userUsageReportResSchema = {
	type: 'object',
	optional: false, nullable: false,
	properties: {
		creditBalance: { type: 'number', optional: false, nullable: false },
		since: { type: 'string', optional: false, nullable: false },
		until: { type: 'string', optional: false, nullable: false },
		bucket: { type: 'string', optional: false, nullable: false, enum: ['hour', 'day', 'week'] },
		current: reportMetricsSchema,
		previous: reportMetricsSchema,
		series: {
			type: 'array', optional: false, nullable: false,
			items: {
				type: 'object', optional: false, nullable: false,
				properties: { t: { type: 'string', optional: false, nullable: false }, m: reportMetricsSchema },
			},
		},
		trend: {
			type: 'object', optional: false, nullable: false,
			properties: {
				buckets: { type: 'array', optional: false, nullable: false, items: { type: 'string', optional: false, nullable: false } },
				groups: {
					type: 'array', optional: false, nullable: false,
					items: {
						type: 'object', optional: false, nullable: false,
						properties: {
							key: { type: 'string', optional: false, nullable: false },
							total: { type: 'integer', optional: false, nullable: false },
							points: metricsList,
						},
					},
				},
				previous: { ...metricsList, nullable: true },
			},
		},
		catalog: {
			type: 'array', optional: false, nullable: false,
			items: {
				type: 'object', optional: false, nullable: false,
				properties: {
					id: { type: 'string', optional: false, nullable: false },
					name: { type: 'string', optional: false, nullable: false },
					category: { type: 'string', optional: false, nullable: false },
					state: { type: 'string', optional: false, nullable: false },
				},
			},
		},
		models: {
			type: 'array', optional: false, nullable: false,
			items: {
				type: 'object', optional: false, nullable: false,
				properties: { modelId: { type: 'string', optional: false, nullable: false }, m: reportMetricsSchema },
			},
		},
		usageKinds: {
			type: 'array', optional: false, nullable: false,
			items: {
				type: 'object', optional: false, nullable: false,
				properties: { usageKind: { type: 'string', optional: false, nullable: false }, m: reportMetricsSchema },
			},
		},
		billing: {
			type: 'array', optional: false, nullable: false,
			items: {
				type: 'object', optional: false, nullable: false,
				properties: {
					category: { type: 'string', optional: false, nullable: false },
					count: { type: 'integer', optional: false, nullable: false },
					credits: { type: 'number', optional: false, nullable: false },
				},
			},
		},
		errorCodes: {
			type: 'array', optional: false, nullable: false,
			items: {
				type: 'object', optional: false, nullable: false,
				properties: {
					errorCode: { type: 'string', optional: false, nullable: false },
					count: { type: 'integer', optional: false, nullable: false },
					models: { type: 'integer', optional: false, nullable: false },
					users: { type: 'integer', optional: false, nullable: false },
					lastAt: { type: 'string', optional: false, nullable: false },
				},
			},
		},
		heatmap: {
			type: 'array', optional: false, nullable: false,
			items: {
				type: 'object', optional: false, nullable: false,
				properties: {
					dow: { type: 'integer', optional: false, nullable: false },
					hour: { type: 'integer', optional: false, nullable: false },
					count: { type: 'integer', optional: false, nullable: false },
				},
			},
		},
		characters: page(named),
		styles: page(named),
	},
} as const;

export type UserUsageReportDeps = {
	userProfilesRepository: UserProfilesRepository;
	agentUserModelsRepository: AgentUserModelsRepository;
	agentCharactersRepository: AgentCharactersRepository;
	agentDialogueStylesRepository: AgentDialogueStylesRepository;
	metaService: MetaService;
	agentModelReportService: AgentModelReportService;
};

type Params = {
	since?: string; until?: string; modelIds?: string[]; usageKinds?: string[];
	bucket: 'auto' | 'hour' | 'day' | 'week';
	breakdown: ReportBreakdown;
	compare: boolean;
	characterPage: number;
	stylePage: number;
	dimensionPageSize: number;
};

export async function buildUserUsageReport(deps: UserUsageReportDeps, userId: string, ps: Params) {
	const svc = deps.agentModelReportService;
	const f: ReportFilter = { ...resolveReportFilter(ps), userId };
	const prevF = previousReportFilter(f);
	const bucket = resolveReportBucketUnit(f.since, f.until, ps.bucket);
	const size = ps.dimensionPageSize;
	// Paging a character/style table must not recompute the rest, so dimensions are cached separately.
	const dimension = (dim: 'characterId' | 'dialogueStyleId', pageNo: number) =>
		svc.cached('userDim', f, { dim, page: pageNo, size }, () => svc.byDimension(f, dim, (pageNo - 1) * size, size));

	const [profile, userModels, instance, data, characters, styles] = await Promise.all([
		deps.userProfilesRepository.findOne({ where: { userId }, select: { agentCreditBalance: true } }),
		deps.agentUserModelsRepository.find({ where: { userId }, select: { id: true, name: true } }),
		deps.metaService.fetch(true),
		svc.cached('user', f, { bucket, breakdown: ps.breakdown }, async () => {
			const [cur, prev, trend, models, usageKinds, billing, errorCodes, heatmap] = await Promise.all([
				svc.overview(f, bucket),
				svc.overview(prevF, bucket),
				ps.breakdown === 'none' ? Promise.resolve(null) : svc.trend(f, bucket, ps.breakdown),
				svc.byModel({ ...f, modelIds: [] }, { splitByok: true }),
				svc.byUsageKind(f),
				svc.billing(f),
				svc.errorCodes(f, 10),
				svc.heatmap(f),
			]);
			return { cur, prev, trend, models, usageKinds, billing, errorCodes, heatmap };
		}),
		dimension('characterId', ps.characterPage),
		dimension('dialogueStyleId', ps.stylePage),
	]);

	// Ungrouped trend is the overview series itself.
	const trend = data.trend ?? {
		buckets: data.cur.series.map(s => s.t),
		groups: [{ key: 'all', total: data.cur.totals.total, points: data.cur.series.map(s => s.m) }],
	};
	const prevPoints = data.prev.series.map(s => s.m);
	const previous = ps.compare
		? trend.buckets.map((_, i) => prevPoints[prevPoints.length - trend.buckets.length + i] ?? data.prev.totals)
		: null;

	// Names are looked up per page only (ids of the visible rows), never for the whole table.
	const [charRows, styleRows] = await Promise.all([
		characters.rows.length > 0
			? deps.agentCharactersRepository.find({ where: { id: In(characters.rows.map(r => r.id)) }, select: { id: true, name: true } })
			: Promise.resolve([]),
		styles.rows.length > 0
			? deps.agentDialogueStylesRepository.find({ where: { id: In(styles.rows.map(r => r.id)) }, select: { id: true, name: true } })
			: Promise.resolve([]),
	]);
	const charNames = new Map(charRows.map(r => [r.id, r.name]));
	const styleNames = new Map(styleRows.map(r => [r.id, r.name]));

	const catalog = svc.catalog(instance, [...data.models.map(r => r.modelId), ...(f.modelIds ?? [])], { userModels });

	return {
		creditBalance: profile?.agentCreditBalance ?? 0,
		since: f.since.toISOString(),
		until: f.until.toISOString(),
		bucket,
		current: data.cur.totals,
		previous: data.prev.totals,
		series: data.cur.series,
		trend: { ...trend, previous },
		catalog,
		models: data.models,
		usageKinds: data.usageKinds,
		billing: data.billing,
		errorCodes: data.errorCodes,
		heatmap: data.heatmap,
		characters: {
			items: characters.rows.map(r => ({ id: r.id, name: charNames.get(r.id) ?? null, m: r.m })),
			total: characters.total,
			page: ps.characterPage,
			pageSize: size,
		},
		styles: {
			items: styles.rows.map(r => ({ id: r.id, name: styleNames.get(r.id) ?? null, m: r.m })),
			total: styles.total,
			page: ps.stylePage,
			pageSize: size,
		},
	};
}
