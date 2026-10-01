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
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { loadSessionForReview } from './_utils.js';

function referenceImageFileIdsOf(character: { referenceImageFileIds?: unknown; referenceImageFileId?: string | null }): string[] {
	const raw = Array.isArray(character.referenceImageFileIds)
		? character.referenceImageFileIds
		: character.referenceImageFileId ? [character.referenceImageFileId] : [];
	return [...new Set(raw.filter((id): id is string => typeof id === 'string' && id !== ''))].slice(0, 5);
}

// 镜像 agents/characters/show：以会话属主为"查看者"（isOwner 按属主判定），
// 保证审查页看到的角色信息与用户自己打开会话页时一致。
export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 180 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		additionalProperties: true,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		characterId: { type: 'string', format: 'misskey:id' },
	},
	required: ['sessionId', 'characterId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		private agentService: AgentService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();
			const session = await loadSessionForReview(this.agentSessionsRepository, ps.sessionId);
			const row = await this.agentCharactersRepository.findOneBy({ id: ps.characterId });
			if (!row) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: '0f5772e2-9ab3-45f5-b6ee-97a950e6a722' });
			}
			const isOwner = row.userId === session.userId;
			const display = isOwner ? row : this.agentService.effectiveCharacterForLlm(row, true);
			const avatar = display.avatarFileId
				? await this.driveFileEntityService.pack(display.avatarFileId, {})
					.catch(() => null)
				: null;
			const referenceImageFileIds = referenceImageFileIdsOf(display);
			const referenceImages = (await Promise.all(referenceImageFileIds.map(fileId => this.driveFileEntityService.pack(fileId, {})
				.catch(() => null)))).filter((file): file is NonNullable<typeof file> => file != null);
			// 与用户侧同规则：非作者仅在开源提示词时可见提示词类内容
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
				regexRules: this.agentService.normalizeRegexRules(display.regexRules),
				rules: exposePrompt
					? this.agentService.normalizeRules(display.rules)
					: this.agentService.normalizeRules(display.rules).map(({ content, ...meta }) => meta),
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
				...((isOwner || row.promptOpenSourced === true) ? {
					stickers: (await Promise.all((Array.isArray(display.stickers) ? display.stickers : []).map(async sticker => ({
						key: sticker.key,
						description: sticker.description,
						file: await this.driveFileEntityService.pack(sticker.fileId, {}).catch(() => null),
					})))).filter(sticker => sticker.file != null),
				} : {}),
				promptOpenSourced: row.promptOpenSourced === true,
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString(),
			};
		});
	}
}
