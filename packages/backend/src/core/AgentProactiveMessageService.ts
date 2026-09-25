/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { LessThanOrEqual, MoreThan } from 'typeorm';
import type {
	AgentDialogueStylesRepository,
	AgentMessagesRepository,
	AgentProactiveSchedulesRepository,
	AgentSessionsRepository,
	UserProfilesRepository,
	UsersRepository,
} from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import type { MiAgentProactiveSchedule } from '@/models/AgentProactiveSchedule.js';
import type { MiAgentSession } from '@/models/AgentSession.js';
import type { AgentModelUsageKind, MiAgentModelUsageLog } from '@/models/AgentModelUsageLog.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentProactiveScheduleService } from '@/core/AgentProactiveScheduleService.js';
import { AgentExternalAuditService } from '@/core/AgentExternalAuditService.js';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';
import { AgentImageService } from '@/core/AgentImageService.js';
import { AgentStickerService } from '@/core/AgentStickerService.js';
import { MetaService } from '@/core/MetaService.js';
import { AgentMessageNotifyService } from '@/core/AgentMessageNotifyService.js';
import { buildAgentProactiveNotificationText } from '@/core/agent-proactive-notification-text.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { AGENT_IMAGE_WORLD_PROMPT } from '@/core/agent-image-presets.js';
import { stripPerformanceCues } from '@/core/agent-performance-cue.js';

const MAX_DUE_PER_TICK = 20;

type ProactiveUsageKind = Extract<AgentModelUsageKind, 'proactive_random' | 'proactive_scheduled'>;

type ProactiveAttemptResult = {
	claimed: boolean;
	delivered: boolean;
	errorCode: string | null;
};

class ProactiveAttemptError extends Error {
	constructor(public readonly code: string) {
		super(code);
	}
}

@Injectable()
export class AgentProactiveMessageService {
	constructor(
		@Inject(DI.agentSessionsRepository)
		private sessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentMessagesRepository)
		private messagesRepository: AgentMessagesRepository,

		@Inject(DI.agentProactiveSchedulesRepository)
		private schedulesRepository: AgentProactiveSchedulesRepository,

		@Inject(DI.agentDialogueStylesRepository)
		private stylesRepository: AgentDialogueStylesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private agentService: AgentService,
		private agentProactiveScheduleService: AgentProactiveScheduleService,
		private agentExternalAuditService: AgentExternalAuditService,
		private agentModelUsageService: AgentModelUsageService,
		private agentImageService: AgentImageService,
		private agentStickerService: AgentStickerService,
		private metaService: MetaService,
		private agentMessageNotifyService: AgentMessageNotifyService,
		private driveFileEntityService: DriveFileEntityService,
	) {}

	public async processDue(): Promise<void> {
		const now = new Date();
		const schedules = await this.schedulesRepository.createQueryBuilder('schedule')
			.innerJoin('schedule.session', 'session')
			.where('schedule.status = :status', { status: 'active' })
			.andWhere('schedule.nextRunAt <= :now', { now })
			.andWhere('session.moderationBanned = false')
			.orderBy('schedule.nextRunAt', 'ASC')
			.take(MAX_DUE_PER_TICK)
			.getMany();
		for (const schedule of schedules) {
			await this.processScheduled(schedule, now).catch(() => {});
		}

		const awaitingDrawSessions = await this.sessionsRepository.find({
			where: {
				randomProactiveEnabled: true,
				timeAwarenessEnabled: true,
				moderationBanned: false,
				randomProactiveNeedsUserMessage: false,
				randomProactiveAwaitingDraw: true,
				randomProactiveChainRemaining: MoreThan(0),
				randomProactiveAt: LessThanOrEqual(now),
			},
			order: { randomProactiveAt: 'ASC' },
			take: MAX_DUE_PER_TICK,
		});
		if (awaitingDrawSessions.length > 0) {
			const instance = await this.metaService.fetch(true);
			for (const session of awaitingDrawSessions) {
				const silenceEndsAt = session.randomProactiveAt!;
				const nextRandomProactiveAt = this.agentProactiveScheduleService.drawRandomProactiveAtAfterSilence(now, {
					maxWindowMinutes: session.randomProactiveMaxWindowMinutes ?? instance.agentProactiveMaxWindowMinutes,
					daytimeWeight: session.randomProactiveDaytimeWeight ?? instance.agentProactiveDaytimeWeight,
					recencyBias: session.randomProactiveRecencyBias ?? instance.agentProactiveRecencyBias,
				});
				await this.sessionsRepository.createQueryBuilder()
					.update()
					.set({
						randomProactiveAt: nextRandomProactiveAt,
						randomProactiveAwaitingDraw: false,
						updatedAt: now,
					})
					.where('id = :id AND "randomProactiveAt" = :silenceEndsAt AND "randomProactiveAwaitingDraw" = true AND "randomProactiveNeedsUserMessage" = false AND "randomProactiveEnabled" = true AND "timeAwarenessEnabled" = true AND "moderationBanned" = false AND "randomProactiveChainRemaining" > 0', {
						id: session.id,
						silenceEndsAt,
					})
					.execute();
			}
		}

		const sessions = await this.sessionsRepository.find({
			where: {
				randomProactiveEnabled: true,
				timeAwarenessEnabled: true,
				moderationBanned: false,
				randomProactiveNeedsUserMessage: false,
				randomProactiveAwaitingDraw: false,
				randomProactiveChainRemaining: MoreThan(0),
				randomProactiveAt: LessThanOrEqual(now),
			},
			order: { randomProactiveAt: 'ASC' },
			take: MAX_DUE_PER_TICK,
		});
		for (const session of sessions) {
			await this.processRandom(session).catch(() => {});
		}
	}

	private async processScheduled(schedule: MiAgentProactiveSchedule, now: Date): Promise<void> {
		const session = await this.sessionsRepository.findOneBy({ id: schedule.sessionId });
		if (!session || !session.scheduledProactiveEnabled || !session.timeAwarenessEnabled || session.moderationBanned) return;
		if (session.agentReplyPending) return;
		const trigger = [
			`<proactive_message type="scheduled" schedule_id="${schedule.id}">`,
			'The scheduled proactive message is due.',
			`Purpose: ${schedule.description}`,
			'</proactive_message>',
		].join('\n');
		const result = await this.generateProactiveReply(session, trigger, 'proactive_scheduled', async () => {
			await this.agentProactiveScheduleService.consumeScheduleRun(schedule, now);
		});
		if (!result.claimed) return;
		// 窄列更新：LLM 调用耗时长，整行 save 会用加载时的旧快照覆盖用户并发修改的会话字段
		const scheduledProactiveLastError = result.errorCode
			? { code: result.errorCode, occurredAt: new Date().toISOString() }
			: null;
		await this.sessionsRepository.createQueryBuilder()
			.update()
			.set({
				scheduledProactiveLastError,
				updatedAt: new Date(),
			})
			.where('id = :id', { id: session.id })
			.execute();
		session.scheduledProactiveLastError = scheduledProactiveLastError;
	}

	private async processRandom(session: MiAgentSession): Promise<void> {
		if (!session.randomProactiveAt || session.randomProactiveNeedsUserMessage || session.randomProactiveAwaitingDraw || session.moderationBanned) return;
		const trigger = [
			'<proactive_message type="random">',
			'The conversation has been inactive. Proactively continue it naturally using the conversation context.',
			'</proactive_message>',
		].join('\n');
		const result = await this.generateProactiveReply(session, trigger, 'proactive_random');
		if (!result.claimed) return;
		// The delivery was already consumed by the atomic claim inside generateProactiveReply;
		// record the outcome so the UI can surface skipped attempts.
		const randomProactiveLastError = result.errorCode
			? { code: result.errorCode, occurredAt: new Date().toISOString() }
			: null;
		await this.sessionsRepository.createQueryBuilder()
			.update()
			.set({
				randomProactiveLastError,
				updatedAt: new Date(),
			})
			.where('id = :id', { id: session.id })
			.execute();
		session.randomProactiveLastError = randomProactiveLastError;
	}

	private async generateProactiveReply(
		session: MiAgentSession,
		trigger: string,
		usageKind: ProactiveUsageKind,
		onClaim?: () => Promise<void>,
	): Promise<ProactiveAttemptResult> {
		const now = new Date();
		// The random path merges its delivery consumption into this atomic claim so that no
		// concurrent tick can observe an armed past-due delivery after the reply lock is
		// released; the scheduled path instead consumes its schedule row via onClaim.
		const isRandom = usageKind === 'proactive_random';
		const claimedRandomProactiveAt = isRandom ? session.randomProactiveAt : null;
		const occupied = await this.sessionsRepository.createQueryBuilder()
			.update()
			.set(isRandom
				? {
					agentReplyPending: true,
					randomProactiveAt: null,
					randomProactiveNeedsUserMessage: true,
					randomProactiveAwaitingDraw: false,
					randomProactiveChainRemaining: () => '"randomProactiveChainRemaining" - 1',
					updatedAt: now,
				}
				: { agentReplyPending: true, updatedAt: now })
			.where(isRandom
				? 'id = :id AND "agentReplyPending" = false AND "moderationBanned" = false AND "randomProactiveEnabled" = true AND "timeAwarenessEnabled" = true AND "randomProactiveNeedsUserMessage" = false AND "randomProactiveAwaitingDraw" = false AND "randomProactiveAt" = :claimedRandomProactiveAt AND "randomProactiveAt" <= :now AND "randomProactiveChainRemaining" > 0'
				: 'id = :id AND "agentReplyPending" = false AND "moderationBanned" = false', isRandom
				? { id: session.id, claimedRandomProactiveAt, now }
				: { id: session.id })
			.execute();
		if ((occupied.affected ?? 0) !== 1) {
			return { claimed: false, delivered: false, errorCode: null };
		}
		if (isRandom) {
			session.agentReplyPending = true;
			session.randomProactiveAt = null;
			session.randomProactiveNeedsUserMessage = true;
			session.randomProactiveAwaitingDraw = false;
			session.randomProactiveChainRemaining = Math.max(0, session.randomProactiveChainRemaining - 1);
			session.updatedAt = now;
		}

		let internalMessageId: string | null = null;
		let usageLog: MiAgentModelUsageLog | null = null;
		let usageLogSettled = false;
		let instance: Awaited<ReturnType<MetaService['fetch']>> | null = null;
		try {
			if (onClaim) {
				try {
					await onClaim();
				} catch {
					throw new ProactiveAttemptError('PROACTIVE_SCHEDULE_CLAIM_FAILED');
				}
			}
			const characterRow = await this.agentService.loadCharacterForAgentSessionOrThrow(session);
			this.agentService.assertAgentUserSessionChatAllowed(characterRow, session);
			if (!session.dialogueStyleId) throw new Error('No dialogue style.');
			const styleRow = await this.stylesRepository.findOneBy({ id: session.dialogueStyleId });
			if (!styleRow) throw new Error('No dialogue style.');
			const user = await this.usersRepository.findOneBy({ id: session.userId });
			if (!user) throw new Error('No user.');

			const usePublishedFace = session.sessionKind === 'community';
			const character = this.agentService.effectiveCharacterForLlm(characterRow, usePublishedFace);
			const style = this.agentService.effectiveStyleForSession(styleRow, session);
			const internal = await this.messagesRepository.insertOne({
				id: this.agentService.newId(),
				createdAt: now,
				sessionId: session.id,
				role: 'user',
				content: trigger,
				isInternal: true,
				clientRequestId: null,
				statsDialogueStyleId: session.dialogueStyleId,
				promptTokens: null,
				completionTokens: null,
			});
			internalMessageId = internal.id;

			instance = await this.metaService.fetch(true);
			// Proactive delivery is system-initiated: mirror the send path's pre-call check so
			// the system never spends provider quota that would drive the user's balance
			// negative without their action. usage 按量模式下要求余额 > 0。
			if (!await this.agentModelUsageService.canAffordModelCall(instance, session.agentModelId, session.userId)) {
				throw new ProactiveAttemptError('PROACTIVE_INSUFFICIENT_CREDIT');
			}
			const activeRules = this.agentService.resolveActiveRules(
				this.agentService.normalizeRules(character.rules),
				session.ruleOverrides,
			);
			const systemBase = this.agentService.buildSystemPrompt({
				globalPrompt: instance.agentGlobalSystemPrompt,
				character,
				style,
				timeAwarenessEnabled: true,
				activeRules,
			});
			// 表情包协议与发送路径同构：同一注入、同一用户视图转义、同一入库前数量过滤
			const stickerBlocks = await this.agentStickerService.buildSystemBlocks(instance, character);
			let system = (session.scheduledProactiveEnabled
				? `${systemBase}\n${this.agentProactiveScheduleService.systemPromptBlock}`
				: systemBase) + stickerBlocks.block;
			if (this.agentImageService.resolveImageModel(instance, session.agentImageModelId) != null) {
				system += `\n\n<agent_image_generation_protocol>\n${AGENT_IMAGE_WORLD_PROMPT}\n</agent_image_generation_protocol>`;
			}
			// 主动消息仅在对 timeAwarenessEnabled 已前置校验（processScheduled / armRandomAfterVisibleAssistant）的会话触发，历史一并注入发送时间
			const { messages } = await this.agentService.loadRecentMessagesForContextWithMeta(session.id, 48_000, 500, { timeAwarenessEnabled: true });
			const regexRules = this.agentService.normalizeRegexRules(character.regexRules);
			const history = messages
				.filter(message => message.role === 'user' || message.role === 'assistant')
				.filter(message => message.id !== internalMessageId)
				.map(message => {
					let content = this.agentService.applyRegexRules(message.content, message.role as 'user' | 'assistant', 'aiInvisible', regexRules);
					// 主动消息无桌宠请求上下文：历史中的表演指令一律剥离，避免诱导输出
					if (message.role === 'assistant') content = stripPerformanceCues(content);
					return {
						role: message.role as 'user' | 'assistant',
						content: message.role === 'user' ? this.agentStickerService.convertUserTextForLlm(content, stickerBlocks.emojiList) : content,
					};
				});
			const filteredTrigger = this.agentService.applyRegexRules(trigger, 'user', 'aiInvisible', regexRules);
			const selectedWorldbook = this.agentService.selectWorldbookEntriesForPrompt(character, filteredTrigger);
			const scheduledTrigger = await this.agentProactiveScheduleService.prependScheduleContext(filteredTrigger, session);
			const userText = this.agentService.wrapLatestUserTextWithStyleDirective(
				this.agentService.prependCurrentBeijingTime(scheduledTrigger, true),
				style,
				selectedWorldbook,
				activeRules,
			);
			const modelApiName = (await this.agentService.resolveModelApiNameForUser(instance, session.agentModelId ?? null, session.userId).catch(() => null)) ?? null;
			usageLog = await this.agentModelUsageService.startLog({
				userId: user.id,
				sessionId: session.id,
				characterId: session.characterId,
				dialogueStyleId: session.dialogueStyleId,
				// 日志记录解析后的实际生效模型（未指定时为全站默认），计费/免费额度/报表均依赖 modelId
				modelId: this.agentService.resolveEffectiveModelId(instance, session.agentModelId),
				modelApiName,
				usageKind,
			});

			let rawAssistantText: string;
			let proactiveUsageFields: {
				promptTokens?: number;
				completionTokens?: number;
				promptCacheHitTokens?: number | null;
				promptCacheMissTokens?: number | null;
			} = {};
			try {
				const llmResult = await this.agentService.invokeChatCompletions({
					system,
					messages: history,
					userText,
					sessionModelId: session.agentModelId,
					userId: session.userId,
				});
				rawAssistantText = llmResult.text;
				// 计费 token 数一律取自响应 usage（禁止本地估算）；缺失时由 finishLog 按策略兜底
				if (llmResult.usage) {
					proactiveUsageFields = {
						promptTokens: llmResult.usage.promptTokens,
						completionTokens: llmResult.usage.completionTokens,
						promptCacheHitTokens: llmResult.usage.promptCacheHitTokens ?? null,
						promptCacheMissTokens: llmResult.usage.promptCacheMissTokens ?? null,
					};
				}
			} catch {
				await this.agentModelUsageService.finishLog(usageLog, instance, {
					status: 'failed',
					errorCode: 'PROACTIVE_LLM_FAILED',
				}).catch(() => {});
				usageLogSettled = true;
				throw new ProactiveAttemptError('PROACTIVE_LLM_FAILED');
			}
			try {
				await this.agentModelUsageService.finishLog(usageLog, instance, { status: 'success', ...proactiveUsageFields });
				usageLogSettled = true;
			} catch {
				// A completed provider request must never be retried merely because its
				// accounting write failed after the model has already consumed quota.
				usageLogSettled = true;
				throw new ProactiveAttemptError('PROACTIVE_BILLING_FAILED');
			}
			const parsed = this.agentProactiveScheduleService.extractControl(rawAssistantText);
			// 与发送路径一致：生图模型为「无」时过滤模型受历史诱导输出的 [[agent_draw ...]] 占位符
			const preStickerVisibleContent = this.agentImageService.resolveImageModel(instance, session.agentImageModelId) == null
				? this.agentImageService.stripDrawPlaceholders(parsed.visibleContent)
				: parsed.visibleContent;
			const stickerVisibleContent = this.agentStickerService.enforceReplyLimits(preStickerVisibleContent, {
				enabled: instance.agentStickerEnabled === true,
				max: Math.max(0, Math.min(10, Math.trunc(Number(instance.agentStickerMaxPerMessage)))),
				emojiNames: new Set(stickerBlocks.emojiList.map(e => e.name)),
				stickerKeys: new Set(stickerBlocks.stickerKeys),
			});
			// 主动消息不支持表演指令：无论历史如何，回复中的 [[agent_cue]] 一律剥离
			const visibleContent = stripPerformanceCues(stickerVisibleContent);
			if (visibleContent.trim().length === 0) {
				throw new ProactiveAttemptError('PROACTIVE_EMPTY_REPLY');
			}
			const audit = await this.agentExternalAuditService.auditReply({
				instance,
				user,
				session,
				userText: trigger,
				assistantText: visibleContent,
			}).catch(() => ({ blocked: false as const }));
			if (audit.blocked) throw new ProactiveAttemptError('PROACTIVE_REPLY_BLOCKED');

			const assistantAt = new Date();
			const assistant = await this.messagesRepository.insertOne({
				id: this.agentService.newId(),
				createdAt: assistantAt,
				sessionId: session.id,
				role: 'assistant',
				content: visibleContent,
				rawContent: parsed.controlRaw ? rawAssistantText : null,
				proactiveScheduleControlRaw: parsed.controlRaw,
				proactiveScheduleControlError: null,
				isInternal: false,
				clientRequestId: null,
				statsDialogueStyleId: session.dialogueStyleId,
				promptTokens: null,
				completionTokens: null,
			});
			await this.agentProactiveScheduleService.applyAssistantControl(session, assistant, parsed);
			const minSilenceMinutes = Math.max(5, session.randomProactiveMinSilenceMinutes ?? instance.agentProactiveMinSilenceMinutes);
			const drawAfterAt = isRandom && session.randomProactiveChainRemaining > 0
				? new Date(assistantAt.getTime() + minSilenceMinutes * 60 * 1000)
				: null;
			// 窄列更新：LLM 调用期间用户可能并发修改会话（改名/切模型等），只写回本流程拥有的列
			const releaseQuery = this.sessionsRepository.createQueryBuilder()
				.update()
				.set(isRandom
					? {
						lastMessageAt: assistantAt,
						updatedAt: assistantAt,
						agentReplyPending: false,
						randomProactiveAt: drawAfterAt == null
							? null
							: () => 'CASE WHEN "randomProactiveEnabled" = true AND "timeAwarenessEnabled" = true AND "moderationBanned" = false AND "randomProactiveChainRemaining" > 0 THEN CAST(:drawAfterAt AS timestamptz) ELSE NULL END',
						randomProactiveNeedsUserMessage: drawAfterAt == null
							? true
							: () => 'NOT ("randomProactiveEnabled" = true AND "timeAwarenessEnabled" = true AND "moderationBanned" = false AND "randomProactiveChainRemaining" > 0)',
						randomProactiveAwaitingDraw: drawAfterAt == null
							? false
							: () => '"randomProactiveEnabled" = true AND "timeAwarenessEnabled" = true AND "moderationBanned" = false AND "randomProactiveChainRemaining" > 0',
					}
					: { lastMessageAt: assistantAt, updatedAt: assistantAt, agentReplyPending: false })
				.where('id = :id', { id: session.id });
			if (drawAfterAt != null) releaseQuery.setParameter('drawAfterAt', drawAfterAt);
			await releaseQuery.execute();
			// The effective character avatar is the agent's avatar for this session. When a
			// session has no separate avatar, it naturally falls back to the role avatar.
			const avatarFileId = character.avatarFileId ?? characterRow.avatarFileId;
			const packedAvatar = avatarFileId
				? await this.driveFileEntityService.pack(avatarFileId, {}).catch(() => null)
				: null;
			const agentAvatarUrl = packedAvatar?.thumbnailUrl ?? packedAvatar?.url ?? null;
			try {
				// 与私信一致：不落 notification 通知表，走 newAgentMessage 消息渠道（Redis 未读标记 + 延迟事件）
				this.agentMessageNotifyService.notifyAgentMessage(session.userId, {
					sessionId: session.id,
					sessionName: session.name,
					messageId: assistant.id,
					messageText: buildAgentProactiveNotificationText(visibleContent),
					agentAvatarUrl,
				});
			} catch {
				// Notification delivery does not change an already persisted message.
			}
			return { claimed: true, delivered: true, errorCode: null };
		} catch (error) {
			if (usageLog && instance && !usageLogSettled) {
				await this.agentModelUsageService.finishLog(usageLog, instance, {
					status: 'failed',
					errorCode: 'PROACTIVE_EXECUTION_FAILED',
				}).catch(() => {});
			}
			if (internalMessageId) {
				await this.messagesRepository.delete({ id: internalMessageId }).catch(() => {});
			}
			// 随机主动消息失败时终止本轮链，避免失败配置反复消耗额度。
			await this.sessionsRepository.createQueryBuilder()
				.update()
				.set(isRandom
					? { agentReplyPending: false, randomProactiveAt: null, randomProactiveAwaitingDraw: false, randomProactiveChainRemaining: 0, updatedAt: new Date() }
					: { agentReplyPending: false, updatedAt: new Date() })
				.where('id = :id', { id: session.id })
				.execute()
				.catch(() => {});
			return {
				claimed: true,
				delivered: false,
				errorCode: error instanceof ProactiveAttemptError ? error.code : 'PROACTIVE_EXECUTION_FAILED',
			};
		}
	}
}
