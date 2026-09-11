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
import { AgentService, AGENT_TEXT_FIELD_MAX, AGENT_EXAMPLE_TURN_CONTENT_MAX, AGENT_RULE_MAX, AGENT_RULE_NAME_MAX, AGENT_RULE_DESC_MAX } from '@/core/AgentService.js';
import { AgentStickerService } from '@/core/AgentStickerService.js';

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
		worldbook: {
			type: 'array',
			nullable: true,
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', minLength: 1, maxLength: 128 },
					title: { type: 'string', minLength: 1, maxLength: 128 },
					content: { type: 'string', maxLength: AGENT_TEXT_FIELD_MAX },
					keywords: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 64 }, maxItems: 32 },
					triggerMode: { type: 'string', enum: ['keyword', 'manual', 'always'] },
					priority: { type: 'integer', minimum: 0, maximum: 9999 },
					enabled: { type: 'boolean' },
					revision: { type: 'integer', minimum: 1 },
				},
				required: ['id', 'title', 'content', 'keywords', 'triggerMode', 'priority', 'enabled', 'revision'],
			},
			maxItems: 128,
		},
		regexRules: {
			type: 'array', maxItems: 64,
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', minLength: 1, maxLength: 128 },
					pattern: { type: 'string', minLength: 1, maxLength: 2000 },
					targets: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', enum: ['user', 'assistant'] } },
					effects: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', enum: ['hide', 'aiInvisible'] } },
				},
				required: ['id', 'pattern', 'targets', 'effects'],
			},
		},
		rules: {
			type: 'array',
			nullable: true,
			maxItems: AGENT_RULE_MAX,
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', minLength: 1, maxLength: 128 },
					name: { type: 'string', minLength: 1, maxLength: AGENT_RULE_NAME_MAX },
					content: { type: 'string', minLength: 1, maxLength: AGENT_TEXT_FIELD_MAX },
					disabledContent: { type: 'string', maxLength: AGENT_TEXT_FIELD_MAX },
					description: { type: 'string', maxLength: AGENT_RULE_DESC_MAX },
					type: { type: 'string', enum: ['persistent', 'toggleable'] },
					defaultEnabled: { type: 'boolean' },
				},
				required: ['id', 'name', 'content', 'description', 'type', 'defaultEnabled'],
			},
		},
		avatarFileId: { type: 'string', format: 'misskey:id', nullable: true },
		referenceImageFileId: { type: 'string', format: 'misskey:id', nullable: true },
		referenceImageFileIds: { type: 'array', nullable: true, maxItems: 4, items: { type: 'string', format: 'misskey:id' } },
		stickers: {
			type: 'array', nullable: true, maxItems: 50,
			items: {
				type: 'object',
				properties: {
					key: { type: 'string', minLength: 1, maxLength: 32, pattern: '^[a-zA-Z0-9_-]+$' },
					fileId: { type: 'string', format: 'misskey:id' },
					description: { type: 'string', minLength: 1, maxLength: 200 },
				},
				required: ['key', 'fileId', 'description'],
			},
		},
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

		private agentStickerService: AgentStickerService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();

			const stickers = await this.agentStickerService.validateCharacterStickersForOwner(ps.stickers ?? [], me.id);
			if (ps.avatarFileId) {
				const f = await this.driveFilesRepository.findOneBy({ id: ps.avatarFileId, userId: me.id });
				if (!f) {
					throw new ApiError({ message: 'No such file.', code: 'NO_SUCH_FILE', id: '1866aaac-36e5-430a-94db-7eb8b2278b2c' });
				}
			}
			const referenceImageFileIds = [...new Set(
				ps.referenceImageFileIds ?? (ps.referenceImageFileId ? [ps.referenceImageFileId] : []),
			)].slice(0, 4);
			for (const referenceImageFileId of referenceImageFileIds) {
				const f = await this.driveFilesRepository.findOneBy({ id: referenceImageFileId, userId: me.id });
				if (!f || !f.type.startsWith('image/') || f.size > 5 * 1024 * 1024) {
					throw new ApiError({ message: 'Each reference image must be an image up to 5 MiB from your Drive.', code: 'INVALID_REFERENCE_IMAGE', id: '7bd424d8-4205-4a5d-a23e-0bfdf3294b65' });
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
				worldbook: ps.worldbook ?? [],
				regexRules: this.agentService.normalizeRegexRules(ps.regexRules),
				rules: this.agentService.normalizeRules(ps.rules),
				draftRevision: 1,
				isPublished: false,
				reviewStatus: 'draft',
				publishedVersion: null,
				publishedSnapshot: null,
				avatarFileId: ps.avatarFileId ?? null,
				referenceImageFileId: referenceImageFileIds[0] ?? null,
				referenceImageFileIds,
				stickers,
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
