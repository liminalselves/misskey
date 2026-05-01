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

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:chat',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			willInvalidateCompression: { type: 'boolean' },
			historyBudgetTokensBefore: { type: 'number' },
			historyBudgetTokensAfter: { type: 'number' },
			stickyCount: { type: 'number' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		agentModelId: { type: 'string', nullable: true, maxLength: 64 },
	},
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
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!row || row.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'a1a1a1a1-b2b2-b2b2-b2b2-111111111111' });
			}
			if (!row.dialogueStyleId) {
				return {
					willInvalidateCompression: false,
					historyBudgetTokensBefore: 0,
					historyBudgetTokensAfter: 0,
					stickyCount: 0,
				};
			}
			const characterRow = await this.agentCharactersRepository.findOneByOrFail({ id: row.characterId });
			this.agentService.assertAgentUserSessionChatAllowed(characterRow, row);
			const styleRow = await this.agentDialogueStylesRepository.findOneByOrFail({ id: row.dialogueStyleId });
			const usePublished = row.sessionKind === 'community';
			const character = this.agentService.effectiveCharacterForLlm(characterRow, usePublished);
			const style = this.agentService.effectiveStyleForLlm(styleRow, usePublished);
			const instanceMeta = await this.metaService.fetch(true);
			const newMid = ps.agentModelId === undefined || ps.agentModelId === '' ? null : ps.agentModelId;
			if (newMid) {
				this.agentService.resolveModelApiName(instanceMeta, newMid);
			}
			const r = await this.agentCompressionMemoryService.previewModelChangeForCompression({
				session: row,
				newAgentModelId: newMid,
				instanceMeta,
				character,
				style,
			});
			if (!r.compressionProvider) {
				return {
					willInvalidateCompression: false,
					historyBudgetTokensBefore: this.agentService.approxLlmTokensFromCharEstimate(r.historyBudgetBefore),
					historyBudgetTokensAfter: this.agentService.approxLlmTokensFromCharEstimate(r.historyBudgetAfter),
					stickyCount: r.stickyCount,
				};
			}
			return {
				willInvalidateCompression: r.willInvalidateCompression,
				historyBudgetTokensBefore: this.agentService.approxLlmTokensFromCharEstimate(r.historyBudgetBefore),
				historyBudgetTokensAfter: this.agentService.approxLlmTokensFromCharEstimate(r.historyBudgetAfter),
				stickyCount: r.stickyCount,
			};
		});
	}
}
