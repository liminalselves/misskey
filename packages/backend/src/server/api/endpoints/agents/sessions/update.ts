/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentDialogueStylesRepository, AgentSessionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { MetaService } from '@/core/MetaService.js';
import { agentLongMemoryProviderIds } from '@/core/AgentCompressionMemoryService.js';
import { AgentImageService } from '@/core/AgentImageService.js';
import { AgentVisionService } from '@/core/AgentVisionService.js';
import { AgentProactiveScheduleService } from '@/core/AgentProactiveScheduleService.js';

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
			id: { type: 'string', format: 'misskey:id' },
			name: { type: 'string' },
			dialogueStyleId: { type: 'string', format: 'misskey:id', nullable: true },
			agentModelId: { type: 'string', nullable: true },
			agentLongMemoryEnabled: { type: 'boolean' },
			agentLongMemoryTopK: { type: 'number' },
			agentLongMemoryMinScore: { type: 'number', nullable: true },
			agentLongMemoryInjectMaxChars: { type: 'number' },
			agentLongMemoryAddMaxRounds: { type: 'integer', nullable: true },
			agentLongMemoryAddEveryNRounds: { type: 'integer', nullable: true },
			agentLongMemoryProvider: { type: 'string' },
			agentCompressionModelId: { type: 'string', nullable: true },
			agentImageModelId: { type: 'string', nullable: true },
			agentVisionModelId: { type: 'string', nullable: true },
			agentImageSettings: { type: 'object' },
			segmentedOutputEnabled: { type: 'boolean' },
			compressionCacheInvalidated: { type: 'boolean' },
			updatedAt: { type: 'string', format: 'date-time' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1, maxLength: 256, nullable: true },
		dialogueStyleId: { type: 'string', format: 'misskey:id', nullable: true },
		agentModelId: { type: 'string', nullable: true, maxLength: 64 },
		agentLongMemoryEnabled: { type: 'boolean', nullable: true },
		agentLongMemoryTopK: { type: 'integer', minimum: 1, maximum: 100, nullable: true },
		agentLongMemoryMinScore: { type: 'number', minimum: 0, maximum: 1, nullable: true },
		agentLongMemoryInjectMaxChars: { type: 'integer', minimum: 200, maximum: 50000, nullable: true },
		agentLongMemoryAddMaxRounds: { type: 'integer', minimum: 1, maximum: 24, nullable: true },
		agentLongMemoryAddEveryNRounds: { type: 'integer', minimum: 1, maximum: 48, nullable: true },
		agentLongMemoryProvider: { type: 'string', enum: [...agentLongMemoryProviderIds] },
		agentCompressionModelId: { type: 'string', nullable: true, maxLength: 64 },
		agentImageModelId: { type: 'string', nullable: true, maxLength: 128 },
		agentVisionModelId: { type: 'string', nullable: true, maxLength: 128 },
		agentImageSettings: {
			type: 'object',
			nullable: true,
			additionalProperties: true,
		},
		segmentedOutputEnabled: { type: 'boolean' },
		timeAwarenessEnabled: { type: 'boolean' },
		randomProactiveEnabled: { type: 'boolean' },
		scheduledProactiveEnabled: { type: 'boolean' },
		randomProactiveMinSilenceMinutes: { type: 'integer', nullable: true, minimum: 5, maximum: 1440 },
		randomProactiveMaxWindowMinutes: { type: 'integer', nullable: true, minimum: 30, maximum: 10080 },
		randomProactiveDaytimeWeight: { type: 'integer', nullable: true, minimum: 1, maximum: 10 },
		randomProactiveRecencyBias: { type: 'integer', nullable: true, minimum: 1, maximum: 10 },
		ruleOverrides: {
			type: 'object',
			nullable: true,
			additionalProperties: { type: 'boolean' },
		},
	},
	required: ['sessionId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		private agentService: AgentService,
		private metaService: MetaService,
		private agentImageService: AgentImageService,
		private agentVisionService: AgentVisionService,
		private agentProactiveScheduleService: AgentProactiveScheduleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!row || row.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'f4a5b6c7-d8e9-0123-7890-234567890123' });
			}
			const characterRow = await this.agentService.loadCharacterForAgentSessionOrThrow(row);
			this.agentService.assertAgentUserSessionChatAllowed(characterRow, row);
			const instanceMeta = await this.metaService.fetch(true);

			if (ps.name !== undefined && ps.name !== null) {
				row.name = ps.name.slice(0, 256);
			}
			if (ps.dialogueStyleId !== undefined) {
				if (ps.dialogueStyleId === null) {
					row.dialogueStyleId = null;
				} else {
					const style = await this.agentDialogueStylesRepository.findOneBy({ id: ps.dialogueStyleId });
					if (!style) {
						throw new ApiError({ message: 'No such style.', code: 'NO_SUCH_STYLE', id: 'b4c5d6e7-f8a9-0123-4567-890123456789' });
					}
					await this.agentService.assertCanUseDialogueStyle(me.id, style, { forNewSession: true });
					if (row.sessionKind === 'community' && !this.agentService.isListedOnPlazaStyle(style)) {
						throw new ApiError({ message: 'Style is not published.', code: 'STYLE_NOT_PUBLISHED', id: 'f5a6b7c8-d9e0-1234-8901-456789012345' });
					}
					row.dialogueStyleId = style.id;
					if (row.plazaStatsDialogueStyleId == null) {
						row.plazaStatsDialogueStyleId = style.id;
					}
				}
			}
			if (ps.agentModelId !== undefined) {
				const mid = ps.agentModelId === '' ? null : ps.agentModelId;
				if (mid) {
					await this.agentService.resolveModelApiNameForUser(instanceMeta, mid, me.id);
				}
				row.agentModelId = mid;
			}
			if (ps.agentLongMemoryEnabled !== undefined && ps.agentLongMemoryEnabled !== null) {
				row.agentLongMemoryEnabled = ps.agentLongMemoryEnabled;
			}
			if (ps.agentLongMemoryTopK !== undefined && ps.agentLongMemoryTopK !== null) {
				row.agentLongMemoryTopK = Math.max(1, Math.min(100, ps.agentLongMemoryTopK));
			}
			if (ps.agentLongMemoryMinScore !== undefined) {
				if (ps.agentLongMemoryMinScore === null) {
					row.agentLongMemoryMinScore = null;
				} else {
					row.agentLongMemoryMinScore = Math.max(0, Math.min(1, ps.agentLongMemoryMinScore));
				}
			}
			if (ps.agentLongMemoryInjectMaxChars !== undefined && ps.agentLongMemoryInjectMaxChars !== null) {
				row.agentLongMemoryInjectMaxChars = Math.max(200, Math.min(50000, ps.agentLongMemoryInjectMaxChars));
			}
			if (ps.agentLongMemoryAddMaxRounds !== undefined) {
				if (ps.agentLongMemoryAddMaxRounds === null) {
					row.agentLongMemoryAddMaxRounds = null;
				} else {
					row.agentLongMemoryAddMaxRounds = Math.max(1, Math.min(24, ps.agentLongMemoryAddMaxRounds));
				}
			}
			if (ps.agentLongMemoryAddEveryNRounds !== undefined) {
				if (ps.agentLongMemoryAddEveryNRounds === null) {
					row.agentLongMemoryAddEveryNRounds = null;
				} else {
					row.agentLongMemoryAddEveryNRounds = Math.max(1, Math.min(48, ps.agentLongMemoryAddEveryNRounds));
				}
			}
			if (ps.agentLongMemoryProvider !== undefined) {
				row.agentLongMemoryProvider = ps.agentLongMemoryProvider;
			}
			if (ps.agentCompressionModelId !== undefined) {
				if (ps.agentCompressionModelId === null || ps.agentCompressionModelId === '') {
					row.agentCompressionModelId = null;
				} else {
					await this.agentService.resolveModelApiNameForUser(instanceMeta, ps.agentCompressionModelId.trim(), me.id);
					row.agentCompressionModelId = ps.agentCompressionModelId.trim();
				}
			}
			if (ps.agentImageModelId !== undefined) {
				const mid = ps.agentImageModelId == null || ps.agentImageModelId.trim() === '' ? null : ps.agentImageModelId.trim();
				if (mid != null && this.agentImageService.resolveImageModel(instanceMeta, mid) == null) {
					throw new ApiError({ message: 'No such image model.', code: 'NO_SUCH_AGENT_IMAGE_MODEL', id: '02065f09-7ac7-49e0-ac0a-d9f64a82a0f9' });
				}
				row.agentImageModelId = mid;
			}
			if (ps.agentVisionModelId !== undefined) {
				const mid = ps.agentVisionModelId == null || ps.agentVisionModelId.trim() === '' ? null : ps.agentVisionModelId.trim();
				if (mid != null && this.agentVisionService.resolveVisionModel(instanceMeta, mid) == null) {
					throw new ApiError({ message: 'No such image recognition model.', code: 'NO_SUCH_AGENT_VISION_MODEL', id: '1b2541f8-0cb5-4ef1-b633-7b5c89ad3b3e' });
				}
				row.agentVisionModelId = mid;
			}
			if (ps.agentImageSettings !== undefined) {
				row.agentImageSettings = this.normalizeAgentImageSettings(ps.agentImageSettings);
			}
			if (ps.segmentedOutputEnabled !== undefined) {
				row.segmentedOutputEnabled = ps.segmentedOutputEnabled;
			}
			const nextTimeAwarenessEnabled = ps.timeAwarenessEnabled ?? row.timeAwarenessEnabled;
			const nextRandomProactiveEnabled = ps.randomProactiveEnabled ?? row.randomProactiveEnabled;
			const nextScheduledProactiveEnabled = ps.scheduledProactiveEnabled ?? row.scheduledProactiveEnabled;
			if (!nextTimeAwarenessEnabled && (nextRandomProactiveEnabled || nextScheduledProactiveEnabled)) {
				throw new ApiError({
					message: 'Time awareness must remain enabled while proactive messages are enabled.',
					code: 'AGENT_TIME_AWARENESS_REQUIRED',
					id: 'a9e4b3ea-644f-4bd0-924a-592c886369c6',
					kind: 'client',
					httpStatusCode: 400,
				});
			}
			if (ps.timeAwarenessEnabled !== undefined) {
				row.timeAwarenessEnabled = ps.timeAwarenessEnabled;
			}
			if (ps.randomProactiveEnabled !== undefined) {
				row.randomProactiveEnabled = ps.randomProactiveEnabled;
				if (!ps.randomProactiveEnabled) {
					row.randomProactiveAt = null;
					row.randomProactiveNeedsUserMessage = false;
				}
			}
			if (ps.scheduledProactiveEnabled !== undefined) {
				row.scheduledProactiveEnabled = ps.scheduledProactiveEnabled;
			}
			if (ps.randomProactiveMinSilenceMinutes !== undefined) {
				row.randomProactiveMinSilenceMinutes = ps.randomProactiveMinSilenceMinutes === null
					? null
					: Math.max(5, Math.min(1440, ps.randomProactiveMinSilenceMinutes));
			}
			if (ps.randomProactiveMaxWindowMinutes !== undefined) {
				row.randomProactiveMaxWindowMinutes = ps.randomProactiveMaxWindowMinutes === null
					? null
					: Math.max(30, Math.min(10080, ps.randomProactiveMaxWindowMinutes));
			}
			if (ps.randomProactiveDaytimeWeight !== undefined) {
				row.randomProactiveDaytimeWeight = ps.randomProactiveDaytimeWeight === null
					? null
					: Math.max(1, Math.min(10, ps.randomProactiveDaytimeWeight));
			}
			if (ps.randomProactiveRecencyBias !== undefined) {
				row.randomProactiveRecencyBias = ps.randomProactiveRecencyBias === null
					? null
					: Math.max(1, Math.min(10, ps.randomProactiveRecencyBias));
			}
			if (ps.ruleOverrides !== undefined) {
				row.ruleOverrides = ps.ruleOverrides != null
					? Object.fromEntries(
						Object.entries(ps.ruleOverrides).filter(([, v]) => typeof v === 'boolean'),
					) as Record<string, boolean>
					: {};
			}

			row.updatedAt = new Date();
			await this.agentSessionsRepository.save(row);
			if (ps.scheduledProactiveEnabled === false) {
				await this.agentProactiveScheduleService.pauseAll(row.id);
			} else if (ps.scheduledProactiveEnabled === true) {
				await this.agentProactiveScheduleService.resumeAll(row.id);
			}
			return {
				id: row.id,
				name: row.name,
				dialogueStyleId: row.dialogueStyleId,
				agentModelId: row.agentModelId,
				agentLongMemoryEnabled: row.agentLongMemoryEnabled,
				agentLongMemoryTopK: row.agentLongMemoryTopK,
				agentLongMemoryMinScore: row.agentLongMemoryMinScore,
				agentLongMemoryInjectMaxChars: row.agentLongMemoryInjectMaxChars,
				agentLongMemoryAddMaxRounds: row.agentLongMemoryAddMaxRounds,
				agentLongMemoryAddEveryNRounds: row.agentLongMemoryAddEveryNRounds,
				agentLongMemoryProvider: row.agentLongMemoryProvider,
				agentCompressionModelId: row.agentCompressionModelId,
				agentImageModelId: row.agentImageModelId,
				agentVisionModelId: row.agentVisionModelId,
				agentImageSettings: row.agentImageSettings ?? {},
				segmentedOutputEnabled: row.segmentedOutputEnabled,
				timeAwarenessEnabled: row.timeAwarenessEnabled,
				randomProactiveEnabled: row.randomProactiveEnabled,
				scheduledProactiveEnabled: row.scheduledProactiveEnabled,
				compressionCacheInvalidated: false,
				updatedAt: row.updatedAt.toISOString(),
			};
		});
	}

	private normalizeAgentImageSettings(raw: Record<string, unknown> | null | undefined): Record<string, unknown> {
		if (raw == null || typeof raw !== 'object') return {};
		const out: Record<string, unknown> = {};
		if (typeof raw.size === 'string' && ['portrait', 'landscape', 'square'].includes(raw.size)) out.size = raw.size;
		if (typeof raw.artistPresetId === 'string' && raw.artistPresetId.length <= 128) out.artistPresetId = raw.artistPresetId;
		for (const key of ['steps', 'scale', 'cfgRescale']) {
			const n = Number(raw[key]);
			if (Number.isFinite(n)) out[key] = n;
		}
		for (const key of ['sampler', 'noiseSchedule']) {
			if (typeof raw[key] === 'string' && raw[key].length <= 128) out[key] = raw[key];
		}
		// 会话级自动生图开关与张数（张数 clamp 到 0..12，与管理后台「每轮最多图片」取值范围一致）
		if (typeof raw.autoDraw === 'boolean') out.autoDraw = raw.autoDraw;
		const autoDrawCount = Number(raw.autoDrawCount);
		if (Number.isFinite(autoDrawCount)) out.autoDrawCount = Math.max(0, Math.min(12, Math.trunc(autoDrawCount)));
		return out;
	}
}
