/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentMessageNotifyService } from '@/core/AgentMessageNotifyService.js';

export const meta = {
	tags: ['agents'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
	},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private agentMessageNotifyService: AgentMessageNotifyService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.agentMessageNotifyService.readAgentMessages(me.id);
		});
	}
}
