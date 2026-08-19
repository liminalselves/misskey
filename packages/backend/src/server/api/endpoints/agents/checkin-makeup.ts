/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaService } from '@/core/MetaService.js';
import { AgentCheckinService } from '@/core/AgentCheckinService.js';
import { AgentService } from '@/core/AgentService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'write:chat',
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			cost: { type: 'number' },
		},
	},
	errors: {
		checkinFailed: {
			message: 'Makeup check-in failed.',
			code: 'CHECKIN_FAILED',
			id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		date: { type: 'string', minLength: 10, maxLength: 10, pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
	},
	required: ['date'],
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
			const result = await this.agentCheckinService.performMakeup(me.id, ps.date, instance);
			if (!result.ok) {
				throw new ApiError({ ...meta.errors.checkinFailed, message: result.reason });
			}
			return { cost: result.cost };
		});
	}
}
