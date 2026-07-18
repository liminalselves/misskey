/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type {
	AgentCharactersRepository,
	AgentDialogueStylesRepository,
	AgentMessagesRepository,
	AgentSessionsRepository,
} from '@/models/_.js';
import type { AgentSessionKind } from '@/models/AgentSession.js';
import { getActiveLlmModels } from '@/misc/agent-llm-models.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { MetaService } from '@/core/MetaService.js';

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
			characterId: { type: 'string', format: 'misskey:id' },
			dialogueStyleId: { type: 'string', format: 'misskey:id', nullable: true },
			sessionKind: { type: 'string', enum: ['draft_test', 'community'] },
			agentModelId: { type: 'string', nullable: true },
			createdAt: { type: 'string', format: 'date-time' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		characterId: { type: 'string', format: 'misskey:id' },
		dialogueStyleId: { type: 'string', format: 'misskey:id', nullable: true },
		sessionKind: { type: 'string', enum: ['draft_test', 'community'] },
		name: { type: 'string', maxLength: 256, nullable: true },
		agentModelId: { type: 'string', nullable: true, maxLength: 64 },
	},
	required: ['characterId', 'sessionKind'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		private agentService: AgentService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();

			const character = await this.agentCharactersRepository.findOneBy({ id: ps.characterId });
			if (!character) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: 'a9b0c1d2-e3f4-5678-2345-789012345678' });
			}
			this.agentService.assertAgentCharacterNotModerationBanned(character);

			const sessionKind = ps.sessionKind as AgentSessionKind;
			if (sessionKind === 'draft_test') {
				if (character.userId !== me.id) {
					throw new ApiError({ message: 'Forbidden.', code: 'FORBIDDEN', id: 'c1d2e3f4-a5b6-7890-4567-901234567890' });
				}
			} else {
				if (!this.agentService.isListedOnPlazaCharacter(character)) {
					throw new ApiError({ message: 'Character is not published.', code: 'CHARACTER_NOT_PUBLISHED', id: 'd2e3f4a5-b6c7-8901-5678-012345678901' });
				}
			}

			let styleId: string | null = null;
			const styleIdRaw = typeof ps.dialogueStyleId === 'string' ? ps.dialogueStyleId.trim() : '';
			if (styleIdRaw !== '') {
				const style = await this.agentDialogueStylesRepository.findOneBy({ id: styleIdRaw });
				if (!style) {
					throw new ApiError({ message: 'No such style.', code: 'NO_SUCH_STYLE', id: 'b0c1d2e3-f4a5-6789-3456-890123456789' });
				}
				await this.agentService.assertCanUseDialogueStyle(me.id, style, { forNewSession: true });
				if (sessionKind === 'community' && !this.agentService.isListedOnPlazaStyle(style)) {
					throw new ApiError({ message: 'Style is not published.', code: 'STYLE_NOT_PUBLISHED', id: 'e3f4a5b6-c7d8-9012-6789-123456789012' });
				}
				styleId = style.id;
			}

			const instanceMeta = await this.metaService.fetch(true);
			const eff = getActiveLlmModels(instanceMeta);
			const agentModelId = ps.agentModelId ?? instanceMeta.agentDefaultModelId ?? eff[0]?.id ?? null;
			if (agentModelId) {
				this.agentService.resolveModelApiName(instanceMeta, agentModelId);
			}

			/** 创建时快照：与当时 meta 的压缩默认、对话默认、主模型、可用列表顺序一致，写入会话列供后续独立变更 */
			const compressionIdCandidates = [
				instanceMeta.agentCompressionDefaultModelId,
				instanceMeta.agentDefaultModelId,
				agentModelId,
				...eff.map(m => m.id),
			].filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim());
			let agentCompressionModelId: string | null = null;
			for (const id of [...new Set(compressionIdCandidates)]) {
				try {
					this.agentService.resolveModelApiName(instanceMeta, id);
					agentCompressionModelId = id;
					break;
				} catch {
					// try next candidate
				}
			}

			const now = new Date();
			const row = await this.agentSessionsRepository.insertOne({
				id: this.agentService.newId(),
				createdAt: now,
				updatedAt: now,
				userId: me.id,
				name: (ps.name?.trim() || character.name).slice(0, 256),
				characterId: character.id,
				dialogueStyleId: styleId,
				plazaStatsDialogueStyleId: styleId,
				characterOwnerId: character.userId,
				sessionKind,
				agentModelId,
				agentVisionModelId: instanceMeta.agentVisionDefaultModelId ?? null,
				agentCompressionModelId,
				lastMessageAt: null,
			});

			const usePublishedFace = sessionKind === 'community';
			const characterForGreeting = this.agentService.effectiveCharacterForLlm(character, usePublishedFace);
			const greeting = characterForGreeting.greeting.trim();
			if (greeting.length > 0) {
				const greetAt = new Date();
				await this.agentMessagesRepository.insertOne({
					id: this.agentService.newId(),
					createdAt: greetAt,
					sessionId: row.id,
					role: 'assistant',
					content: greeting,
					statsDialogueStyleId: styleId,
					promptTokens: null,
					completionTokens: null,
				});
				row.lastMessageAt = greetAt;
				row.updatedAt = greetAt;
				await this.agentSessionsRepository.save(row);
			}

			return {
				id: row.id,
				name: row.name,
				characterId: row.characterId,
				dialogueStyleId: row.dialogueStyleId,
				sessionKind: row.sessionKind,
				agentModelId: row.agentModelId,
				createdAt: row.createdAt.toISOString(),
			};
		});
	}
}
