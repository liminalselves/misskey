/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { AgentCharactersRepository, AgentDialogueStylesRepository, AgentExternalAuditLogsRepository, AgentImageGenerationsRepository, AgentSessionsRepository, ModerationLogsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { agentGovernanceLogTypes } from './_utils.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		additionalProperties: true,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentExternalAuditLogsRepository)
		private agentExternalAuditLogsRepository: AgentExternalAuditLogsRepository,

		@Inject(DI.agentImageGenerationsRepository)
		private agentImageGenerationsRepository: AgentImageGenerationsRepository,

		@Inject(DI.moderationLogsRepository)
		private moderationLogsRepository: ModerationLogsRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async () => {
			this.agentService.assertAgentsEnabled();
			const [
				pendingCharacters,
				pendingStyles,
				bannedCharacters,
				bannedSessions,
				blockedExternalAudits,
				blockedImages,
				recentOperations,
			] = await Promise.all([
				this.agentCharactersRepository.countBy({ reviewStatus: 'pending' }),
				this.agentDialogueStylesRepository.countBy({ reviewStatus: 'pending' }),
				this.agentCharactersRepository.countBy({ moderationBanned: true }),
				this.agentSessionsRepository.countBy({ moderationBanned: true }),
				this.agentExternalAuditLogsRepository.countBy({ status: 'block' }),
				this.agentImageGenerationsRepository.countBy({ isBlocked: true }),
				this.moderationLogsRepository.countBy({ type: In([...agentGovernanceLogTypes]) }),
			]);

			return {
				pendingCharacters,
				pendingStyles,
				pendingTotal: pendingCharacters + pendingStyles,
				bannedCharacters,
				bannedSessions,
				blockedExternalAudits,
				blockedImages,
				recentOperations,
			};
		});
	}
}
