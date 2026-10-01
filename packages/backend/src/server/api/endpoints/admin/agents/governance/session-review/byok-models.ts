/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentSessionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentUserModelService } from '@/core/AgentUserModelService.js';
import { loadSessionForReview } from './_utils.js';

// 镜像 agents/byok/models/list：返回会话属主的自定义模型列表。
// AgentUserModelService.pack 不含 apiKey，无密钥泄露。
export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
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
	properties: { sessionId: { type: 'string', format: 'misskey:id' } },
	required: ['sessionId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		private agentService: AgentService,
		private agentUserModelService: AgentUserModelService,
	) {
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();
			const session = await loadSessionForReview(this.agentSessionsRepository, ps.sessionId);
			return this.agentUserModelService.list(session.userId);
		});
	}
}
