/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentModelReportService } from '@/core/AgentModelReportService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
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
			items: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						userId: { type: 'string', optional: false, nullable: false },
						user: { type: 'object', optional: false, nullable: true, ref: 'UserLite' },
						m: reportMetricsSchema,
					},
				},
			},
			total: { type: 'integer', optional: false, nullable: false },
			page: { type: 'integer', optional: false, nullable: false },
			pageSize: { type: 'integer', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		...reportFilterProperties,
		sort: { type: 'string', enum: ['credits', 'total', 'tokens', 'failed'], default: 'credits' },
		page: { type: 'integer', minimum: 1, default: 1 },
		pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
	required: [],
} as const;

/** User ranking with page/pageSize pagination. */
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private agentService: AgentService,
		private agentModelReportService: AgentModelReportService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const f = resolveReportFilter(ps);
			const { total, rows } = await this.agentModelReportService.cached('users', f, { sort: ps.sort, page: ps.page, pageSize: ps.pageSize },
				() => this.agentModelReportService.users(f, ps.sort, (ps.page - 1) * ps.pageSize, ps.pageSize));
			const packed = rows.length > 0 ? await this.userEntityService.packMany(rows.map(r => r.userId), me, { schema: 'UserLite' }) : [];
			const byId = new Map(packed.map(u => [u.id, u]));
			return {
				items: rows.map(r => ({ userId: r.userId, user: byId.get(r.userId) ?? null, m: r.m })),
				total,
				page: ps.page,
				pageSize: ps.pageSize,
			};
		});
	}
}
