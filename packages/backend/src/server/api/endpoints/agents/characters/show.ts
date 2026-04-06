/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCharactersRepository } from '@/models/_.js';
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
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: { type: 'string', format: 'misskey:id' },
			userId: { type: 'string', format: 'misskey:id' },
			name: { type: 'string' },
			summary: { type: 'string', nullable: true },
			personality: { type: 'string' },
			background: { type: 'string' },
			speakingStyle: { type: 'string' },
			greeting: { type: 'string' },
			exampleTurns: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						role: { type: 'string', enum: ['user', 'assistant'] },
						content: { type: 'string' },
					},
					required: ['role', 'content'],
				},
			},
			forbiddenBehavior: { type: 'string' },
			isPublished: { type: 'boolean' },
			reviewStatus: { type: 'string', optional: true },
			publishedVersion: { type: 'integer', nullable: true, optional: true },
			avatarFileId: { type: 'string', format: 'misskey:id', nullable: true },
			createdAt: { type: 'string', format: 'date-time' },
			updatedAt: { type: 'string', format: 'date-time' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { characterId: { type: 'string', format: 'misskey:id' } },
	required: ['characterId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentCharactersRepository.findOneBy({ id: ps.characterId });
			if (!row) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: 'e1f2a3b4-c5d6-7890-4567-901234567890' });
			}
			const isOwner = row.userId === me.id;
			if (!isOwner && !this.agentService.isListedOnPlazaCharacter(row)) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: 'f2a3b4c5-d6e7-8901-5678-012345678901' });
			}
			const display = isOwner ? row : this.agentService.effectiveCharacterForLlm(row, true);
			return {
				id: row.id,
				userId: row.userId,
				name: display.name,
				summary: display.summary,
				personality: display.personality,
				background: display.background,
				speakingStyle: display.speakingStyle,
				greeting: display.greeting,
				exampleTurns: this.agentService.exampleTurnsFromStored(display.exampleDialogue),
				forbiddenBehavior: display.forbiddenBehavior,
				isPublished: row.isPublished,
				...(isOwner ? { reviewStatus: row.reviewStatus, publishedVersion: row.publishedVersion } : {}),
				avatarFileId: display.avatarFileId,
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString(),
			};
		});
	}
}
