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

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:chat',
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
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: '5cd56e5e-7065-4af4-b7ed-1343da4614ef' });
			}
			const characterRow = await this.agentCharactersRepository.findOneBy({ id: session.characterId });
			if (!characterRow) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: '98a1d9f1-57bd-44b7-a74f-a3819516fe58' });
			}
			this.agentService.assertAgentUserSessionChatAllowed(characterRow, session);
			this.agentService.assertSessionCharacterPolicy({
				sessionKind: session.sessionKind,
				character: characterRow,
				userId: me.id,
			});

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
