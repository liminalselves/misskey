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
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1, maxLength: 256 },
		baseUrl: { type: 'string', maxLength: 512 },
		apiKey: { type: 'string', maxLength: 8192 },
		apiModelName: { type: 'string', minLength: 1, maxLength: 256 },
		maxContextTokens: { type: 'integer', minimum: 256, maximum: 2_000_000 },
		maxOutputTokensPerCall: { type: 'integer', minimum: 1, maximum: 128_000 },
		tokenizerEncoding: { type: 'string', maxLength: 64, nullable: true },
		charsPerToken: { type: 'integer', minimum: 1, maximum: 10, nullable: true },
		providerId: { type: 'string', maxLength: 64, nullable: true },
	},
	required: ['name', 'baseUrl', 'apiKey', 'apiModelName'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private agentService: AgentService,
		private agentUserModelService: AgentUserModelService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			return this.agentUserModelService.create(me.id, {
				name: ps.name,
				baseUrl: ps.baseUrl,
				apiKey: ps.apiKey,
				apiModelName: ps.apiModelName,
				maxContextTokens: ps.maxContextTokens,
				maxOutputTokensPerCall: ps.maxOutputTokensPerCall,
				tokenizerEncoding: ps.tokenizerEncoding ?? null,
				charsPerToken: ps.charsPerToken ?? null,
				providerId: ps.providerId ?? null,
			});
		});
	}
}
