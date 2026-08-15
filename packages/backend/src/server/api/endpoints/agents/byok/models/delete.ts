/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentUserModelService } from '@/core/AgentUserModelService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'write:chat',
	limit: { duration: ms('1min'), max: 30 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {},
		required: [],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		modelId: { type: 'string', minLength: 1, maxLength: 64 },
	},
	required: ['modelId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private agentService: AgentService,
		private agentUserModelService: AgentUserModelService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			await this.agentUserModelService.delete(me.id, ps.modelId);
			return {};
		});
	}
}
