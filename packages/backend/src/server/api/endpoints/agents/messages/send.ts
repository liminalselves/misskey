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
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentDashscopeMemoryService } from '@/core/AgentDashscopeMemoryService.js';
import { ChatService } from '@/core/ChatService.js';
import { MetaService } from '@/core/MetaService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			userMessageId: { type: 'string', format: 'misskey:id' },
			assistantMessageId: { type: 'string', format: 'misskey:id' },
			assistantText: { type: 'string' },
			longTermMemorySearchUnavailable: { type: 'boolean' },
			longTermMemoryAddScheduled: { type: 'boolean' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		text: { type: 'string', minLength: 1, maxLength: 16000 },
	},
	required: ['sessionId', 'text'],
} as const;

/** 避免 NaN 传入 % 导致永不为 0、从而永远不触发 add 记忆 */
function safeAgentMemEveryNRounds(sessionVal: number | null | undefined, metaVal: number | null | undefined): number {
	const raw = sessionVal ?? metaVal ?? 1;
	const t = Math.trunc(Number(raw));
	if (!Number.isFinite(t)) return 1;
	return Math.max(1, Math.min(48, t));
}

function safeAgentMemAddMaxRounds(sessionVal: number | null | undefined, metaVal: number | null | undefined): number {
	const raw = sessionVal ?? metaVal ?? 3;
	const t = Math.trunc(Number(raw));
	if (!Number.isFinite(t)) return 3;
	return Math.max(1, Math.min(24, t));
}

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		private agentService: AgentService,
		private agentDashscopeMemoryService: AgentDashscopeMemoryService,
		private chatService: ChatService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			await this.chatService.checkChatAvailability(me.id, 'write');

			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'c7d8e9f0-a1b2-3456-0123-567890123456' });
			}

			const characterRow = await this.agentCharactersRepository.findOneByOrFail({ id: session.characterId });
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
				throw new ApiError({ message: 'Forbidden.', code: 'FORBIDDEN', id: 'e9f0a1b2-c3d4-5678-2345-789012345678' });
			}

			if (session.sessionKind === 'community') {
				if (!this.agentService.isListedOnPlazaStyle(styleRow)) {
					throw new ApiError({ message: 'Style is not published.', code: 'STYLE_NOT_PUBLISHED', id: 'f0a1b2c3-d4e5-6789-3456-890123456789' });
				}
			}

			const usePublishedFace = session.sessionKind === 'community';
			const character = this.agentService.effectiveCharacterForLlm(characterRow, usePublishedFace);
			const style = this.agentService.effectiveStyleForLlm(styleRow, usePublishedFace);

			if (session.agentReplyPending) {
				throw new ApiError({
					message: 'A reply is still being generated for this session.',
					code: 'AGENT_REPLY_PENDING',
					id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
				});
			}

			const now = new Date();
			const userMsg = await this.agentMessagesRepository.insertOne({
				id: this.agentService.newId(),
				createdAt: now,
				sessionId: session.id,
				role: 'user',
				content: ps.text,
				promptTokens: null,
				completionTokens: null,
			});

			session.agentReplyPending = true;
			session.updatedAt = now;
			await this.agentSessionsRepository.save(session);

			try {
				const instanceMeta = await this.metaService.fetch(true);
				const { maxContextTokens, maxOutputTokensPerCall } = this.agentService.resolveModelConnection(instanceMeta, session.agentModelId ?? null);

				const systemBase = this.agentService.buildSystemPrompt({
					globalPrompt: instanceMeta.agentGlobalSystemPrompt,
					character,
					style,
				});
				const exampleFewShot = this.agentService.exampleTurnsFromStored(character.exampleDialogue);

				let longTermMemorySearchUnavailable = false;
				let longTermMemoryAddScheduled = false;
				const memActive = this.agentDashscopeMemoryService.isRunnable(instanceMeta) && session.agentLongMemoryEnabled;
				const maxMemChars = Math.max(200, Math.min(50_000, session.agentLongMemoryInjectMaxChars || instanceMeta.agentMem0InjectMaxChars));
				const memHeader = '\n\n=== Long-term memory (retrieved) ===\n';
				const memReserveChars = memActive ? memHeader.length + maxMemChars : 0;

				const historyBudget = this.agentService.computeChatHistoryCharBudget({
					maxContextTokens,
					maxOutputTokensPerCall,
					systemChars: systemBase.length + memReserveChars,
					prefixMessages: exampleFewShot,
				});
				const history = await this.agentService.loadRecentMessagesForContext(session.id, historyBudget);
				const historyForApi = history.filter(m => m.role === 'user' || m.role === 'assistant');
				const pairs: { role: 'user' | 'assistant'; content: string }[] = [];
				for (const m of historyForApi) {
					if (m.role === 'user' || m.role === 'assistant') {
						pairs.push({ role: m.role, content: m.content });
					}
				}
				if (pairs.length > 0 && pairs[pairs.length - 1].role === 'user' && pairs[pairs.length - 1].content === ps.text) {
					pairs.pop();
				}

				let memoryBlock = '';
				if (memActive) {
					const topK = Math.max(1, Math.min(100, session.agentLongMemoryTopK || instanceMeta.agentMem0TopK));
					const searchMsgs: { role: 'user' | 'assistant'; content: string }[] = [...pairs, { role: 'user', content: ps.text }];
					const bailianUserId = this.agentDashscopeMemoryService.bailianUserId(me.id, session.id);
					const retrieved = await this.agentDashscopeMemoryService.searchMemory({
						meta: instanceMeta,
						bailianUserId,
						messages: searchMsgs,
						topK,
						minScore: session.agentLongMemoryMinScore,
						maxChars: maxMemChars,
					});
					if (retrieved === null) {
						longTermMemorySearchUnavailable = true;
					} else if (retrieved.length > 0) {
						memoryBlock = retrieved;
					}
				}

				let system = systemBase;
				if (memoryBlock.length > 0) {
					system += memHeader + memoryBlock;
				}

				// 历史条数必须与 agents/sessions/context-window 一致：首轮已按「长期记忆占满预留」计算
				// historyBudget。若此处因实际检索内容较短而加大预算并 reload，会把分割线以上的旧消息
				// 再度塞进模型，与 UI 分割线语义不一致。

				const assistantText = await this.agentService.invokeChatCompletions({
					system,
					prefixMessages: exampleFewShot,
					messages: pairs,
					userText: ps.text,
					sessionModelId: session.agentModelId ?? null,
				});

				const asstNow = new Date();
				const assistantMsg = await this.agentMessagesRepository.insertOne({
					id: this.agentService.newId(),
					createdAt: asstNow,
					sessionId: session.id,
					role: 'assistant',
					content: assistantText,
					promptTokens: null,
					completionTokens: null,
				});

				if (memActive) {
					const everyN = safeAgentMemEveryNRounds(
						session.agentLongMemoryAddEveryNRounds,
						instanceMeta.agentMem0AddMemoryEveryNRounds,
					);
					const assistantRoundCount = Number(
						await this.agentMessagesRepository.count({
							where: { sessionId: session.id, role: 'assistant' },
						}),
					);
					const shouldRunAddMemory =
						Number.isFinite(assistantRoundCount) &&
						assistantRoundCount > 0 &&
						assistantRoundCount % everyN === 0;
					if (shouldRunAddMemory) {
						const addRounds = safeAgentMemAddMaxRounds(
							session.agentLongMemoryAddMaxRounds,
							instanceMeta.agentMem0AddMemoryMaxRounds,
						);
						const addMessages = this.agentDashscopeMemoryService.buildMessagesForAddMemory({
							priorMessages: pairs,
							currentUserText: ps.text,
							assistantText,
							maxRounds: addRounds,
						});
						this.agentDashscopeMemoryService.scheduleAddMemory({
							meta: instanceMeta,
							bailianUserId: this.agentDashscopeMemoryService.bailianUserId(me.id, session.id),
							messages: addMessages,
						});
						longTermMemoryAddScheduled = true;
					}
				}

				session.lastMessageAt = asstNow;
				session.updatedAt = asstNow;
				session.agentReplyPending = false;
				await this.agentSessionsRepository.save(session);

				return {
					userMessageId: userMsg.id,
					assistantMessageId: assistantMsg.id,
					assistantText,
					longTermMemorySearchUnavailable,
					longTermMemoryAddScheduled,
				};
			} catch (err) {
				session.agentReplyPending = false;
				session.updatedAt = new Date();
				await this.agentSessionsRepository.save(session);
				throw err;
			}
		});
	}
}
