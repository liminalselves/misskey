/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type {
	AgentCharactersRepository,
	AgentDialogueStylesRepository,
	AgentSessionsRepository,
} from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentCompressionMemoryService, AGENT_OVERVIEW_SCAN_LIMIT } from '@/core/AgentCompressionMemoryService.js';
import { AgentTokenService } from '@/core/AgentTokenService.js';
import { MetaService } from '@/core/MetaService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:chat',
	limit: { duration: ms('1hour'), max: 180 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			maxContextTokens: { type: 'number' },
			historyBudgetTokens: { type: 'number' },
			truncated: { type: 'boolean' },
			oldestIncludedMessageId: { type: 'string', format: 'misskey:id', nullable: true },
			tokenMode: { type: 'string', optional: true, nullable: false },
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
		private agentCompressionMemoryService: AgentCompressionMemoryService,
		private agentTokenService: AgentTokenService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'c1d2e3f4-a5b6-7890-cdef-123456789abc' });
			}

			const characterRow = await this.agentCharactersRepository.findOneByOrFail({ id: session.characterId });
			if (!session.dialogueStyleId) {
				return {
					maxContextTokens: 8192,
					historyBudgetTokens: this.agentService.approxLlmTokensFromCharEstimate(200_000),
					truncated: false,
					oldestIncludedMessageId: null,
					tokenMode: 'estimate' as const,
				};
			}
			const styleRow = await this.agentDialogueStylesRepository.findOneByOrFail({ id: session.dialogueStyleId });

			await this.agentService.assertCanUseDialogueStyle(me.id, styleRow, {
				forNewSession: false,
				sessionDialogueStyleId: session.dialogueStyleId,
			});

			try {
				this.agentService.assertSessionCharacterPolicy({
					sessionKind: session.sessionKind,
					character: characterRow,
					userId: me.id,
				});
			} catch {
				throw new ApiError({ message: 'Forbidden.', code: 'FORBIDDEN', id: 'd2e3f4a5-b6c7-8901-def0-234567890bcd' });
			}

			if (session.sessionKind === 'community') {
				if (!this.agentService.isListedOnPlazaStyle(styleRow)) {
					throw new ApiError({ message: 'Style is not published.', code: 'STYLE_NOT_PUBLISHED', id: 'e3f4a5b6-c7d8-9012-ef01-345678901cde' });
				}
			}

			const instanceMeta = await this.metaService.fetch(true);
			this.agentService.assertLlmConfigured(instanceMeta);

			const usePublishedFace = session.sessionKind === 'community';
			const character = this.agentService.effectiveCharacterForLlm(characterRow, usePublishedFace);
			const style = this.agentService.effectiveStyleForLlm(styleRow, usePublishedFace);

			// 与发信路径、压缩区带使用同一 H，确保分割线位置与实际上下文窗口完全对齐
			const longMemProvider = this.agentCompressionMemoryService.resolveEffectiveProvider(
				session.agentLongMemoryProvider,
				instanceMeta,
			);
			const { maxContextTokens, historyBudget: historyBudgetChars, charsPerToken, historyBudgetTokens } = this.agentCompressionMemoryService.buildSendPathBudgets({
				instanceMeta,
				session,
				character,
				style,
				provider: longMemProvider,
			});

			// 统一经 AgentTokenService 解析编码与计数器；分割线按 token 口径截断，与消息分段区带同源
			const tokenConfig = this.agentTokenService.resolveTokenConfig(instanceMeta, session.agentModelId ?? instanceMeta.agentDefaultModelId);
			const counter = this.agentTokenService.makeCounter(tokenConfig);
			const { truncated, oldestIncludedId } = await this.agentService.loadRecentMessagesForContextWithMeta(
				session.id,
				historyBudgetChars,
				AGENT_OVERVIEW_SCAN_LIMIT,
				{ exactTokenCounter: counter, tokenBudget: historyBudgetTokens, charsPerToken },
			);

			return {
				maxContextTokens,
				historyBudgetTokens,
				truncated,
				oldestIncludedMessageId: oldestIncludedId,
				tokenMode: tokenConfig.tokenMode,
			};
		});
	}
}
