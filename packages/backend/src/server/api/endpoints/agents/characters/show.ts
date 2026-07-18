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
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';

function referenceImageFileIdsOf(character: { referenceImageFileIds?: unknown; referenceImageFileId?: string | null }): string[] {
	const raw = Array.isArray(character.referenceImageFileIds)
		? character.referenceImageFileIds
		: character.referenceImageFileId ? [character.referenceImageFileId] : [];
	return [...new Set(raw.filter((id): id is string => typeof id === 'string' && id !== ''))].slice(0, 4);
}

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
			worldbook: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string', minLength: 1, maxLength: 128 },
						title: { type: 'string' },
						content: { type: 'string' },
						keywords: { type: 'array', items: { type: 'string' } },
						triggerMode: { type: 'string' },
						priority: { type: 'integer' },
						enabled: { type: 'boolean' },
						revision: { type: 'integer' },
					},
					required: ['id', 'title', 'content', 'keywords', 'triggerMode', 'priority', 'enabled', 'revision'],
				},
			},
			regexRules: {
				type: 'array',
				items: { type: 'object' },
			},
			isPublished: { type: 'boolean' },
			reviewStatus: { type: 'string', optional: true },
			publishedVersion: { type: 'integer', nullable: true, optional: true },
			reviewRejectReason: { type: 'string', nullable: true, optional: true },
			reviewRejectMessage: { type: 'string', nullable: true, optional: true },
			draftRevision: { type: 'integer' },
			avatarFileId: { type: 'string', format: 'misskey:id', nullable: true },
			avatar: { type: 'object', ref: 'DriveFile', nullable: true },
			referenceImageFileId: { type: 'string', format: 'misskey:id', nullable: true },
			referenceImage: { type: 'object', ref: 'DriveFile', nullable: true },
			referenceImageFileIds: { type: 'array', items: { type: 'string', format: 'misskey:id' } },
			referenceImages: { type: 'array', items: { type: 'object', ref: 'DriveFile' } },
			promptOpenSourced: { type: 'boolean' },
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
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentCharactersRepository.findOneBy({ id: ps.characterId });
			if (!row) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: '4252d940-076b-4aa4-9a86-837ba0a71f8a' });
			}
			const isOwner = row.userId === me.id;
			if (!isOwner && !this.agentService.isListedOnPlazaCharacter(row)) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: 'c4c3e7fa-44ae-4389-8e76-007888f34739' });
			}
			const display = isOwner ? row : this.agentService.effectiveCharacterForLlm(row, true);
			const avatar = display.avatarFileId
				? await this.driveFileEntityService.pack(display.avatarFileId, {})
					.catch(() => null)
				: null;
			const referenceImageFileIds = referenceImageFileIdsOf(display);
			const referenceImages = (await Promise.all(referenceImageFileIds.map(fileId => this.driveFileEntityService.pack(fileId, {})
				.catch(() => null)))).filter((file): file is NonNullable<typeof file> => file != null);
			// Non-authors only receive summary fields unless the author has open-sourced the prompt.
			const exposePrompt = isOwner || row.promptOpenSourced === true;
			const worldbook = exposePrompt
				? (Array.isArray(display.worldbook) ? display.worldbook : []).flatMap((entry): Array<{
					id: string;
					title: string;
					content: string;
					keywords: string[];
					triggerMode: string;
					priority: number;
					enabled: boolean;
					revision: number;
				}> => {
					if (!entry || typeof entry !== 'object') return [];
					const e = entry as Record<string, unknown>;
					if (typeof e.id !== 'string') return [];
					return [{
						id: e.id,
						title: typeof e.title === 'string' ? e.title : '',
						content: typeof e.content === 'string' ? e.content : '',
						keywords: Array.isArray(e.keywords) ? e.keywords.filter((keyword): keyword is string => typeof keyword === 'string') : [],
						triggerMode: typeof e.triggerMode === 'string' ? e.triggerMode : 'keyword',
						priority: typeof e.priority === 'number' ? e.priority : 0,
						enabled: e.enabled !== false,
						revision: typeof e.revision === 'number' ? e.revision : 1,
					}];
				})
				: [];
			return {
				id: row.id,
				userId: row.userId,
				name: display.name,
				summary: display.summary,
				personality: exposePrompt ? display.personality : '',
				background: exposePrompt ? display.background : '',
				speakingStyle: exposePrompt ? display.speakingStyle : '',
				greeting: exposePrompt ? display.greeting : '',
				exampleTurns: exposePrompt ? this.agentService.exampleTurnsFromStored(display.exampleDialogue) : [],
				forbiddenBehavior: exposePrompt ? display.forbiddenBehavior : '',
				worldbook,
				// Regex rules are behavior configuration, not prompt prose; clients need them even when the prompt is private.
				regexRules: this.agentService.normalizeRegexRules(display.regexRules),
				isPublished: row.isPublished,
				...(isOwner ? {
					reviewStatus: row.reviewStatus,
					publishedVersion: row.publishedVersion,
					reviewRejectReason: row.reviewRejectReason,
					reviewRejectMessage: row.reviewRejectMessage,
					draftRevision: row.draftRevision,
				} : {}),
				avatarFileId: display.avatarFileId,
				avatar,
				referenceImageFileId: referenceImageFileIds[0] ?? null,
				referenceImage: referenceImages[0] ?? null,
				referenceImageFileIds,
				referenceImages,
				promptOpenSourced: row.promptOpenSourced === true,
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString(),
			};
		});
	}
}
