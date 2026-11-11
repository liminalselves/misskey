/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentModelReportService, resolveReportBucketUnit } from '@/core/AgentModelReportService.js';
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
			since: { type: 'string', optional: false, nullable: false },
			until: { type: 'string', optional: false, nullable: false },
			bucket: { type: 'string', optional: false, nullable: false, enum: ['hour', 'day', 'week'] },
			current: reportMetricsSchema,
			previous: reportMetricsSchema,
			series: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						t: { type: 'string', optional: false, nullable: false },
						m: reportMetricsSchema,
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		...reportFilterProperties,
		bucket: { type: 'string', enum: ['auto', 'hour', 'day', 'week'], default: 'auto' },
	},
	required: [],
} as const;

/** KPI cards and metric line charts: current vs previous equal-length window, plus an ungrouped series. */
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
			const [current, previous, series] = await Promise.all([
				this.agentModelReportService.metrics(f),
				this.agentModelReportService.metrics(previousReportFilter(f)),
				this.agentModelReportService.series(f, bucket),
			]);
			return { since: f.since.toISOString(), until: f.until.toISOString(), bucket, current, previous, series };
		});
	}
}
