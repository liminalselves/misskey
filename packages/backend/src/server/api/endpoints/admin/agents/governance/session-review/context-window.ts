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
import { AgentService } from '@/core/AgentService.js';
import { AgentCompressionMemoryService, AGENT_OVERVIEW_SCAN_LIMIT } from '@/core/AgentCompressionMemoryService.js';
import { AgentTokenService } from '@/core/AgentTokenService.js';
import { MetaService } from '@/core/MetaService.js';
import { loadSessionForReview } from './_utils.js';

// 镜像 agents/sessions/context-window；跳过面向用户的文风/角色可用性断言
// （审查要能看到角色已下架等异常会话的上下文窗口）
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
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();
			const session = await loadSessionForReview(this.agentSessionsRepository, ps.sessionId);

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

			const instanceMeta = await this.metaService.fetch(true);
			this.agentService.assertLlmConfigured(instanceMeta);

			const usePublishedFace = session.sessionKind === 'community';
			const character = this.agentService.effectiveCharacterForLlm(characterRow, usePublishedFace);
			const style = this.agentService.effectiveStyleForSession(styleRow, session);

			// 与发信路径、压缩区带使用同一 H，确保分割线位置与实际上下文窗口完全对齐
			const longMemProvider = this.agentCompressionMemoryService.resolveEffectiveProvider(
				session.agentLongMemoryProvider,
				instanceMeta,
			);
			const { maxContextTokens, historyBudget: historyBudgetChars, charsPerToken, historyBudgetTokens } = await this.agentCompressionMemoryService.buildSendPathBudgets({
				instanceMeta,
				session,
				character,
				style,
				provider: longMemProvider,
			});

			const tokenConfig = await this.agentTokenService.resolveTokenConfigForUser(instanceMeta, session.agentModelId ?? instanceMeta.agentDefaultModelId, session.userId);
			const counter = this.agentTokenService.makeCounter(tokenConfig);
			const { truncated, oldestIncludedId } = await this.agentService.loadRecentMessagesForContextWithMeta(
				session.id,
				historyBudgetChars,
				AGENT_OVERVIEW_SCAN_LIMIT,
				{ exactTokenCounter: counter, tokenBudget: historyBudgetTokens, charsPerToken, timeAwarenessEnabled: session.timeAwarenessEnabled === true },
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
