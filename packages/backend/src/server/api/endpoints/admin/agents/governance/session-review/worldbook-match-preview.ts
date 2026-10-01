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

// 镜像 agents/sessions/worldbook-match-preview；跳过面向用户的封禁/策略断言（审查视角）
export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 300 },
	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: { type: 'string', minLength: 1, maxLength: 128 },
				title: { type: 'string' },
				triggerMode: { type: 'string' },
				priority: { type: 'integer' },
				revision: { type: 'integer' },
				matchedBy: { type: 'string' },
				matchedKeywords: {
					type: 'array',
					items: { type: 'string' },
				},
			},
			required: ['id', 'title', 'triggerMode', 'priority', 'revision', 'matchedBy', 'matchedKeywords'],
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		text: { type: 'string', maxLength: 16000 },
		maxItems: { type: 'integer', minimum: 1, maximum: 24, nullable: true },
	},
	required: ['sessionId', 'text'],
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
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: 'f3f96a54-3765-4943-9e2e-2975c4054d55' });
			}

			const character = this.agentService.effectiveCharacterForLlm(characterRow, session.sessionKind === 'community');
			const entries = this.agentService.selectWorldbookEntriesForPrompt(character, ps.text, {
				maxTotal: ps.maxItems ?? 12,
			});
			return entries.map(entry => ({
				id: entry.id,
				title: entry.title,
				triggerMode: entry.triggerMode,
				priority: entry.priority,
				revision: entry.revision,
				matchedBy: entry.matchedBy,
				matchedKeywords: entry.matchedKeywords,
			}));
		});
	}
}
