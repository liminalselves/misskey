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
import type { MiAgentMessage } from '@/models/AgentMessage.js';
import type { MiAgentModelUsageLog } from '@/models/AgentModelUsageLog.js';
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
import { AgentImageService } from '@/core/AgentImageService.js';
import { AgentExternalAuditService } from '@/core/AgentExternalAuditService.js';
import { AGENT_IMAGE_WORLD_PROMPT } from '@/core/agent-image-presets.js';

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
			auditBlocked: { type: 'boolean' },
			auditBlockCode: { type: 'string', nullable: true },
			auditCategory: { type: 'string', nullable: true },
			auditReason: { type: 'string', nullable: true },
		},
	},
	errors: {
		agentsLlmAborted: {
			message: 'LLM request was aborted by the client.',
			code: 'AGENTS_LLM_ABORTED',
			id: 'ac65031e-5b21-4d61-b8a4-9822e52f7a2b',
			httpStatusCode: 409,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		text: { type: 'string', minLength: 1, maxLength: 16000 },
		/** 前端生成的客户端请求 ID；用于请求幂等与通过 agents/messages/abort 取消本次请求 */
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
				id: 'f4fee7e6-df64-4ec8-867e-d7282bee4fd6',
				kind: 'client',
				httpStatusCode: 400,
			});
		}
	}
	if (seq.length > 0 && seq[seq.length - 1]!.role === 'user') {
		throw new ApiError({
			message: 'Wait for the assistant reply before sending another message.',
			code: 'AGENT_AWAIT_ASSISTANT_REPLY',
			id: '1ae86b90-37b6-4e4b-ac1c-74833f931c60',
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
	private agentImageService: AgentImageService,
	private agentExternalAuditService: AgentExternalAuditService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			await this.chatService.checkChatAvailability(me.id, 'write');

			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'eaaf419d-5dff-4ba1-96e1-7ea983241a04' });
			}

			const clientRequestId = ps.clientRequestId ?? this.agentService.newId();
			if (ps.clientRequestId) {
				const priorUserMessage = await this.agentMessagesRepository.findOneBy({
					sessionId: session.id,
					clientRequestId,
					role: 'user',
				});
				if (priorUserMessage) {
					if (priorUserMessage.content !== ps.text) {
						throw new ApiError({
							message: 'This client request ID has already been used with different content.',
							code: 'AGENT_CLIENT_REQUEST_ID_REUSED',
							id: '8f5a6680-8a9c-4ae8-b46e-84ff821f9952',
							kind: 'client',
							httpStatusCode: 409,
						});
					}
					const priorAssistantMessage = await this.agentMessagesRepository.findOneBy({
						sessionId: session.id,
						clientRequestId,
						role: 'assistant',
					});
					if (priorAssistantMessage) {
						return {
							userMessageId: priorUserMessage.id,
							assistantMessageId: priorAssistantMessage.id,
							assistantText: priorAssistantMessage.content,
							longTermMemorySearchUnavailable: false,
							longTermMemoryAddScheduled: false,
							compressionLlmPending: false,
							compressionStickiesBaselineCount: 0,
							aborted: false,
							auditBlocked: false,
							auditBlockCode: null,
							auditCategory: null,
							auditReason: null,
						};
					}
					throw new ApiError({
						message: 'A reply is still being generated for this client request.',
						code: 'AGENT_REPLY_PENDING',
						id: '8d99fad8-c487-4a7e-bb28-5df37a590116',
						httpStatusCode: 409,
					});
				}
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

			// 关于「并发互斥」与「失败状态清理」的设计契约（修改前必读）：
			//
			// 旧实现的两条故障路径：
			//   (a) 「读 if(agentReplyPending) 抛错」与「save(pending=true)」之间存在非原子窗口，
			//       并发同会话两路 send 都可能通过预检查，导致：双轮 LLM、双轮扣费、turn 校验脏。
			//   (b) `insertOne(user)`、`registerAbortable`、`startLog` 均位于 try/catch 之前。
			//       其中任何一步抛错都会让会话停留在 `agentReplyPending=true`、abort 控制器悬挂、
			//       用户消息变孤儿，且没有任何路径会清理。
			//
			// 新实现做了两件事：
			//   1) 用一条 UPDATE ... WHERE id=... AND "agentReplyPending"=false 把「检查」与「置位」合一，
			//      affected!==1 即代表已被并发请求占走，直接抛 AGENT_REPLY_PENDING。
			//   2) 把 userMsg / abortController / usageLog 三个副作用全部纳入同一 try；
			//      catch 据它们是否为 null 决定清理动作，finally 兜底取消注册 abort。

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
			// 原子占位：失败说明并发请求已抢占。WHERE 子句里的 "agentReplyPending" 须显式引号，PostgreSQL 才认识 camelCase 列名。
			const occupy = await this.agentSessionsRepository.createQueryBuilder()
				.update()
				.set({ agentReplyPending: true, updatedAt: now })
				.where('id = :id AND "agentReplyPending" = false', { id: session.id })
				.execute();
			if ((occupy.affected ?? 0) !== 1) {
				throw new ApiError({
					message: 'A reply is still being generated for this session.',
					code: 'AGENT_REPLY_PENDING',
					id: '8d99fad8-c487-4a7e-bb28-5df37a590116',
				});
			}
			// 与库侧 UPDATE 同步内存视图：成功/失败末尾的 save(session) 才能把 pending=false 正确写回。
			session.agentReplyPending = true;
			session.updatedAt = now;

			let userMsg: MiAgentMessage | null = null;
			let abortController: AbortController | null = null;
			let usageLog: MiAgentModelUsageLog | null = null;
			let assistantPersisted = false;

			try {
				userMsg = await this.agentMessagesRepository.insertOne({
					id: this.agentService.newId(),
					createdAt: now,
					sessionId: session.id,
					role: 'user',
					content: ps.text,
					clientRequestId,
					statsDialogueStyleId: session.dialogueStyleId,
					promptTokens: null,
					completionTokens: null,
				});

				abortController = this.agentService.registerAbortable(session.id, clientRequestId);
				const modelApiName = (() => {
					try {
						return this.agentService.resolveModelApiName(instanceMeta, session.agentModelId ?? null);
					} catch {
						return null;
					}
				})();
				usageLog = await this.agentModelUsageService.startLog({
					userId: me.id,
					sessionId: session.id,
					characterId: session.characterId,
					dialogueStyleId: session.dialogueStyleId,
					modelId: session.agentModelId ?? null,
					modelApiName,
					usageKind: 'chat',
				});

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
				const selectedWorldbook = this.agentService.selectWorldbookEntriesForPrompt(character, ps.text);
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
				const activeImageModel = this.agentImageService.resolveImageModel(instanceMeta, session.agentImageModelId);
				if (activeImageModel?.provider === 'aurora') {
					system += '\n\n<agent_image_generation_protocol>\n';
					system += AGENT_IMAGE_WORLD_PROMPT;
					system += '\n';
					system += '</agent_image_generation_protocol>';
				}
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

				// 风格 directive 仅在「发往 LLM 的最新 user」一处注入：
				// - DB（上文 userMsg 已落 ps.text）、长期记忆检索（searchMsgs）、长期记忆 add（buildMessagesForAddMemory）、
				//   压缩侧车（pairs）、UI 时间线均见原始用户文本，不受 directive 污染；
				// - directive 长度已通过 `buildSendPathBudgets` 预扣到 historyBudget，对应 system 仅保留
				//   `<dialogue_style_protocol>` 安全网说明，与 `AgentService.buildLatestUserDirectiveBlock` 一一呼应。
				const wrappedUserText = this.agentService.wrapLatestUserTextWithStyleDirective(ps.text, style, selectedWorldbook);

				const rawAssistantText = await this.agentService.invokeChatCompletions({
					system,
					messages: pairs,
					userText: wrappedUserText,
					sessionModelId: session.agentModelId ?? null,
					externalAbortSignal: abortController.signal,
				});

				const auditResult = await this.agentExternalAuditService.auditReply({
					instance: instanceMeta,
					user: me,
					session,
					userText: ps.text,
					assistantText: rawAssistantText,
				}).catch(() => ({ blocked: false as const, allFailed: true }));
				if (auditResult.blocked === true) {
					if (userMsg) {
						try {
							await this.agentMessagesRepository.delete({ id: userMsg.id });
							userMsg = null;
						} catch {
							// 与主动停止一致：删除失败时 turn 校验会阻止下一次不一致发送。
						}
					}
					const blockedAt = new Date();
					session.updatedAt = blockedAt;
					session.agentReplyPending = false;
					await this.agentSessionsRepository.save(session);
					await this.agentModelUsageService.finishLog(usageLog, instanceMeta, { status: 'success' });
					return {
						userMessageId: null,
						assistantMessageId: null,
						assistantText: '',
						longTermMemorySearchUnavailable,
						longTermMemoryAddScheduled: false,
						compressionLlmPending: false,
						compressionStickiesBaselineCount: 0,
						aborted: false,
						auditBlocked: true,
						auditBlockCode: auditResult.blockCode,
						auditCategory: auditResult.category,
						auditReason: auditResult.reason,
					};
				}
				const asstNow = new Date();
				const assistantMsg = await this.agentMessagesRepository.insertOne({
					id: this.agentService.newId(),
					createdAt: asstNow,
					sessionId: session.id,
					role: 'assistant',
					content: rawAssistantText,
					clientRequestId,
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
							assistantText: rawAssistantText,
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
					assistantText: rawAssistantText,
					longTermMemorySearchUnavailable,
					longTermMemoryAddScheduled,
					compressionLlmPending,
					compressionStickiesBaselineCount,
					aborted: false,
					auditBlocked: false,
					auditBlockCode: null,
					auditCategory: null,
					auditReason: null,
				};
			} catch (err) {
				const aborted = (abortController?.signal.aborted === true)
					|| (err instanceof ApiError && err.code === 'AGENTS_LLM_ABORTED');
				// 助手消息未落库时（主动取消、LLM 失败、或 startLog 之前的副作用阶段失败）移除已插入的用户消息；
				// userMsg 为 null 说明插入本身就失败了——不存在要清理的孤儿行。
				if (userMsg && !assistantPersisted) {
					try {
						await this.agentMessagesRepository.delete({ id: userMsg.id });
					} catch {
						// 删除失败不应吞掉原始 err；下一次发信时 turn 校验会拦下不一致状态
					}
				}
				// 始终释放 pending 锁：与开头的原子 occupy 配对，无论中途哪一步失败都不能让会话卡死。
				session.agentReplyPending = false;
				session.updatedAt = new Date();
				try {
					await this.agentSessionsRepository.save(session);
				} catch {
					// 极端：save 失败时 pending 仍为 true 落库；下次成功发信会覆盖，或由运维介入
				}
				// startLog 失败时 usageLog 为 null；非 null 才结算
				if (usageLog) {
					try {
						await this.agentModelUsageService.finishLog(usageLog, instanceMeta, {
							status: aborted ? 'aborted' : 'failed',
							errorCode: err instanceof ApiError ? err.code : null,
						});
					} catch {
						// 日志结算失败不应淹没原始错误
					}
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
						auditBlocked: false,
						auditBlockCode: null,
						auditCategory: null,
						auditReason: null,
					};
				}
				throw err;
			} finally {
				// abortController 为 null 说明 registerAbortable 阶段之前就抛了；无需取消注册。
				if (abortController) {
					this.agentService.unregisterAbortable(session.id, clientRequestId, abortController);
				}
			}
		});
	}
}
