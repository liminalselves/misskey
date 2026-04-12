/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentDialogueStylesRepository, AgentMessagesRepository, AgentSessionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentPlazaReviewService } from '@/core/AgentPlazaReviewService.js';
import {
	batchCommunityAssistantReplyCountByStyleIds,
	batchCommunitySessionCountByStyleIds,
} from '@/core/agent-plaza-display-stats.js';

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
			bodyChars: { type: 'number' },
			publishedVersion: { type: 'integer', nullable: true, optional: true },
			createdAt: { type: 'string', format: 'date-time' },
			updatedAt: { type: 'string', format: 'date-time' },
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
			/** community セッションで当該会話スタイルを選んだ回数 */
			conversationCount: { type: 'integer', optional: false, nullable: false },
			/** community セッション内の assistant メッセージ数（AI 返信回数） */
			aiReplyCount: { type: 'integer', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { styleId: { type: 'string', format: 'misskey:id' } },
	required: ['styleId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		private agentService: AgentService,
		private agentPlazaReviewService: AgentPlazaReviewService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentDialogueStylesRepository.findOneBy({ id: ps.styleId });
			if (!row) {
				throw new ApiError({ message: 'No such style.', code: 'NO_SUCH_STYLE', id: 'c5d6e7f8-a9b0-1234-8901-345678901234' });
			}
			if (row.userId !== me.id && !this.agentService.isListedOnPlazaStyle(row)) {
				throw new ApiError({ message: 'No such style.', code: 'NO_SUCH_STYLE', id: 'd6e7f8a9-b0c1-2345-9012-456789012345' });
			}
			const d = this.agentService.stylePlazaDisplayFields(row);
			const bodyChars = this.agentPlazaReviewService.styleBodyCharCount(row);
			const [rating, mine, convMap, aiReplyMap] = await Promise.all([
				this.agentPlazaReviewService.getRatingAggregate({ styleId: ps.styleId }),
				this.agentPlazaReviewService.findMyReview(me.id, { styleId: ps.styleId }),
				batchCommunitySessionCountByStyleIds(this.agentSessionsRepository, [row.id]),
				batchCommunityAssistantReplyCountByStyleIds(this.agentMessagesRepository, [row.id]),
			]);
			const conversationCount = convMap.get(row.id) ?? 0;
			const aiReplyCount = aiReplyMap.get(row.id) ?? 0;
			return {
				id: row.id,
				userId: row.userId,
				name: d.name,
				summary: d.summary,
				bodyChars,
				...(row.publishedVersion != null ? { publishedVersion: row.publishedVersion } : {}),
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString(),
				rating: { average: rating.average, count: rating.count },
				conversationCount,
				aiReplyCount,
				...(mine ? { myReview: { noteId: mine.noteId, stars: mine.stars } } : {}),
			};
		});
	}
}
