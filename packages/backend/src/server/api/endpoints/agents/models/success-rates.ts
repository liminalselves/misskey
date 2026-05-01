/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:account',
	limit: { duration: ms('1min'), max: 60 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			windowMs: { type: 'integer' },
			rates: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						modelId: { type: 'string' },
						total: { type: 'integer' },
						success: { type: 'integer' },
						failed: { type: 'integer' },
						aborted: { type: 'integer' },
					},
					required: ['modelId', 'total', 'success', 'failed', 'aborted'],
				},
			},
		},
		required: ['windowMs', 'rates'],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		windowMs: { type: 'integer', minimum: 60_000, maximum: 7 * 24 * 60 * 60 * 1000 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private agentService: AgentService,
		private agentModelUsageService: AgentModelUsageService,
	) {
		super(meta, paramDef, async (ps) => {
			this.agentService.assertAgentsEnabled();

			const windowMs = ps.windowMs ?? 60 * 60 * 1000;
			const since = new Date(Date.now() - windowMs);
			const rows = await this.agentModelUsageService.aggregateByModel({ since });

			return {
				windowMs,
				rates: rows
					.filter(r => r.modelId != null)
					.map(r => ({
						modelId: r.modelId as string,
						total: r.total,
						success: r.success,
						failed: r.failed,
						aborted: r.aborted,
					})),
			};
		});
	}
}
