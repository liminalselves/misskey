/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentService } from '@/core/AgentService.js';
import { MetaService } from '@/core/MetaService.js';
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
			catalog: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						id: { type: 'string', optional: false, nullable: false },
						name: { type: 'string', optional: false, nullable: false },
						category: { type: 'string', optional: false, nullable: false, enum: ['llm', 'image', 'vision', 'byok', 'unassigned', 'deleted'] },
						state: { type: 'string', optional: false, nullable: false, enum: ['active', 'unlisted', 'disabled', 'deleted'] },
					},
				},
			},
			rows: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						modelId: { type: 'string', optional: false, nullable: false },
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
	},
	required: [],
} as const;

/**
 * Model catalog (all configured models, independent of the time window) and per-model rows.
 * Rows ignore the model selection so every model stays visible for comparison.
 */
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private agentService: AgentService,
		private metaService: MetaService,
		private agentModelReportService: AgentModelReportService,
	) {
		super(meta, paramDef, async (ps) => {
			this.agentService.assertAgentsEnabled();
			const f = resolveReportFilter(ps);
			const [instance, rows] = await Promise.all([
				this.metaService.fetch(true),
				// byModel ignores the model selection, so it is cached without it.
				this.agentModelReportService.cached('models', { ...f, modelIds: [] }, {}, () => this.agentModelReportService.byModel(f)),
			]);
			// Selected ids are kept in the catalog even when deleted and absent from this window.
			const catalog = this.agentModelReportService.catalog(instance, [...rows.map(r => r.modelId), ...(f.modelIds ?? [])]);
			return { catalog, rows };
		});
	}
}
