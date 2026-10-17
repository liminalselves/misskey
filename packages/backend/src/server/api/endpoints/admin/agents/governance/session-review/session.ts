/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentSessionsRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { MetaService } from '@/core/MetaService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { MiAgentCharacter } from '@/models/AgentCharacter.js';
import { loadSessionForReview } from './_utils.js';

// 镜像 agents/sessions/show 的返回结构，供审查页以用户侧聊天 UI 渲染；
// 差异仅两点：不做属主校验、不执行 pending 自愈写库（只读承诺），另附属主 UserLite。
export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 180 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		additionalProperties: true,
		properties: {
			user: { type: 'object', ref: 'UserLite', nullable: true },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { sessionId: { type: 'string', format: 'misskey:id' } },
	required: ['sessionId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private agentService: AgentService,
		private driveFileEntityService: DriveFileEntityService,
		private userEntityService: UserEntityService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const instance = await this.metaService.fetch(true);
			const row = await loadSessionForReview(this.agentSessionsRepository, ps.sessionId);
			const owner = await this.usersRepository.findOneBy({ id: row.userId });
			const packedOwner = owner ? await this.userEntityService.pack(owner, me, { schema: 'UserLite' }) : null;
			const characterRow = await this.agentService.loadCharacterForAgentSessionOrThrow(row);
			const characterDisplay = row.sessionKind === 'community' && this.agentService.isListedOnPlazaCharacter(characterRow as MiAgentCharacter)
				? this.agentService.characterPlazaDisplayFields(characterRow as MiAgentCharacter)
				: { name: characterRow.name, avatarFileId: characterRow.avatarFileId };
			const characterAvatar = characterDisplay.avatarFileId
				? await this.driveFileEntityService.pack(characterDisplay.avatarFileId, {})
					.catch(() => null)
				: null;
			// 角色专属表情包：与用户侧同源（社区会话走发布快照，快照损坏退回草稿兜底）
			let effectiveCharacter = characterRow as MiAgentCharacter;
			if (row.sessionKind === 'community') {
				try {
					effectiveCharacter = this.agentService.effectiveCharacterForLlm(characterRow as MiAgentCharacter, true);
				} catch {
					// fall through：使用草稿 stickers 兜底
				}
			}
			const characterStickers = await Promise.all(effectiveCharacter.stickers.map(async sticker => ({
				key: sticker.key,
				file: await this.driveFileEntityService.pack(sticker.fileId, {}).catch(() => null),
			})));
			return {
				user: packedOwner,
				id: row.id,
				name: row.name,
				characterId: row.characterId,
				dialogueStyleId: row.dialogueStyleId,
				sessionKind: row.sessionKind,
				characterName: characterDisplay.name,
				characterAvatar,
				characterStickers: characterStickers.filter(s => s.file != null),
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
				randomProactiveMinSilenceMinutes: row.randomProactiveMinSilenceMinutes,
				randomProactiveMaxWindowMinutes: row.randomProactiveMaxWindowMinutes,
				randomProactiveDaytimeWeight: row.randomProactiveDaytimeWeight,
				randomProactiveRecencyBias: row.randomProactiveRecencyBias,
				randomProactiveChainLength: row.randomProactiveChainLength,
				randomProactiveLastError: row.randomProactiveLastError,
				scheduledProactiveLastError: row.scheduledProactiveLastError,
				sessionModerationBanned: row.moderationBanned,
				characterModerationBanned: characterRow.moderationBanned,
				sessionModerationBannedReason: row.moderationBannedReason ?? null,
				ruleOverrides: row.ruleOverrides ?? {},
			};
		});
	}
}
