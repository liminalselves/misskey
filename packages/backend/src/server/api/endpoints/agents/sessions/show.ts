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

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		private agentService: AgentService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!row || row.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'a5b6c7d8-e9f0-1234-8901-345678901234' });
			}
			if (row.agentReplyPending) {
				const latest = await this.agentMessagesRepository.findOne({
					where: { sessionId: row.id },
					order: { createdAt: 'DESC', id: 'DESC' },
				});
				if (latest?.role === 'assistant') {
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
				agentImageSettings: row.agentImageSettings ?? {},
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
			};
		});
	}
}
