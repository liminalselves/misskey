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
import { AgentService, AGENT_TEXT_FIELD_MAX, AGENT_EXAMPLE_TURN_CONTENT_MAX, AGENT_RULE_MAX, AGENT_RULE_NAME_MAX, AGENT_RULE_DESC_MAX, type AgentWorldbookEntry } from '@/core/AgentService.js';

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
		worldbook: {
			type: 'array',
			nullable: true,
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', minLength: 1, maxLength: 128 },
					title: { type: 'string', minLength: 1, maxLength: 128 },
					content: { type: 'string', maxLength: AGENT_TEXT_FIELD_MAX },
					keywords: {
						type: 'array',
						items: { type: 'string', minLength: 1, maxLength: 64 },
						maxItems: 32,
					},
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
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: '72c74cc7-ed2e-48e5-952d-27233545bf22' });
			}
			// 审核中的草稿必须冻结：否则作者可在审核员通过前替换内容，导致发布内容与审核所见不一致
			if (row.reviewStatus === 'pending') {
				throw new ApiError({
					message: 'This character is pending review and cannot be edited. Withdraw the submission first.',
					code: 'AGENT_REVIEW_PENDING_LOCKED',
					id: 'b1d2e3f4-a5b6-4789-bcde-f234567890a1',
				});
			}
			if (ps.avatarFileId) {
				const f = await this.driveFilesRepository.findOneBy({ id: ps.avatarFileId, userId: me.id });
				if (!f) {
					throw new ApiError({ message: 'No such file.', code: 'NO_SUCH_FILE', id: '61ff62dd-58c8-4dbb-a7a2-3e7a2eb6fd7b' });
				}
			}
			const referenceImageFileIds = ps.referenceImageFileIds !== undefined
				? [...new Set(ps.referenceImageFileIds ?? [])].slice(0, 4)
				: ps.referenceImageFileId !== undefined ? (ps.referenceImageFileId ? [ps.referenceImageFileId] : []) : null;
			for (const referenceImageFileId of referenceImageFileIds ?? []) {
				const f = await this.driveFilesRepository.findOneBy({ id: referenceImageFileId, userId: me.id });
				if (!f || !f.type.startsWith('image/') || f.size > 5 * 1024 * 1024) {
					throw new ApiError({ message: 'Each reference image must be an image up to 5 MiB from your Drive.', code: 'INVALID_REFERENCE_IMAGE', id: 'd04b0a9b-a4e1-49a0-b9db-5e2e4aa9dd84' });
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
			if (ps.worldbook !== undefined) row.worldbook = (ps.worldbook ?? []).map((entry): AgentWorldbookEntry => ({
				id: entry.id,
				title: entry.title,
				content: entry.content,
				keywords: entry.keywords,
				triggerMode: entry.triggerMode,
				priority: entry.priority,
				enabled: entry.enabled,
				revision: entry.revision,
			}));
			if (ps.regexRules !== undefined) row.regexRules = this.agentService.normalizeRegexRules(ps.regexRules);
			if (ps.rules !== undefined) row.rules = this.agentService.normalizeRules(ps.rules);
			if (ps.avatarFileId !== undefined) row.avatarFileId = ps.avatarFileId;
			if (referenceImageFileIds != null) {
				row.referenceImageFileIds = referenceImageFileIds;
				row.referenceImageFileId = referenceImageFileIds[0] ?? null;
			}
			if (ps.promptOpenSourced !== undefined) row.promptOpenSourced = ps.promptOpenSourced === true;
			row.draftRevision = (row.draftRevision ?? 1) + 1;
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
