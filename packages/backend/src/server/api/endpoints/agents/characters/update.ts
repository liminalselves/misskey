/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCharactersRepository, DriveFilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService, AGENT_TEXT_FIELD_MAX, AGENT_EXAMPLE_TURN_CONTENT_MAX } from '@/core/AgentService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 60 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: { type: 'string', format: 'misskey:id' },
			name: { type: 'string' },
			summary: { type: 'string', nullable: true },
			isPublished: { type: 'boolean' },
			updatedAt: { type: 'string', format: 'date-time' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		characterId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1, maxLength: 256 },
		summary: { type: 'string', nullable: true, maxLength: 512 },
		personality: { type: 'string', maxLength: AGENT_TEXT_FIELD_MAX },
		background: { type: 'string', maxLength: AGENT_TEXT_FIELD_MAX },
		speakingStyle: { type: 'string', maxLength: AGENT_TEXT_FIELD_MAX },
		greeting: { type: 'string', maxLength: AGENT_TEXT_FIELD_MAX },
		exampleTurns: {
			type: 'array',
			nullable: true,
			maxItems: 24,
			items: {
				type: 'object',
				properties: {
					role: { type: 'string', enum: ['user', 'assistant'] },
					content: { type: 'string', maxLength: AGENT_EXAMPLE_TURN_CONTENT_MAX },
				},
				required: ['role', 'content'],
			},
		},
		forbiddenBehavior: { type: 'string', maxLength: AGENT_TEXT_FIELD_MAX },
		avatarFileId: { type: 'string', format: 'misskey:id', nullable: true },
		promptOpenSourced: { type: 'boolean' },
	},
	required: ['characterId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentCharactersRepository.findOneBy({ id: ps.characterId });
			if (!row || row.userId !== me.id) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: 'f6a7b8c9-d0e1-2345-f012-456789012345' });
			}
			if (ps.avatarFileId) {
				const f = await this.driveFilesRepository.findOneBy({ id: ps.avatarFileId, userId: me.id });
				if (!f) {
					throw new ApiError({ message: 'No such file.', code: 'NO_SUCH_FILE', id: 'a7b8c9d0-e1f2-3456-0123-567890123456' });
				}
			}

			if (ps.name !== undefined) row.name = ps.name;
			if (ps.summary !== undefined) row.summary = ps.summary;
			if (ps.personality !== undefined) row.personality = ps.personality;
			if (ps.background !== undefined) row.background = ps.background;
			if (ps.speakingStyle !== undefined) row.speakingStyle = ps.speakingStyle;
			if (ps.greeting !== undefined) row.greeting = ps.greeting;
			if (ps.exampleTurns !== undefined) {
				const turns = ps.exampleTurns != null
					? this.agentService.validateExampleTurnsOrThrow(ps.exampleTurns)
					: [];
				row.exampleDialogue = this.agentService.serializeExampleTurns(turns);
			}
			if (ps.forbiddenBehavior !== undefined) row.forbiddenBehavior = ps.forbiddenBehavior;
			if (ps.avatarFileId !== undefined) row.avatarFileId = ps.avatarFileId;
			if (ps.promptOpenSourced !== undefined) row.promptOpenSourced = ps.promptOpenSourced === true;
			row.updatedAt = new Date();
			await this.agentCharactersRepository.save(row);

			return {
				id: row.id,
				name: row.name,
				summary: row.summary,
				isPublished: row.isPublished,
				updatedAt: row.updatedAt.toISOString(),
			};
		});
	}
}
