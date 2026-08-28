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
	normalizeAgentLlmTurns,
	stripHistoricTimePrefix,
} from '@/core/AgentService.js';
import { AgentDashscopeMemoryService } from '@/core/AgentDashscopeMemoryService.js';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';
import { ChatService } from '@/core/ChatService.js';
import { MetaService } from '@/core/MetaService.js';
import { AgentCompressionMemoryService, AGENT_OVERVIEW_SCAN_LIMIT, type CompressionSidecarTokenD } from '@/core/AgentCompressionMemoryService.js';
import { AgentTokenService } from '@/core/AgentTokenService.js';
import { AgentImageService } from '@/core/AgentImageService.js';
import { AgentVisionService } from '@/core/AgentVisionService.js';
import { AgentExternalAuditService } from '@/core/AgentExternalAuditService.js';
import { AgentProactiveScheduleService } from '@/core/AgentProactiveScheduleService.js';
import { AgentMessageNotifyService } from '@/core/AgentMessageNotifyService.js';
import { buildAgentProactiveNotificationText } from '@/core/agent-proactive-notification-text.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
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
			userImageRecognitionStatus: { type: 'string', nullable: true },
			userImageRecognitionDescription: { type: 'string', nullable: true },
			assistantText: { type: 'string' },
			longTermMemorySearchUnavailable: { type: 'boolean' },
			longTermMemoryAddScheduled: { type: 'boolean' },
			compressionLlmPending: { type: 'boolean' },
			compressionStickiesBaselineCount: { type: 'number' },
			compressionStickiesBaselineMaxUpdatedAt: { type: 'string', nullable: true },
			proactiveScheduleControlFailed: { type: 'boolean' },
			proactiveScheduleActionTypes: { type: 'array', items: { type: 'string', enum: ['create', 'update', 'cancel'] } },
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
		text: { type: 'string', minLength: 0, maxLength: 16000, nullable: true },
		fileId: { type: 'string', format: 'misskey:id', nullable: true },
		/** 前端生成的客户端请求 ID；用于请求幂等与通过 agents/messages/abort 取消本次请求 */
		clientRequestId: { type: 'string', minLength: 1, maxLength: 64 },
	},
	required: ['sessionId'],
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

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private agentService: AgentService,
		private agentDashscopeMemoryService: AgentDashscopeMemoryService,
		private agentModelUsageService: AgentModelUsageService,
		private chatService: ChatService,
	private metaService: MetaService,
	private agentCompressionMemoryService: AgentCompressionMemoryService,
	private agentImageService: AgentImageService,
	private agentVisionService: AgentVisionService,
	private agentExternalAuditService: AgentExternalAuditService,
	private agentProactiveScheduleService: AgentProactiveScheduleService,
	private agentTokenService: AgentTokenService,
	private agentMessageNotifyService: AgentMessageNotifyService,
	private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			await this.chatService.checkChatAvailability(me.id, 'write');
			const userText = typeof ps.text === 'string' ? ps.text : '';
			const imageFileId = typeof ps.fileId === 'string' && ps.fileId.trim() !== '' ? ps.fileId : null;
			if (userText.trim() === '' && imageFileId == null) {
				throw new ApiError({ message: 'A message must contain text or one image.', code: 'AGENT_MESSAGE_EMPTY', id: 'bc0ef6d8-644f-4d2e-83f7-a44c06ea3ed2', kind: 'client', httpStatusCode: 400 });
			}

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
					if (priorUserMessage.content !== userText || (priorUserMessage.imageFileId ?? null) !== imageFileId) {
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
							userImageRecognitionStatus: priorUserMessage.imageRecognitionStatus,
							userImageRecognitionDescription: priorUserMessage.imageRecognitionDescription,
							assistantText: priorAssistantMessage.content,
							longTermMemorySearchUnavailable: false,
							longTermMemoryAddScheduled: false,
							compressionLlmPending: false,
							compressionStickiesBaselineCount: 0,
							compressionStickiesBaselineMaxUpdatedAt: null,
							proactiveScheduleControlFailed: priorAssistantMessage.proactiveScheduleControlError != null,
							proactiveScheduleActionTypes: this.agentProactiveScheduleService.actionTypes(priorAssistantMessage),
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
			//       并发同会话两路 send 都可能通过预检查，导致双轮 LLM 与双轮扣费。
			//   (b) `insertOne(user)`、`registerAbortable`、`startLog` 均位于 try/catch 之前。
			//       其中任何一步抛错都会让会话停留在 `agentReplyPending=true`、abort 控制器悬挂、
			//       用户消息变孤儿，且没有任何路径会清理。
			//
			// 新实现做了两件事：
			//   1) 用一条 UPDATE ... WHERE id=... AND "agentReplyPending"=false 把「检查」与「置位」合一；
			//      包含旧主动消息在内的历史轮次异常由发往模型前的只读规范化处理，不能再阻断用户继续对话。
			//      affected!==1 即代表已被并发请求占走，直接抛 AGENT_REPLY_PENDING。
			//   2) 把 userMsg / abortController / usageLog 三个副作用全部纳入同一 try；
			//      catch 据它们是否为 null 决定清理动作，finally 兜底取消注册 abort。

			const instanceMeta = await this.metaService.fetch(true);
			let visionModel = null;
			if (imageFileId != null) {
				await this.agentVisionService.assertImageFileOwnedByUser(imageFileId, me.id);
				visionModel = await this.agentVisionService.assertConfigured(instanceMeta, session.agentVisionModelId);
				const visionCost = Math.max(0, Number(visionModel.costPerCall) || 0);
				if (visionCost > 0) {
					const profile = await this.userProfilesRepository.findOneBy({ userId: me.id });
					if ((profile?.agentCreditBalance ?? 0) < visionCost) {
						throw new ApiError({ message: 'Insufficient agent credit for image recognition.', code: 'AGENT_VISION_INSUFFICIENT_CREDIT', id: 'b3f23fcc-0b08-4400-8cbf-cf2f9a57bc24', kind: 'client', httpStatusCode: 402 });
					}
				}
			}
			// 余额预检（发信/压缩侧车/主动消息共用口径）：usage 按量模式要求余额 > 0；per_call 要求余额 >= 按次价；免费额度剩余时放行
			if (!await this.agentModelUsageService.canAffordModelCall(instanceMeta, session.agentModelId, me.id)) {
				throw new ApiError({
					message: 'Insufficient agent model credit for this call.',
					code: 'AGENT_INSUFFICIENT_CREDIT',
					id: 'd7e8f9a0-b1c2-4567-8901-123456789abc',
					kind: 'client',
					httpStatusCode: 402,
				});
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
					content: userText,
					imageFileId,
					imageRecognitionStatus: null,
					imageRecognitionDescription: null,
					clientRequestId,
					statsDialogueStyleId: session.dialogueStyleId,
					promptTokens: null,
					completionTokens: null,
				});

				// 尽早注册 abort 控制器，使后续所有异步阶段（图片识别、记忆搜索、LLM 调用）均可被中断
				abortController = this.agentService.registerAbortable(session.id, clientRequestId);

				if (imageFileId != null && visionModel != null) {
					// 图片识别前检查 abort，避免长时间识别操作无法被中断
					if (abortController.signal.aborted) {
						throw new ApiError({ message: 'LLM request was aborted by the client.', code: 'AGENTS_LLM_ABORTED', id: 'ac65031e-5b21-4d61-b8a4-9822e52f7a2b', httpStatusCode: 409 });
					}
					const recognition = await this.agentVisionService.recognize({
						instance: instanceMeta,
						user: me,
						session,
						model: visionModel,
						fileId: imageFileId,
						externalAbortSignal: abortController.signal,
					});
					userMsg.imageRecognitionStatus = recognition.status;
					userMsg.imageRecognitionDescription = recognition.status === 'succeeded' ? recognition.description : null;
					await this.agentMessagesRepository.save(userMsg);
				}
				// A real user turn invalidates the previously armed random proactive delivery.
				session.randomProactiveAt = null;
				session.randomProactiveNeedsUserMessage = false;

				const modelApiName = (await this.agentService.resolveModelApiNameForUser(instanceMeta, session.agentModelId ?? null, me.id).catch(() => null)) ?? null;
				usageLog = await this.agentModelUsageService.startLog({
					userId: me.id,
					sessionId: session.id,
					characterId: session.characterId,
					dialogueStyleId: session.dialogueStyleId,
					// 日志记录解析后的实际生效模型（未指定时为全站默认），计费/免费额度/报表均依赖 modelId
					modelId: this.agentService.resolveEffectiveModelId(instanceMeta, session.agentModelId),
					modelApiName,
					usageKind: 'chat',
				});

				const longMemProvider = this.agentCompressionMemoryService.resolveEffectiveProvider(
					session.agentLongMemoryProvider,
					instanceMeta,
				);
				const budgets = await this.agentCompressionMemoryService.buildSendPathBudgets({
					instanceMeta,
					session,
					character,
					style,
					provider: longMemProvider,
				});
				const { maxContextTokens, maxOutputTokensPerCall, historyBudget, historyBudgetTokens, charsPerToken } = budgets;
				// 统一经 AgentTokenService 解析计数器；发信滑窗按 token 口径截断（exact 或 estimate），与分割线/区带同源
				const sendTokenConfig = await this.agentTokenService.resolveTokenConfigForUser(instanceMeta, session.agentModelId ?? instanceMeta.agentDefaultModelId, me.id);
				const sendExactCounter = this.agentTokenService.makeCounter(sendTokenConfig);
				const selectedWorldbook = this.agentService.selectWorldbookEntriesForPrompt(character, userText);
				const activeRules = this.agentService.resolveActiveRules(
					this.agentService.normalizeRules(character.rules),
					session.ruleOverrides,
				);
				const systemBase = this.agentService.buildSystemPrompt({
					globalPrompt: instanceMeta.agentGlobalSystemPrompt,
					character,
					style,
					timeAwarenessEnabled: session.timeAwarenessEnabled === true,
					activeRules,
				});

				let longTermMemorySearchUnavailable = false;
				let longTermMemoryAddScheduled = false;
				const memActive = this.agentCompressionMemoryService.isAliyunPathActive(longMemProvider, session, instanceMeta);
				const maxMemChars = Math.max(200, Math.min(50_000, session.agentLongMemoryInjectMaxChars || instanceMeta.agentMem0InjectMaxChars));

				const { messages: history, scannedRows: historyScannedRows, dMap: historyDMap } = await this.agentService.loadRecentMessagesForContextWithMeta(session.id, historyBudget, AGENT_OVERVIEW_SCAN_LIMIT, { exactTokenCounter: sendExactCounter, tokenBudget: historyBudgetTokens, charsPerToken, timeAwarenessEnabled: session.timeAwarenessEnabled === true });
				const historyForApi = history.filter(m => (m.role === 'user' || m.role === 'assistant') && m.id !== userMsg!.id);
				const regexRules = this.agentService.normalizeRegexRules(character.regexRules);
				const filterForAi = (text: string, role: 'user' | 'assistant') => this.agentService.applyRegexRules(text, role, 'aiInvisible', regexRules);
				const filteredUserText = filterForAi(userText, 'user');
				const aiUserText = imageFileId == null
					? filteredUserText
					: userMsg.imageRecognitionStatus === 'succeeded' && userMsg.imageRecognitionDescription
						? `<image-recognition source="server" not-user-input="true">${escapeAgentXmlText(userMsg.imageRecognitionDescription)}</image-recognition>${filteredUserText.length > 0 ? `\n${filteredUserText}` : ''}`
						: `<image-recognition source="server" not-user-input="true" status="unavailable" />${filteredUserText.length > 0 ? `\n${filteredUserText}` : ''}`;
				const cStickies = longMemProvider === 'compression'
					? await this.agentCompressionMemoryService.listStickies(session.id)
					: [];
				let pairs: { role: 'user' | 'assistant'; content: string }[] = [];
				if (longMemProvider === 'compression') {
					const actives = cStickies.filter(s => s.state === 'active');
					const bIds = actives.flatMap(s => [s.fromMessageId, s.toMessageId]);
					const boundaries = await this.agentCompressionMemoryService.loadBoundaryMap(session.id, bIds);
						pairs = this.agentCompressionMemoryService.buildPairsExcludingActiveCompression(
						historyForApi.map(m => ({ ...m, content: filterForAi(m.content, m.role as 'user' | 'assistant') })),
						actives,
						boundaries,
					);
				} else {
					for (const m of historyForApi) {
						if (m.role === 'user' || m.role === 'assistant') {
							pairs.push({ role: m.role, content: filterForAi(m.content, m.role) });
						}
					}
				}
				pairs = normalizeAgentLlmTurns(pairs);

				// 记忆检索/写入复用 pairs 但剥离历史发送时间 XML（与现有 runtime-directive「不进记忆」原则一致）
				const memPairs: { role: 'user' | 'assistant'; content: string }[] = pairs.map(p => ({ role: p.role, content: stripHistoricTimePrefix(p.content) }));

				let memoryBlock = '';
				if (memActive) {
					const topK = Math.max(1, Math.min(100, session.agentLongMemoryTopK || instanceMeta.agentMem0TopK));
					const searchMsgs: { role: 'user' | 'assistant'; content: string }[] = [...memPairs, { role: 'user', content: aiUserText }];
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
				if (session.scheduledProactiveEnabled) {
					system += `\n${this.agentProactiveScheduleService.systemPromptBlock}`;
				}
				const activeImageModel = this.agentImageService.resolveImageModel(instanceMeta, session.agentImageModelId);
				if (activeImageModel != null) {
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
					const compMaxInject = Math.max(200, Math.min(50_000, session.agentLongMemoryInjectMaxChars));
					const comp = this.agentCompressionMemoryService.buildCompressionSystemBlock(cStickies, cBound, compMaxInject);
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
				// 历史发送时间 `<time>` 块随 formatMessageForLlmHistory 注入到发往 LLM 的 user 消息（仅
				// timeAwarenessEnabled 且消息时间可信时；导入消息 timeTrusted=false 不注入），长度随滑窗 D 自动计入预算；
				// 长期记忆检索 / 写入复用 pairs 时经 stripHistoricTimePrefix 剥离时间块，保持「不进记忆」隔离。
				const proactiveUserText = await this.agentProactiveScheduleService.prependScheduleContext(aiUserText, session);
				const wrappedUserText = this.agentService.wrapLatestUserTextWithStyleDirective(
					this.agentService.prependCurrentBeijingTime(proactiveUserText, session.timeAwarenessEnabled === true),
					style,
					selectedWorldbook,
					activeRules,
				);

				// 统一中断行为：per_call 和 usage 均直接中断 LLM 请求，按 costPerCall 扣费。
				// 中断后用户消息被回滚、助手消息不落库、会话锁立即释放，用户可马上发新消息。
				if (abortController.signal.aborted) {
					throw new ApiError({ message: 'LLM request was aborted by the client.', code: 'AGENTS_LLM_ABORTED', id: 'ac65031e-5b21-4d61-b8a4-9822e52f7a2b', httpStatusCode: 409 });
				}

				const llmResult = await this.agentService.invokeChatCompletions({
					system,
					messages: pairs,
					userText: wrappedUserText,
					sessionModelId: session.agentModelId ?? null,
					userId: me.id,
					externalAbortSignal: abortController.signal,
				});
				const rawAssistantText = llmResult.text;
				// 计费 token 数一律取自响应 usage（禁止本地估算）；缺失时由 finishLog 按策略兜底
				const llmUsageFields = llmResult.usage ? {
					promptTokens: llmResult.usage.promptTokens,
					completionTokens: llmResult.usage.completionTokens,
					promptCacheHitTokens: llmResult.usage.promptCacheHitTokens ?? null,
					promptCacheMissTokens: llmResult.usage.promptCacheMissTokens ?? null,
				} : {};
				const proactiveControl = this.agentProactiveScheduleService.extractControl(rawAssistantText);
				// 生图模型为「无」时协议未注入 system，但历史中的 [[agent_draw ...]] 占位符可能诱导
				// 模型继续输出生图标记：落库前整体过滤本次回复（历史消息不动），如同模型从未输出。
				const assistantText = activeImageModel == null
					? this.agentImageService.stripDrawPlaceholders(proactiveControl.visibleContent)
					: proactiveControl.visibleContent;
				const hasVisibleAssistantText = assistantText.trim().length > 0;

				const auditResult = await this.agentExternalAuditService.auditReply({
					instance: instanceMeta,
					user: me,
					session,
					userText,
					assistantText,
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
					await this.agentModelUsageService.finishLog(usageLog, instanceMeta, { status: 'success', ...llmUsageFields });
					return {
						userMessageId: null,
						assistantMessageId: null,
						userImageRecognitionStatus: null,
						userImageRecognitionDescription: null,
						assistantText: '',
						longTermMemorySearchUnavailable,
						longTermMemoryAddScheduled: false,
						compressionLlmPending: false,
					compressionStickiesBaselineCount: 0,
					compressionStickiesBaselineMaxUpdatedAt: null,
					proactiveScheduleControlFailed: false,
					proactiveScheduleActionTypes: [],
					aborted: false,
						auditBlocked: true,
						auditBlockCode: auditResult.blockCode,
						auditCategory: auditResult.category,
						auditReason: auditResult.reason,
					};
				}
				// 二次 abort 检查：LLM 可能在 abort 后仍返回了结果（abort 与完成竞态）。
				// 落库前拦截，避免被中断的回复写入数据库。
				if (abortController.signal.aborted) {
					throw new ApiError({ message: 'LLM request was aborted by the client.', code: 'AGENTS_LLM_ABORTED', id: 'ac65031e-5b21-4d61-b8a4-9822e52f7a2b', httpStatusCode: 409 });
				}
				const asstNow = new Date();
				const assistantMsg = await this.agentMessagesRepository.insertOne({
					id: this.agentService.newId(),
					createdAt: asstNow,
					sessionId: session.id,
					role: 'assistant',
					content: assistantText,
					rawContent: proactiveControl.controlRaw ? rawAssistantText : null,
					proactiveScheduleControlRaw: proactiveControl.controlRaw,
					proactiveScheduleControlError: null,
					// Keep control-only replies in private history to preserve turn ordering without
					// rendering an empty assistant bubble to the user.
					isInternal: !hasVisibleAssistantText,
					clientRequestId,
					statsDialogueStyleId: session.dialogueStyleId,
					promptTokens: null,
					completionTokens: null,
				});
				assistantPersisted = true;
				await this.agentProactiveScheduleService.applyAssistantControl(session, assistantMsg, proactiveControl);

				if (hasVisibleAssistantText) {
					// 与私信一致：不落 notification 通知表，走 newAgentMessage 消息渠道（Redis 未读标记 + 延迟事件）。
					// 用户停留在会话页时前端会立即调用已读端点清标记，3 秒后不会真正触发事件。
					try {
						const avatarFileId = character.avatarFileId ?? characterRow.avatarFileId;
						const packedAvatar = avatarFileId
							? await this.driveFileEntityService.pack(avatarFileId, {}).catch(() => null)
							: null;
						const agentAvatarUrl = packedAvatar?.thumbnailUrl ?? packedAvatar?.url ?? null;
						this.agentMessageNotifyService.notifyAgentMessage(me.id, {
							sessionId: session.id,
							sessionName: session.name,
							messageId: assistantMsg.id,
							messageText: buildAgentProactiveNotificationText(assistantText),
							agentAvatarUrl,
						});
					} catch {
						// Notification delivery does not change an already persisted message.
					}
				}

				if (memActive && hasVisibleAssistantText) {
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
							priorMessages: memPairs,
						currentUserText: userText,
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
				if (hasVisibleAssistantText) {
					this.agentProactiveScheduleService.armRandomAfterVisibleAssistant(session, asstNow, {
						minSilenceMinutes: session.randomProactiveMinSilenceMinutes ?? instanceMeta.agentProactiveMinSilenceMinutes,
						maxWindowMinutes: session.randomProactiveMaxWindowMinutes ?? instanceMeta.agentProactiveMaxWindowMinutes,
						daytimeWeight: session.randomProactiveDaytimeWeight ?? instanceMeta.agentProactiveDaytimeWeight,
						recencyBias: session.randomProactiveRecencyBias ?? instanceMeta.agentProactiveRecencyBias,
					});
				}
				session.updatedAt = asstNow;
				session.agentReplyPending = false;
				await this.agentSessionsRepository.save(session);

				const compressionProviderOn =
					this.agentCompressionMemoryService.resolveEffectiveProvider(session.agentLongMemoryProvider, instanceMeta) === 'compression';
				let compressionLlmPending = false;
				let compressionStickiesBaselineCount = 0;
				let compressionStickiesBaselineMaxUpdatedAt: string | null = null;
				if (compressionProviderOn && hasVisibleAssistantText) {
					// 基线同时记录条数与最新 updatedAt：压缩侧车「新建」或「重试更新」便签都会使
					// max(updatedAt) 超过基线，供前端轮询据此判定本轮压缩已落定（重试不增加条数，仅靠条数会漏判）
					const baselineStickies = await this.agentCompressionMemoryService.listStickies(session.id);
					compressionStickiesBaselineCount = baselineStickies.length;
					let baselineMaxMs = 0;
					for (const s of baselineStickies) baselineMaxMs = Math.max(baselineMaxMs, s.updatedAt.getTime());
					compressionStickiesBaselineMaxUpdatedAt = baselineMaxMs > 0 ? new Date(baselineMaxMs).toISOString() : null;
					// 复用主路径已加载的全量扫描行与 D 累计（AGENT_OVERVIEW_SCAN_LIMIT 口径）：
					// 既避免侧车另查 DB 与重复分词，更修复了侧车旧实现仅扫 500 条、
					// 在大上下文窗口（staged 区带位于 500 条之外）下永远触达不到而压缩不触发的问题。
					const { t1Ratio, t2Ratio } = this.agentCompressionMemoryService.resolveCompressionBandRatios(instanceMeta);
					let compressionRows: Pick<MiAgentMessage, 'id' | 'role' | 'content' | 'createdAt' | 'imageFileId' | 'imageRecognitionStatus' | 'imageRecognitionDescription' | 'proactiveScheduleControlRaw' | 'proactiveScheduleControlError' | 'timeTrusted'>[];
					let compressionSidecar: CompressionSidecarTokenD;
					if (historyScannedRows && historyDMap) {
						compressionRows = historyScannedRows;
						compressionSidecar = { dMap: historyDMap, hSend: historyBudgetTokens, t1: t1Ratio * historyBudgetTokens, t2: t2Ratio * historyBudgetTokens };
					} else {
						// 字符口径等非常规路径的兑底：仍按发信扫描上限加载并现算 D
						compressionRows = await this.agentMessagesRepository.find({
							where: { sessionId: session.id },
							order: { createdAt: 'DESC', id: 'DESC' },
							take: AGENT_OVERVIEW_SCAN_LIMIT,
							select: ['id', 'role', 'content', 'createdAt', 'imageFileId', 'imageRecognitionStatus', 'imageRecognitionDescription', 'proactiveScheduleControlRaw', 'proactiveScheduleControlError', 'timeTrusted'],
						});
						compressionSidecar = await this.agentCompressionMemoryService.computeSidecarTokenD({
							session, character, style, instanceMeta, rows: compressionRows,
						});
					}
					compressionLlmPending = await this.agentCompressionMemoryService.peekWillInvokeCompressionLlm(
						session, character, style, instanceMeta, me.id, compressionRows, compressionSidecar,
					);
					void this.agentCompressionMemoryService.afterAssistantForCompression(session, character, style, instanceMeta, me.id, compressionRows, compressionSidecar)
						.catch(() => { /* 压缩为侧车，不阻断主回复 */ });
				}

				await this.agentModelUsageService.finishLog(usageLog, instanceMeta, { status: 'success', ...llmUsageFields });

				return {
					userMessageId: userMsg.id,
					assistantMessageId: hasVisibleAssistantText ? assistantMsg.id : null,
					userImageRecognitionStatus: userMsg.imageRecognitionStatus,
					userImageRecognitionDescription: userMsg.imageRecognitionDescription,
					assistantText,
					longTermMemorySearchUnavailable,
					longTermMemoryAddScheduled,
					compressionLlmPending,
					compressionStickiesBaselineCount,
					compressionStickiesBaselineMaxUpdatedAt,
					proactiveScheduleControlFailed: assistantMsg.proactiveScheduleControlError != null,
					proactiveScheduleActionTypes: this.agentProactiveScheduleService.actionTypes(assistantMsg),
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
						userImageRecognitionStatus: null,
						userImageRecognitionDescription: null,
						assistantText: '',
						longTermMemorySearchUnavailable: false,
						longTermMemoryAddScheduled: false,
						compressionLlmPending: false,
						compressionStickiesBaselineCount: 0,
						compressionStickiesBaselineMaxUpdatedAt: null,
						proactiveScheduleControlFailed: false,
						proactiveScheduleActionTypes: [],
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
