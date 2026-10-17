/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type {
	AgentMessagesRepository,
	AgentProactiveSchedulesRepository,
	AgentSessionCompressionStickyRepository,
	AgentSessionsRepository,
} from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';

const MAX_EXPORT_MESSAGES = 10_000;
const MAX_EXPORT_SCHEDULES = 5_000;
const MAX_EXPORT_STICKIES = 500;

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:chat',
	limit: { duration: ms('1hour'), max: 30 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			format: { type: 'string', enum: ['misskey-agent-session-export-v7'] },
			version: { type: 'integer', minimum: 7, maximum: 7 },
			sessionId: { type: 'string', format: 'misskey:id' },
			exportedAt: { type: 'string', format: 'date-time' },
			source: {
				type: 'object',
				properties: {
					characterId: { type: 'string', format: 'misskey:id' },
					sessionKind: { type: 'string', enum: ['draft_test', 'community'] },
					createdAt: { type: 'string', format: 'date-time' },
				},
			},
			settings: { type: 'object' },
			proactiveSchedules: { type: 'array', items: { type: 'object' } },
			compressionStickies: { type: 'array', items: { type: 'object' } },
			messages: { type: 'array', items: { type: 'object' } },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
	},
	required: ['sessionId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		@Inject(DI.agentProactiveSchedulesRepository)
		private agentProactiveSchedulesRepository: AgentProactiveSchedulesRepository,

		@Inject(DI.agentSessionCompressionStickyRepository)
		private agentSessionCompressionStickyRepository: AgentSessionCompressionStickyRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: '2c96a29f-2680-4ad0-a9cc-583918b97f8d' });
			}

			const [messages, proactiveSchedules, compressionStickies] = await Promise.all([
				this.agentMessagesRepository.find({
					where: { sessionId: session.id },
					order: { createdAt: 'ASC', id: 'ASC' },
					take: MAX_EXPORT_MESSAGES + 1,
				}),
				this.agentProactiveSchedulesRepository.find({
					where: { sessionId: session.id },
					order: { createdAt: 'ASC', id: 'ASC' },
					take: MAX_EXPORT_SCHEDULES + 1,
				}),
				this.agentSessionCompressionStickyRepository.find({
					where: { sessionId: session.id },
					order: { sortIndex: 'ASC', id: 'ASC' },
					take: MAX_EXPORT_STICKIES + 1,
				}),
			]);
			if (messages.length > MAX_EXPORT_MESSAGES) {
				throw new ApiError({ message: `A session export supports at most ${MAX_EXPORT_MESSAGES} messages.`, code: 'AGENT_SESSION_EXPORT_TOO_MANY_MESSAGES', id: 'c4937730-216f-4d39-8942-e48fdf3bd538' });
			}
			if (proactiveSchedules.length > MAX_EXPORT_SCHEDULES) {
				throw new ApiError({ message: `A session export supports at most ${MAX_EXPORT_SCHEDULES} proactive schedules.`, code: 'AGENT_SESSION_EXPORT_TOO_MANY_SCHEDULES', id: '885e78f6-33f8-45f3-a45f-a45ed721ac21' });
			}
			if (compressionStickies.length > MAX_EXPORT_STICKIES) {
				throw new ApiError({ message: `A session export supports at most ${MAX_EXPORT_STICKIES} compression stickies.`, code: 'AGENT_SESSION_EXPORT_TOO_MANY_STICKIES', id: '65065aa4-a8cc-4e31-a5a5-08a14dfdfd08' });
			}

			return {
				format: 'misskey-agent-session-export-v7' as const,
				version: 7 as const,
				sessionId: session.id,
				exportedAt: new Date().toISOString(),
				source: {
					characterId: session.characterId,
					sessionKind: session.sessionKind,
					createdAt: session.createdAt.toISOString(),
				},
				settings: {
					name: session.name,
					dialogueStyleId: session.dialogueStyleId,
					plazaStatsDialogueStyleId: session.plazaStatsDialogueStyleId,
					agentModelId: session.agentModelId,
					agentCompressionModelId: session.agentCompressionModelId,
					agentImageModelId: session.agentImageModelId,
					agentVisionModelId: session.agentVisionModelId,
					agentImageSettings: session.agentImageSettings ?? {},
					agentLongMemoryProvider: session.agentLongMemoryProvider,
					agentLongMemoryEnabled: session.agentLongMemoryEnabled,
					agentLongMemoryTopK: session.agentLongMemoryTopK,
					agentLongMemoryMinScore: session.agentLongMemoryMinScore,
					agentLongMemoryInjectMaxChars: session.agentLongMemoryInjectMaxChars,
					agentLongMemoryAddMaxRounds: session.agentLongMemoryAddMaxRounds,
					agentLongMemoryAddEveryNRounds: session.agentLongMemoryAddEveryNRounds,
					segmentedOutputEnabled: session.segmentedOutputEnabled,
					timeAwarenessEnabled: session.timeAwarenessEnabled,
					randomProactiveEnabled: session.randomProactiveEnabled,
					scheduledProactiveEnabled: session.scheduledProactiveEnabled,
					randomProactiveMinSilenceMinutes: session.randomProactiveMinSilenceMinutes,
					randomProactiveMaxWindowMinutes: session.randomProactiveMaxWindowMinutes,
					randomProactiveDaytimeWeight: session.randomProactiveDaytimeWeight,
					randomProactiveRecencyBias: session.randomProactiveRecencyBias,
					randomProactiveChainLength: session.randomProactiveChainLength,
					ruleOverrides: session.ruleOverrides ?? {},
				},
				proactiveSchedules: proactiveSchedules.map(schedule => ({
					sourceId: schedule.id,
					createdAt: schedule.createdAt.toISOString(),
					updatedAt: schedule.updatedAt.toISOString(),
					status: schedule.status,
					description: schedule.description,
					trigger: schedule.trigger,
					nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
					lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
					remainingRuns: schedule.remainingRuns,
				})),
				compressionStickies: compressionStickies.map(sticky => ({
					sourceId: sticky.id,
					createdAt: sticky.createdAt.toISOString(),
					updatedAt: sticky.updatedAt.toISOString(),
					fromMessageId: sticky.fromMessageId,
					toMessageId: sticky.toMessageId,
					summaryText: sticky.summaryText,
					state: sticky.state,
					userOverridden: sticky.userOverridden,
					sourceFingerprint: sticky.sourceFingerprint,
					errorMessage: sticky.errorMessage,
					lastModelId: sticky.lastModelId,
					sortIndex: sticky.sortIndex,
					retryCount: sticky.retryCount,
				})),
				messages: messages.map(message => ({
					sourceId: message.id,
					createdAt: message.createdAt.toISOString(),
					timeTrusted: message.timeTrusted,
					role: message.role,
					content: message.content,
					imageFileId: message.imageFileId,
					imageRecognitionStatus: message.imageRecognitionStatus,
					imageRecognitionDescription: message.imageRecognitionDescription,
					rawContent: message.rawContent,
					proactiveScheduleControlRaw: message.proactiveScheduleControlRaw,
					proactiveScheduleControlError: message.proactiveScheduleControlError,
					isInternal: message.isInternal,
					statsDialogueStyleId: message.statsDialogueStyleId,
					promptTokens: message.promptTokens,
					completionTokens: message.completionTokens,
				})),
			};
		});
	}
}
