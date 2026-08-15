/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCharactersRepository, AgentDialogueStylesRepository, AgentSessionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { MetaService } from '@/core/MetaService.js';
import { AgentCompressionMemoryService } from '@/core/AgentCompressionMemoryService.js';
import { AgentTokenService } from '@/core/AgentTokenService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:chat',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			historyBudgetTokens: { type: 'number' },
			t1Tokens: { type: 'number' },
			t2Tokens: { type: 'number' },
			t1Ratio: { type: 'number' },
			t2Ratio: { type: 'number' },
			tokenMode: { type: 'string', optional: true, nullable: false },
			messages: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						role: { type: 'string' },
						messageTokens: { type: 'number' },
						dFromNewTokens: { type: 'number' },
						band: { type: 'string' },
						contentPreview: { type: 'string' },
						tokensEstimated: { type: 'boolean' },
						compressed: { type: 'boolean' },
					},
				},
			},
			stickies: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						createdAt: { type: 'string' },
						updatedAt: { type: 'string' },
						fromMessageId: { type: 'string' },
						toMessageId: { type: 'string' },
						summaryText: { type: 'string' },
						state: { type: 'string' },
						userOverridden: { type: 'boolean' },
						sourceFingerprint: { type: 'string', nullable: true },
						errorMessage: { type: 'string', nullable: true },
						lastModelId: { type: 'string', nullable: true },
						sortIndex: { type: 'number' },
						fromMessagePreview: { type: 'string' },
						toMessagePreview: { type: 'string' },
					},
				},
			},
			compressionSidecarFailedAt: { type: 'string', nullable: true },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { sessionId: { type: 'string', format: 'misskey:id' } },
	required: ['sessionId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,
		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,
		private agentService: AgentService,
		private metaService: MetaService,
		private agentCompressionMemoryService: AgentCompressionMemoryService,
		private agentTokenService: AgentTokenService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!row || row.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: '775235f7-4ecd-4dbf-9dda-1f020b8b8bac' });
			}
			if (!row.dialogueStyleId) {
				return {
					historyBudgetTokens: 0,
					t1Tokens: 0,
					t2Tokens: 0,
					t1Ratio: AgentCompressionMemoryService.DEFAULT_COMPRESSION_BAND_T1_RATIO,
					t2Ratio: AgentCompressionMemoryService.DEFAULT_COMPRESSION_BAND_T2_RATIO,
					messages: [],
					stickies: [],
					compressionSidecarFailedAt: null,
				};
			}
			const characterRow = await this.agentCharactersRepository.findOneByOrFail({ id: row.characterId });
			this.agentService.assertAgentUserSessionChatAllowed(characterRow, row);
			const styleRow = await this.agentDialogueStylesRepository.findOneByOrFail({ id: row.dialogueStyleId });
			const usePublished = row.sessionKind === 'community';
			const character = this.agentService.effectiveCharacterForLlm(characterRow, usePublished);
			const style = this.agentService.effectiveStyleForLlm(styleRow, usePublished);
			const instanceMeta = await this.metaService.fetch(true);
			const longMemProvider = this.agentCompressionMemoryService.resolveEffectiveProvider(
				row.agentLongMemoryProvider,
				instanceMeta,
			);
			/** 与 `agents/messages/send`、`reconcileStickyStates` 同一 H，避免总览区带与便签态/自动压条错位 */
			const { historyBudget: historyBudgetChars, charsPerToken, historyBudgetTokens } = await this.agentCompressionMemoryService.buildSendPathBudgets({
				instanceMeta,
				session: row,
				character,
				style,
				provider: longMemProvider,
			});
			const { t1Ratio, t2Ratio } = this.agentCompressionMemoryService.resolveCompressionBandRatios(instanceMeta);
			// 统一经 AgentTokenService 解析编码与计数器（收敛此前重复的 getEffectiveLlmModels().find() 逻辑）
			const tokenConfig = await this.agentTokenService.resolveTokenConfigForUser(instanceMeta, row.agentModelId ?? instanceMeta.agentDefaultModelId, row.userId);
			const exactCounter = this.agentTokenService.makeCounter(tokenConfig);
			const { historyBudgetTokens: hbt, t1Tokens, t2Tokens, messages, stickies, compressionSidecarFailedAt } = await this.agentCompressionMemoryService.getCompressionOverviewData(
				row.id,
				historyBudgetChars,
				t1Ratio,
				t2Ratio,
				longMemProvider === 'compression',
				exactCounter,
				charsPerToken,
				historyBudgetTokens,
				row.timeAwarenessEnabled === true,
			);
			return {
				historyBudgetTokens: hbt,
				t1Tokens,
				t2Tokens,
				t1Ratio,
				t2Ratio,
				tokenMode: tokenConfig.tokenMode,
				messages,
				stickies: stickies.map(r => ({
					id: r.id,
					createdAt: r.createdAt.toISOString(),
					updatedAt: r.updatedAt.toISOString(),
					fromMessageId: r.fromMessageId,
					toMessageId: r.toMessageId,
					summaryText: r.summaryText,
					state: r.state,
					userOverridden: r.userOverridden,
					sourceFingerprint: r.sourceFingerprint,
					errorMessage: r.errorMessage,
					lastModelId: r.lastModelId,
					sortIndex: r.sortIndex,
					fromMessagePreview: (r as { fromMessagePreview?: string }).fromMessagePreview ?? '…',
					toMessagePreview: (r as { toMessagePreview?: string }).toMessagePreview ?? '…',
				})),
				compressionSidecarFailedAt,
			};
		});
	}
}
