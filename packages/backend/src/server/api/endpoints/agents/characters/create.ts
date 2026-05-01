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

	limit: { duration: ms('1hour'), max: 30 },

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: { type: 'string', format: 'misskey:id' },
			name: { type: 'string' },
			summary: { type: 'string', nullable: true },
			isPublished: { type: 'boolean' },
			createdAt: { type: 'string', format: 'date-time' },
			updatedAt: { type: 'string', format: 'date-time' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
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
	required: ['name'],
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

			if (ps.avatarFileId) {
				const f = await this.driveFilesRepository.findOneBy({ id: ps.avatarFileId, userId: me.id });
				if (!f) {
					throw new ApiError({ message: 'No such file.', code: 'NO_SUCH_FILE', id: 'e5f6a7b8-c9d0-1234-ef01-345678901234' });
				}
			}

			const exampleTurns = ps.exampleTurns != null
				? this.agentService.validateExampleTurnsOrThrow(ps.exampleTurns)
				: [];
			const now = new Date();
			const row = await this.agentCharactersRepository.insertOne({
				id: this.agentService.newId(),
				createdAt: now,
				updatedAt: now,
				userId: me.id,
				name: ps.name,
				summary: ps.summary ?? null,
				personality: ps.personality ?? '',
				background: ps.background ?? '',
				speakingStyle: ps.speakingStyle ?? '',
				greeting: ps.greeting ?? '',
				exampleDialogue: this.agentService.serializeExampleTurns(exampleTurns),
				forbiddenBehavior: ps.forbiddenBehavior ?? '',
				isPublished: false,
				reviewStatus: 'draft',
				publishedVersion: null,
				publishedSnapshot: null,
				avatarFileId: ps.avatarFileId ?? null,
				promptOpenSourced: ps.promptOpenSourced === true,
			});

			return {
				id: row.id,
				name: row.name,
				summary: row.summary,
				isPublished: row.isPublished,
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString(),
			};
		});
	}
}
