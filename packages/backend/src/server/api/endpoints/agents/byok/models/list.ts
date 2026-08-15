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
	kind: 'read:account',
	limit: { duration: ms('5min'), max: 60 },
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			properties: {
				id: { type: 'string' },
				name: { type: 'string' },
				baseUrl: { type: 'string' },
				apiModelName: { type: 'string' },
				maxContextTokens: { type: 'number' },
				maxOutputTokensPerCall: { type: 'number' },
				tokenizerEncoding: { type: 'string', nullable: true },
				charsPerToken: { type: 'number', nullable: true },
				providerId: { type: 'string', nullable: true },
				enabled: { type: 'boolean' },
				createdAt: { type: 'string', format: 'date-time' },
				updatedAt: { type: 'string', format: 'date-time' },
			},
			required: ['id', 'name', 'baseUrl', 'apiModelName', 'maxContextTokens', 'maxOutputTokensPerCall', 'tokenizerEncoding', 'charsPerToken', 'providerId', 'enabled', 'createdAt', 'updatedAt'],
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
		private agentService: AgentService,
		private agentUserModelService: AgentUserModelService,
	) {
		super(meta, paramDef, async (_ps, me) => {
			this.agentService.assertAgentsEnabled();
			return this.agentUserModelService.list(me.id);
		});
	}
}
