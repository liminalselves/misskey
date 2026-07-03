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
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'f9602517-0ec8-4a97-a43b-b228f912bc3d' });
			}
			const characterRow = await this.agentCharactersRepository.findOneBy({ id: session.characterId });
			if (!characterRow) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: '556d2e5e-eae5-4d09-b4c5-f65e5e1ba037' });
			}
			this.agentService.assertAgentUserSessionChatAllowed(characterRow, session);
			this.agentService.assertSessionCharacterPolicy({
				sessionKind: session.sessionKind,
				character: characterRow,
				userId: me.id,
			});

			const character = this.agentService.effectiveCharacterForLlm(characterRow, session.sessionKind === 'community');
			return this.agentService.listWorldbookPublicMeta(character.worldbook);
		});
	}
}
