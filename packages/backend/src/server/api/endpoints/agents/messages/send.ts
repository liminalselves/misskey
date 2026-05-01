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
	UserProfilesRepository,
} from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import {
	AgentService,
	AGENT_LLM_MEMORY_XML_CLOSE,
	AGENT_LLM_MEMORY_XML_OPEN,
	escapeAgentXmlText,
} from '@/core/AgentService.js';
import { AgentDashscopeMemoryService } from '@/core/AgentDashscopeMemoryService.js';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';
import { ChatService } from '@/core/ChatService.js';
import { MetaService } from '@/core/MetaService.js';
import { AgentCompressionMemoryService } from '@/core/AgentCompressionMemoryService.js';

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
			userMessageId: { type: 'string', format: 'misskey:id', nullable: true },
			assistantMessageId: { type: 'string', format: 'misskey:id', nullable: true },
			assistantText: { type: 'string' },
			longTermMemorySearchUnavailable: { type: 'boolean' },
			longTermMemoryAddScheduled: { type: 'boolean' },
			compressionLlmPending: { type: 'boolean' },
			compressionStickiesBaselineCount: { type: 'number' },
			aborted: { type: 'boolean' },
		},
	},
	errors: {
		agentsLlmAborted: {
			message: 'LLM request was aborted by the client.',
			code: 'AGENTS_LLM_ABORTED',
			id: 'e5f6a7b8-c9d0-1234-ef01-345678901234',
			httpStatusCode: 409,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		text: { type: 'string', minLength: 1, maxLength: 16000 },
		/** 前端生成的客户端请求 ID；用于通过 agents/messages/abort 取消本次请求 */
		clientRequestId: { type: 'string', minLength: 1, maxLength: 64 },
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

/** 用户消息与助手消息须严格交替；末尾不能停留在「已发送的用户消息」上（须先有助手回复） */
function assertAgentSessionTurnOrderAllowsUserSend(rows: { role: string }[]): void {
	const seq = rows.filter(m => m.role === 'user' || m.role === 'assistant');
	for (let i = 1; i < seq.length; i++) {
		if (seq[i]!.role === seq[i - 1]!.role) {
			throw new ApiError({
				message: 'The conversation has consecutive user or assistant messages. Delete or fix messages before sending.',
				code: 'AGENT_THREAD_INVALID_TURNS',
				id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
				kind: 'client',
				httpStatusCode: 400,
			});
		}
	}
	if (seq.length > 0 && seq[seq.length - 1]!.role === 'user') {
		throw new ApiError({
			message: 'Wait for the assistant reply before sending another message.',
			code: 'AGENT_AWAIT_ASSISTANT_REPLY',
			id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
			kind: 'client',
			httpStatusCode: 400,
		});
	}
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

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private agentService: AgentService,
		private agentDashscopeMemoryService: AgentDashscopeMemoryService,
		private agentModelUsageService: AgentModelUsageService,
		private chatService: ChatService,
		private metaService: MetaService,
		private agentCompressionMemoryService: AgentCompressionMemoryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			await this.chatService.checkChatAvailability(me.id, 'write');

			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'c7d8e9f0-a1b2-3456-0123-567890123456' });
			}

			const characterRow = await this.agentCharactersRepository.findOneByOrFail({ id: session.characterId });
			this.agentService.assertAgentUserSessionChatAllowed(characterRow, session);
			if (!session.dialogueStyleId) {
				throw new ApiError({
					message: 'Pick a dialogue style before sending messages.',
					code: 'AGENT_DIALOGUE_STYLE_REQUIRED',
					id: 'a6b7c8d9-e0f1-2345-9012-567890123456',
				});
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

			const turnOrderRows = await this.agentMessagesRepository.find({
				where: { sessionId: session.id },
				select: ['role', 'createdAt', 'id'],
				order: { createdAt: 'ASC', id: 'ASC' },
			});
			assertAgentSessionTurnOrderAllowsUserSend(turnOrderRows);

			const instanceMeta = await this.metaService.fetch(true);
			const callCost = this.agentService.getUserFacingModelCostPerCall(instanceMeta, session.agentModelId);
			if (callCost > 0) {
				const profile = await this.userProfilesRepository.findOneBy({ userId: me.id });
				if ((profile?.agentCreditBalance ?? 0) < callCost) {
					throw new ApiError({
						message: 'Insufficient agent model credit for this call.',
						code: 'AGENT_INSUFFICIENT_CREDIT',
						id: 'd7e8f9a0-b1c2-4567-8901-123456789abc',
						kind: 'client',
						httpStatusCode: 402,
					});
				}
			}

			const now = new Date();
			const userMsg = await this.agentMessagesRepository.insertOne({
				id: this.agentService.newId(),
				createdAt: now,
				sessionId: session.id,
				role: 'user',
				content: ps.text,
				statsDialogueStyleId: session.dialogueStyleId,
				promptTokens: null,
				completionTokens: null,
			});

			session.agentReplyPending = true;
			session.updatedAt = now;
			await this.agentSessionsRepository.save(session);

			const clientRequestId = ps.clientRequestId ?? this.agentService.newId();
			const abortController = this.agentService.registerAbortable(session.id, clientRequestId);
			const modelApiName = (() => {
				try {
					return this.agentService.resolveModelApiName(instanceMeta, session.agentModelId ?? null);
				} catch {
					return null;
				}
			})();
			const usageLog = await this.agentModelUsageService.startLog({
				userId: me.id,
				sessionId: session.id,
				characterId: session.characterId,
				dialogueStyleId: session.dialogueStyleId,
				modelId: session.agentModelId ?? null,
				modelApiName,
				usageKind: 'chat',
			});

			let assistantPersisted = false;
			try {
				const longMemProvider = this.agentCompressionMemoryService.resolveEffectiveProvider(
					session.agentLongMemoryProvider,
					instanceMeta,
				);
				const budgets = this.agentCompressionMemoryService.buildSendPathBudgets({
					instanceMeta,
					session,
					character,
					style,
					provider: longMemProvider,
				});
				const { maxContextTokens, maxOutputTokensPerCall, historyBudget } = budgets;
				const systemBase = this.agentService.buildSystemPrompt({
					globalPrompt: instanceMeta.agentGlobalSystemPrompt,
					character,
					style,
				});

				let longTermMemorySearchUnavailable = false;
				let longTermMemoryAddScheduled = false;
				const memActive = this.agentCompressionMemoryService.isAliyunPathActive(longMemProvider, session, instanceMeta);
				const maxMemChars = Math.max(200, Math.min(50_000, session.agentLongMemoryInjectMaxChars || instanceMeta.agentMem0InjectMaxChars));

				const { messages: history } = await this.agentService.loadRecentMessagesForContextWithMeta(session.id, historyBudget);
				const historyForApi = history.filter(m => m.role === 'user' || m.role === 'assistant');
				const cStickies = longMemProvider === 'compression'
					? await this.agentCompressionMemoryService.listStickies(session.id)
					: [];
				let pairs: { role: 'user' | 'assistant'; content: string }[] = [];
				if (longMemProvider === 'compression') {
					const actives = cStickies.filter(s => s.state === 'active');
					const bIds = actives.flatMap(s => [s.fromMessageId, s.toMessageId]);
					const boundaries = await this.agentCompressionMemoryService.loadBoundaryMap(session.id, bIds);
					pairs = this.agentCompressionMemoryService.buildPairsExcludingActiveCompression(
						historyForApi,
						actives,
						boundaries,
					);
				} else {
					for (const m of historyForApi) {
						if (m.role === 'user' || m.role === 'assistant') {
							pairs.push({ role: m.role, content: m.content });
						}
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
					system += AGENT_LLM_MEMORY_XML_OPEN + escapeAgentXmlText(memoryBlock) + AGENT_LLM_MEMORY_XML_CLOSE;
				}
				if (longMemProvider === 'compression' && cStickies.length > 0) {
					const cIds = cStickies
						.filter(s => s.state === 'active')
						.flatMap(s => [s.fromMessageId, s.toMessageId]);
					const cBound = await this.agentCompressionMemoryService.loadBoundaryMap(session.id, cIds);
					const comp = this.agentCompressionMemoryService.buildCompressionSystemBlock(cStickies, cBound);
					if (comp.length > 0) {
						system += comp;
					}
				}

				// 首轮 `pairs` 用 `buildSendPathBudgets` 的 H（阿里云路径预扣 memory、压缩路径另预扣 comp 占位）。
				// 《context-window》分割线用 `buildContextDividerAlignedBudgets`（不预扣 comp）；《compression-overview》
				// 在压缩模式下与发信共用同一 H。勿在检索等之后无约束重载历史。

				const assistantText = await this.agentService.invokeChatCompletions({
					system,
					messages: pairs,
					userText: ps.text,
					sessionModelId: session.agentModelId ?? null,
					externalAbortSignal: abortController.signal,
				});

				const asstNow = new Date();
				const assistantMsg = await this.agentMessagesRepository.insertOne({
					id: this.agentService.newId(),
					createdAt: asstNow,
					sessionId: session.id,
					role: 'assistant',
					content: assistantText,
					statsDialogueStyleId: session.dialogueStyleId,
					promptTokens: null,
					completionTokens: null,
				});
				assistantPersisted = true;

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

				const compressionProviderOn =
					this.agentCompressionMemoryService.resolveEffectiveProvider(session.agentLongMemoryProvider, instanceMeta) === 'compression';
				let compressionLlmPending = false;
				let compressionStickiesBaselineCount = 0;
				if (compressionProviderOn) {
					compressionStickiesBaselineCount = await this.agentCompressionMemoryService.countStickies(session.id);
					compressionLlmPending = await this.agentCompressionMemoryService.peekWillInvokeCompressionLlm(
						session, character, style, instanceMeta, me.id,
					);
					void this.agentCompressionMemoryService.afterAssistantForCompression(session, character, style, instanceMeta, me.id)
						.catch(() => { /* 压缩为侧车，不阻断主回复 */ });
				}

				await this.agentModelUsageService.finishLog(usageLog, instanceMeta, { status: 'success' });

				return {
					userMessageId: userMsg.id,
					assistantMessageId: assistantMsg.id,
					assistantText,
					longTermMemorySearchUnavailable,
					longTermMemoryAddScheduled,
					compressionLlmPending,
					compressionStickiesBaselineCount,
					aborted: false,
				};
			} catch (err) {
				const aborted = abortController.signal.aborted
					|| (err instanceof ApiError && err.code === 'AGENTS_LLM_ABORTED');
				// 助手消息未落库时（主动取消或 LLM 等失败）移除已插入的用户消息；若助手已写入则不得删 user，以免破坏轮次
				if (!assistantPersisted) {
					await this.agentMessagesRepository.delete({ id: userMsg.id });
				}
				session.agentReplyPending = false;
				session.updatedAt = new Date();
				await this.agentSessionsRepository.save(session);

				try {
					await this.agentModelUsageService.finishLog(usageLog, instanceMeta, {
						status: aborted ? 'aborted' : 'failed',
						errorCode: err instanceof ApiError ? err.code : null,
					});
				} catch {
					// 日志结算失败不应淹没原始错误
				}

				if (aborted) {
					return {
						userMessageId: null,
						assistantMessageId: null,
						assistantText: '',
						longTermMemorySearchUnavailable: false,
						longTermMemoryAddScheduled: false,
						compressionLlmPending: false,
						compressionStickiesBaselineCount: 0,
						aborted: true,
					};
				}
				throw err;
			} finally {
				this.agentService.unregisterAbortable(session.id, clientRequestId, abortController);
			}
		});
	}
}
