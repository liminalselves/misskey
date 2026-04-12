/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCharactersRepository, AgentMessagesRepository, AgentSessionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentPlazaReviewService } from '@/core/AgentPlazaReviewService.js';
import { batchCommunityAssistantReplyCountByCharacterIds } from '@/core/agent-plaza-display-stats.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:chat',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: { type: 'string', format: 'misskey:id' },
			userId: { type: 'string', format: 'misskey:id' },
			name: { type: 'string' },
			summary: { type: 'string', nullable: true },
			avatarFileId: { type: 'string', format: 'misskey:id', nullable: true },
			publishedVersion: { type: 'integer', nullable: true, optional: true },
			createdAt: { type: 'string', format: 'date-time' },
			updatedAt: { type: 'string', format: 'date-time' },
			promptStats: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					personalityChars: { type: 'number' },
					backgroundChars: { type: 'number' },
					speakingStyleChars: { type: 'number' },
					greetingChars: { type: 'number' },
					exampleTurnCount: { type: 'number' },
					exampleDialogueChars: { type: 'number' },
					forbiddenChars: { type: 'number' },
					totalChars: { type: 'number' },
				},
				required: ['personalityChars', 'backgroundChars', 'speakingStyleChars', 'greetingChars', 'exampleTurnCount', 'exampleDialogueChars', 'forbiddenChars', 'totalChars'],
			},
			rating: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					average: { type: 'number', nullable: true },
					count: { type: 'number' },
				},
				required: ['average', 'count'],
			},
			myReview: {
				type: 'object',
				nullable: true,
				optional: true,
				properties: {
					noteId: { type: 'string', format: 'misskey:id' },
					stars: { type: 'integer' },
				},
				required: ['noteId', 'stars'],
			},
			/** 广场「开始聊天」创建的 community 会话数（每次新建会话 +1） */
			conversationCount: { type: 'integer', optional: false, nullable: false },
			/** community 会话内 role=assistant のメッセージ総数（AI 返信回数） */
			aiReplyCount: { type: 'integer', optional: false, nullable: false },
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

		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		private agentService: AgentService,
		private agentPlazaReviewService: AgentPlazaReviewService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentCharactersRepository.findOneBy({ id: ps.characterId });
			if (!row) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: 'e1f2a3b4-c5d6-7890-4567-901234567890' });
			}
			if (row.userId !== me.id && !this.agentService.isListedOnPlazaCharacter(row)) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: 'f2a3b4c5-d6e7-8901-5678-012345678901' });
			}
			const d = this.agentService.characterPlazaDisplayFields(row);
			const promptStats = this.agentPlazaReviewService.characterPromptStatsFromRow(row);
			const [conversationCount, aiReplyMap, rating, mine] = await Promise.all([
				this.agentSessionsRepository.count({ where: { characterId: row.id, sessionKind: 'community' } }),
				batchCommunityAssistantReplyCountByCharacterIds(this.agentMessagesRepository, [row.id]),
				this.agentPlazaReviewService.getRatingAggregate({ characterId: ps.characterId }),
				this.agentPlazaReviewService.findMyReview(me.id, { characterId: ps.characterId }),
			]);
			const aiReplyCount = aiReplyMap.get(row.id) ?? 0;
			return {
				id: row.id,
				userId: row.userId,
				name: d.name,
				summary: d.summary,
				avatarFileId: d.avatarFileId,
				...(row.publishedVersion != null ? { publishedVersion: row.publishedVersion } : {}),
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString(),
				promptStats,
				conversationCount,
				aiReplyCount,
				rating: { average: rating.average, count: rating.count },
				...(mine ? { myReview: { noteId: mine.noteId, stars: mine.stars } } : {}),
			};
		});
	}
}
