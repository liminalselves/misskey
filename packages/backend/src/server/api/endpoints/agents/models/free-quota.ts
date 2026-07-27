/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaService } from '@/core/MetaService.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';
import { getActiveLlmModels } from '@/misc/agent-llm-models.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:account',
	limit: { duration: ms('1min'), max: 60 },
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			properties: {
				modelId: { type: 'string' },
				freeQuotaUsed: { type: 'integer' },
				freeQuotaTotal: { type: 'integer' },
			},
			required: ['modelId', 'freeQuotaUsed', 'freeQuotaTotal'],
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private metaService: MetaService,
		private agentService: AgentService,
		private agentModelUsageService: AgentModelUsageService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();

			const instance = await this.metaService.fetch(true);
			const models = getActiveLlmModels(instance);

			const out: { modelId: string; freeQuotaUsed: number; freeQuotaTotal: number }[] = [];
			for (const m of models) {
				const total = m.dailyFreeQuota ?? 0;
				if (total <= 0) continue;
				const used = await this.agentModelUsageService.getFreeQuotaUsed(me.id, m.id);
				out.push({ modelId: m.id, freeQuotaUsed: used, freeQuotaTotal: total });
			}
			return out;
		});
	}
}
