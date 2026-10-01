/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCharactersRepository, AgentSessionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { loadSessionForReview } from './_utils.js';

// 镜像 agents/sessions/worldbook-list；跳过面向用户的封禁/策略断言（审查视角）
export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 180 },
	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: { type: 'string', minLength: 1, maxLength: 128 },
				title: { type: 'string' },
				keywords: {
					type: 'array',
					items: { type: 'string' },
				},
				triggerMode: { type: 'string', enum: ['keyword', 'manual', 'always'] },
				priority: { type: 'integer' },
				enabled: { type: 'boolean' },
				revision: { type: 'integer' },
				contentLength: { type: 'integer' },
			},
			required: ['id', 'title', 'keywords', 'triggerMode', 'priority', 'enabled', 'revision', 'contentLength'],
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
	},
	required: ['sessionId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();
			const session = await loadSessionForReview(this.agentSessionsRepository, ps.sessionId);
			const characterRow = await this.agentCharactersRepository.findOneBy({ id: session.characterId });
			if (!characterRow) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: '4b0d7f53-3896-42de-9939-44f6bf74d069' });
			}

			const character = this.agentService.effectiveCharacterForLlm(characterRow, session.sessionKind === 'community');
			return this.agentService.listWorldbookPublicMeta(character.worldbook);
		});
	}
}
