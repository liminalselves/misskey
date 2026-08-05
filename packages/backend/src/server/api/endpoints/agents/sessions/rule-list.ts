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
	limit: { duration: ms('1hour'), max: 180 },
	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: { type: 'string', minLength: 1, maxLength: 128 },
				name: { type: 'string' },
				description: { type: 'string' },
				type: { type: 'string', enum: ['persistent', 'toggleable'] },
				defaultEnabled: { type: 'boolean' },
				currentEnabled: { type: 'boolean' },
				hasDisabledPrompt: { type: 'boolean' },
			},
			required: ['id', 'name', 'description', 'type', 'defaultEnabled', 'currentEnabled', 'hasDisabledPrompt'],
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
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });
			}
			const characterRow = await this.agentCharactersRepository.findOneBy({ id: session.characterId });
			if (!characterRow) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: 'b2c3d4e5-f6a7-8901-bcde-f23456789012' });
			}
			this.agentService.assertAgentUserSessionChatAllowed(characterRow, session);
			this.agentService.assertSessionCharacterPolicy({
				sessionKind: session.sessionKind,
				character: characterRow,
				userId: me.id,
			});

			const character = this.agentService.effectiveCharacterForLlm(characterRow, session.sessionKind === 'community');
			const rules = this.agentService.normalizeRules(character.rules);
			const activeRules = this.agentService.resolveActiveRules(rules, session.ruleOverrides);
			// Only expose metadata, never the rule content.
			return activeRules.map(({ content, disabledContent, active, ...rule }) => ({
				...rule,
				currentEnabled: active,
				hasDisabledPrompt: disabledContent.trim().length > 0,
			}));
		});
	}
}
