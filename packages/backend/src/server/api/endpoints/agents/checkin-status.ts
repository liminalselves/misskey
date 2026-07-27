/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaService } from '@/core/MetaService.js';
import { AgentCheckinService } from '@/core/AgentCheckinService.js';
import { AgentService } from '@/core/AgentService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:chat',
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			todayCheckedIn: { type: 'boolean' },
			streak: { type: 'integer' },
			monthRecords: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						date: { type: 'string' },
						reward: { type: 'number' },
						isMakeup: { type: 'boolean' },
						baseValue: { type: 'number' },
						streakMultiplier: { type: 'number' },
						roleMultiplier: { type: 'number' },
						dayMultiplier: { type: 'number' },
						makeupCost: { type: 'number', nullable: true },
						createdAt: { type: 'string' },
					},
				},
			},
			monthCount: { type: 'integer' },
			totalEarned: { type: 'number' },
			makeupRemainingThisMonth: { type: 'integer' },
			nextMakeupCost: { type: 'number' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		yearMonth: { type: 'string', minLength: 7, maxLength: 7 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private metaService: MetaService,
		private agentCheckinService: AgentCheckinService,
		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const instance = await this.metaService.fetch(true);
			const ym = ps.yearMonth ?? this.agentCheckinService.beijingDateStr(new Date()).slice(0, 7);
			return this.agentCheckinService.getMonthStatus(me.id, ym, instance);
		});
	}
}
