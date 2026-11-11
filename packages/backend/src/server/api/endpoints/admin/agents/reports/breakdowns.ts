/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentModelReportService } from '@/core/AgentModelReportService.js';
import { reportFilterProperties, reportMetricsSchema, resolveReportFilter } from './_report-params.js';

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
			usageKinds: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						usageKind: { type: 'string', optional: false, nullable: false },
						m: reportMetricsSchema,
					},
				},
			},
			billing: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						category: { type: 'string', optional: false, nullable: false },
						count: { type: 'integer', optional: false, nullable: false },
						credits: { type: 'number', optional: false, nullable: false },
					},
				},
			},
			errorCodes: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
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
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						dow: { type: 'integer', optional: false, nullable: false },
						hour: { type: 'integer', optional: false, nullable: false },
						count: { type: 'integer', optional: false, nullable: false },
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
	},
	required: [],
} as const;

/** Composition panels: usage kinds, billing categories, failure codes and the Beijing-time heatmap. */
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private agentService: AgentService,
		private agentModelReportService: AgentModelReportService,
	) {
		super(meta, paramDef, async (ps) => {
			this.agentService.assertAgentsEnabled();
			const f = resolveReportFilter(ps);
			const [usageKinds, billing, errorCodes, heatmap] = await Promise.all([
				this.agentModelReportService.byUsageKind(f),
				this.agentModelReportService.billing(f),
				this.agentModelReportService.errorCodes(f, 10),
				this.agentModelReportService.heatmap(f),
			]);
			return { usageKinds, billing, errorCodes, heatmap };
		});
	}
}
