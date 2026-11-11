/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentModelReportService, emptyReportMetrics, resolveReportBucketUnit } from '@/core/AgentModelReportService.js';
import { previousReportFilter, reportFilterProperties, reportMetricsSchema, resolveReportFilter } from './_report-params.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireAdmin: true,
	kind: 'read:admin',
	limit: { duration: ms('5min'), max: 300 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			bucket: { type: 'string', optional: false, nullable: false, enum: ['hour', 'day', 'week'] },
			buckets: { type: 'array', optional: false, nullable: false, items: { type: 'string', optional: false, nullable: false } },
			groups: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						key: { type: 'string', optional: false, nullable: false },
						total: { type: 'integer', optional: false, nullable: false },
						points: { type: 'array', optional: false, nullable: false, items: reportMetricsSchema },
					},
				},
			},
			/** Previous window, ungrouped, aligned to `buckets` by index; null when compare is off. */
			previous: { type: 'array', optional: false, nullable: true, items: reportMetricsSchema },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		...reportFilterProperties,
		bucket: { type: 'string', enum: ['auto', 'hour', 'day', 'week'], default: 'auto' },
		breakdown: { type: 'string', enum: ['none', 'status', 'model', 'usageKind', 'billing'], default: 'none' },
		compare: { type: 'boolean', default: false },
	},
	required: [],
} as const;

/** Main trend chart: every bucket carries the full metric set so the client switches metrics locally. */
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private agentService: AgentService,
		private agentModelReportService: AgentModelReportService,
	) {
		super(meta, paramDef, async (ps) => {
			this.agentService.assertAgentsEnabled();
			const f = resolveReportFilter(ps);
			const bucket = resolveReportBucketUnit(f.since, f.until, ps.bucket);
			const [trend, previous] = await Promise.all([
				this.agentModelReportService.trend(f, bucket, ps.breakdown),
				ps.compare ? this.agentModelReportService.series(previousReportFilter(f), bucket) : Promise.resolve(null),
			]);
			// The previous window can align to one bucket more or fewer; match it to the current length by index.
			const prev = previous?.map(p => p.m) ?? null;
			const aligned = prev == null ? null : trend.buckets.map((_, i) => prev[prev.length - trend.buckets.length + i] ?? emptyReportMetrics());
			return { bucket, ...trend, previous: aligned };
		});
	}
}
