/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentMessagesRepository, AgentSessionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { MetaService } from '@/core/MetaService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import type { MiAgentCharacter } from '@/models/AgentCharacter.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:chat',
	limit: { duration: ms('1hour'), max: 180 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: { type: 'string', format: 'misskey:id' },
			name: { type: 'string' },
			characterId: { type: 'string', format: 'misskey:id' },
			dialogueStyleId: { type: 'string', format: 'misskey:id', nullable: true },
			sessionKind: { type: 'string', enum: ['draft_test', 'community'] },
			characterName: { type: 'string' },
			characterAvatar: { type: 'object', ref: 'DriveFile', nullable: true },
			lastMessageAt: { type: 'string', format: 'date-time', nullable: true },
			createdAt: { type: 'string', format: 'date-time' },
			agentModelId: { type: 'string', nullable: true },
			agentCompressionModelId: { type: 'string', nullable: true },
			agentImageModelId: { type: 'string', nullable: true },
			agentVisionModelId: { type: 'string', nullable: true },
			agentImageSettings: { type: 'object' },
			agentLongMemoryEnabled: { type: 'boolean' },
			agentLongMemoryTopK: { type: 'number' },
			agentLongMemoryMinScore: { type: 'number', nullable: true },
			agentLongMemoryInjectMaxChars: { type: 'number' },
			agentLongMemoryAddMaxRounds: { type: 'integer', nullable: true },
			agentLongMemoryAddEveryNRounds: { type: 'integer', nullable: true },
			agentLongMemoryProvider: { type: 'string' },
			agentReplyPending: { type: 'boolean' },
			segmentedOutputEnabled: { type: 'boolean' },
			timeAwarenessEnabled: { type: 'boolean' },
			randomProactiveEnabled: { type: 'boolean' },
			scheduledProactiveEnabled: { type: 'boolean' },
			randomProactiveLastError: { type: 'object', nullable: true },
			scheduledProactiveLastError: { type: 'object', nullable: true },
			sessionModerationBanned: { type: 'boolean' },
			characterModerationBanned: { type: 'boolean' },
			sessionModerationBannedReason: { type: 'string', nullable: true },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { sessionId: { type: 'string', format: 'misskey:id' } },
	required: ['sessionId'],
} as const;

/**
 * pending 标志位的「孤儿」判定阈值。
 * LLM 调用本身硬上限 120s（超时即 abort），加上图像识别/审核等环节也远小于此值；
 * 若 agentReplyPending=true 但 updatedAt 超过该阈值无任何变化，基本可判定为
 * 后端热重启/崩溃杀死了在途请求而遗留的孤儿标志位，需主动清除，
 * 否则会话将永久无法再发送（原子 occupy 的 WHERE "agentReplyPending"=false 永远失败）。
 */
const AGENT_REPLY_PENDING_STALE_MS = ms('5min');

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		private agentService: AgentService,
		private driveFileEntityService: DriveFileEntityService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const instance = await this.metaService.fetch(true);
			const row = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!row || row.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'a5b6c7d8-e9f0-1234-8901-345678901234' });
			}
			if (row.agentReplyPending) {
				const latest = await this.agentMessagesRepository.findOne({
					where: { sessionId: row.id },
					order: { createdAt: 'DESC', id: 'DESC' },
				});
				// 自愈①：最新一条已是助手回复，说明回复其实已落库，仅标志位未清。
				const healedByLatestAssistant = latest?.role === 'assistant';
				// 自愈②：标志位卡死超时（典型为后端热重启杀死在途请求遗留的孤儿 pending）。
				const healedByStale = Date.now() - row.updatedAt.getTime() > AGENT_REPLY_PENDING_STALE_MS;
				if (healedByLatestAssistant || healedByStale) {
					row.agentReplyPending = false;
					await this.agentSessionsRepository.save(row);
				}
			}
			const characterRow = await this.agentService.loadCharacterForAgentSessionOrThrow(row);
			const characterDisplay = row.sessionKind === 'community' && this.agentService.isListedOnPlazaCharacter(characterRow as MiAgentCharacter)
				? this.agentService.characterPlazaDisplayFields(characterRow as MiAgentCharacter)
				: { name: characterRow.name, avatarFileId: characterRow.avatarFileId };
			const characterAvatar = characterDisplay.avatarFileId
				? await this.driveFileEntityService.pack(characterDisplay.avatarFileId, {})
					.catch(() => null)
				: null;
			return {
				id: row.id,
				name: row.name,
				characterId: row.characterId,
				dialogueStyleId: row.dialogueStyleId,
				sessionKind: row.sessionKind,
				characterName: characterDisplay.name,
				characterAvatar,
				lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
				createdAt: row.createdAt.toISOString(),
				agentModelId: row.agentModelId,
				agentCompressionModelId: row.agentCompressionModelId,
				agentImageModelId: row.agentImageModelId,
				agentVisionModelId: row.agentVisionModelId,
				agentImageSettings: { autoDraw: true, autoDrawCount: instance.agentImageMaxPerReply, ...(row.agentImageSettings ?? {}) },
				agentLongMemoryEnabled: row.agentLongMemoryEnabled,
				agentLongMemoryTopK: row.agentLongMemoryTopK,
				agentLongMemoryMinScore: row.agentLongMemoryMinScore,
				agentLongMemoryInjectMaxChars: row.agentLongMemoryInjectMaxChars,
				agentLongMemoryAddMaxRounds: row.agentLongMemoryAddMaxRounds,
				agentLongMemoryAddEveryNRounds: row.agentLongMemoryAddEveryNRounds,
				agentLongMemoryProvider: row.agentLongMemoryProvider,
				agentReplyPending: row.agentReplyPending,
				segmentedOutputEnabled: row.segmentedOutputEnabled,
				timeAwarenessEnabled: row.timeAwarenessEnabled,
				randomProactiveEnabled: row.randomProactiveEnabled,
				scheduledProactiveEnabled: row.scheduledProactiveEnabled,
				randomProactiveLastError: row.randomProactiveLastError,
				scheduledProactiveLastError: row.scheduledProactiveLastError,
				sessionModerationBanned: row.moderationBanned,
				characterModerationBanned: characterRow.moderationBanned,
				sessionModerationBannedReason: row.moderationBannedReason ?? null,
			};
		});
	}
}
