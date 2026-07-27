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
	kind: 'write:chat',
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			alreadyCheckedIn: { type: 'boolean' },
			reward: { type: 'number' },
			streak: { type: 'integer' },
			baseValue: { type: 'number' },
			streakMultiplier: { type: 'number' },
			roleMultiplier: { type: 'number' },
			dayMultiplier: { type: 'number' },
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
		private agentCheckinService: AgentCheckinService,
		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const instance = await this.metaService.fetch(true);
			const settings = this.agentCheckinService.resolveSettings(instance);
			if (!settings.enabled) {
				return { alreadyCheckedIn: false, reward: 0, streak: 0, baseValue: 0, streakMultiplier: 1, roleMultiplier: 1, dayMultiplier: 1 };
			}
			return this.agentCheckinService.performCheckin(me.id, instance);
		});
	}
}
