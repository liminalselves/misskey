/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { LessThanOrEqual } from 'typeorm';
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
import { MetaService } from '@/core/MetaService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { buildAgentProactiveNotificationText } from '@/core/agent-proactive-notification-text.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { AGENT_IMAGE_WORLD_PROMPT } from '@/core/agent-image-presets.js';

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
		private metaService: MetaService,
		private notificationService: NotificationService,
		private driveFileEntityService: DriveFileEntityService,
	) {}

	public async processDue(): Promise<void> {
		const now = new Date();
		const schedules = await this.schedulesRepository.find({
			where: { status: 'active', nextRunAt: LessThanOrEqual(now) },
			order: { nextRunAt: 'ASC' },
			take: MAX_DUE_PER_TICK,
		});
		for (const schedule of schedules) {
			await this.processScheduled(schedule, now).catch(() => {});
		}

		const sessions = await this.sessionsRepository.find({
			where: {
				randomProactiveEnabled: true,
				timeAwarenessEnabled: true,
				randomProactiveNeedsUserMessage: false,
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
		session.scheduledProactiveLastError = result.errorCode
			? { code: result.errorCode, occurredAt: new Date().toISOString() }
			: null;
		session.updatedAt = new Date();
		await this.sessionsRepository.save(session);
	}

	private async processRandom(session: MiAgentSession): Promise<void> {
		if (!session.randomProactiveAt || session.randomProactiveNeedsUserMessage || session.moderationBanned) return;
		const trigger = [
			'<proactive_message type="random">',
			'The conversation has been inactive. Proactively continue it naturally using the conversation context.',
			'</proactive_message>',
		].join('\n');
		const result = await this.generateProactiveReply(session, trigger, 'proactive_random');
		if (!result.claimed) return;
		// The delivery was already consumed by the atomic claim inside generateProactiveReply;
		// record the outcome so the UI can surface skipped attempts.
		session.randomProactiveLastError = result.errorCode
			? { code: result.errorCode, occurredAt: new Date().toISOString() }
			: null;
		session.updatedAt = new Date();
		await this.sessionsRepository.save(session);
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
		const occupied = await this.sessionsRepository.createQueryBuilder()
			.update()
			.set(isRandom
				? { agentReplyPending: true, randomProactiveAt: null, randomProactiveNeedsUserMessage: true, updatedAt: now }
				: { agentReplyPending: true, updatedAt: now })
			.where(isRandom
				? 'id = :id AND "agentReplyPending" = false AND "randomProactiveAt" IS NOT NULL'
				: 'id = :id AND "agentReplyPending" = false', { id: session.id })
			.execute();
		if ((occupied.affected ?? 0) !== 1) {
			return { claimed: false, delivered: false, errorCode: null };
		}
		if (isRandom) {
			session.agentReplyPending = true;
			session.randomProactiveAt = null;
			session.randomProactiveNeedsUserMessage = true;
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
			const style = this.agentService.effectiveStyleForLlm(styleRow, usePublishedFace);
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
			const systemBase = this.agentService.buildSystemPrompt({
				globalPrompt: instance.agentGlobalSystemPrompt,
				character,
				style,
				timeAwarenessEnabled: true,
			});
			let system = session.scheduledProactiveEnabled
				? `${systemBase}\n${this.agentProactiveScheduleService.systemPromptBlock}`
				: systemBase;
			if (this.agentImageService.resolveImageModel(instance, session.agentImageModelId) != null) {
				system += `\n\n<agent_image_generation_protocol>\n${AGENT_IMAGE_WORLD_PROMPT}\n</agent_image_generation_protocol>`;
			}
			const { messages } = await this.agentService.loadRecentMessagesForContextWithMeta(session.id, 48_000);
			const regexRules = this.agentService.normalizeRegexRules(character.regexRules);
			const history = messages
				.filter(message => message.role === 'user' || message.role === 'assistant')
				.filter(message => message.id !== internalMessageId)
				.map(message => ({
					role: message.role as 'user' | 'assistant',
					content: this.agentService.applyRegexRules(message.content, message.role as 'user' | 'assistant', 'aiInvisible', regexRules),
				}));
			const filteredTrigger = this.agentService.applyRegexRules(trigger, 'user', 'aiInvisible', regexRules);
			const selectedWorldbook = this.agentService.selectWorldbookEntriesForPrompt(character, filteredTrigger);
			const scheduledTrigger = await this.agentProactiveScheduleService.prependScheduleContext(filteredTrigger, session);
			const userText = this.agentService.wrapLatestUserTextWithStyleDirective(
				this.agentService.prependCurrentBeijingTime(scheduledTrigger, true),
				style,
				selectedWorldbook,
			);
			const modelApiName = (() => {
				try {
					return this.agentService.resolveModelApiName(instance, session.agentModelId ?? null);
				} catch {
					return null;
				}
			})();
			usageLog = await this.agentModelUsageService.startLog({
				userId: user.id,
				sessionId: session.id,
				characterId: session.characterId,
				dialogueStyleId: session.dialogueStyleId,
				modelId: session.agentModelId ?? null,
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
			if (parsed.visibleContent.trim().length === 0) {
				throw new ProactiveAttemptError('PROACTIVE_EMPTY_REPLY');
			}
			const audit = await this.agentExternalAuditService.auditReply({
				instance,
				user,
				session,
				userText: trigger,
				assistantText: parsed.visibleContent,
			}).catch(() => ({ blocked: false as const }));
			if (audit.blocked) throw new ProactiveAttemptError('PROACTIVE_REPLY_BLOCKED');

			const assistantAt = new Date();
			const assistant = await this.messagesRepository.insertOne({
				id: this.agentService.newId(),
				createdAt: assistantAt,
				sessionId: session.id,
				role: 'assistant',
				content: parsed.visibleContent,
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
			session.lastMessageAt = assistantAt;
			session.updatedAt = assistantAt;
			session.agentReplyPending = false;
			await this.sessionsRepository.save(session);
			// The effective character avatar is the agent's avatar for this session. When a
			// session has no separate avatar, it naturally falls back to the role avatar.
			const avatarFileId = character.avatarFileId ?? characterRow.avatarFileId;
			const packedAvatar = avatarFileId
				? await this.driveFileEntityService.pack(avatarFileId, {}).catch(() => null)
				: null;
			const agentAvatarUrl = packedAvatar?.thumbnailUrl ?? packedAvatar?.url ?? null;
			try {
				this.notificationService.createNotification(session.userId, 'agentProactiveMessage', {
					sessionId: session.id,
					sessionName: session.name,
					agentAvatarUrl,
					messageId: assistant.id,
					messageText: buildAgentProactiveNotificationText(parsed.visibleContent),
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
			session.agentReplyPending = false;
			session.updatedAt = new Date();
			await this.sessionsRepository.save(session).catch(() => {});
			return {
				claimed: true,
				delivered: false,
				errorCode: error instanceof ProactiveAttemptError ? error.code : 'PROACTIVE_EXECUTION_FAILED',
			};
		}
	}
}
