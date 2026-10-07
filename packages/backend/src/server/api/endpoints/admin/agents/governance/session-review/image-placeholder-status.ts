/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { AgentImageGenerationsRepository, AgentMessagesRepository, AgentSessionsRepository, DriveFilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { meta as userMeta, paramDef } from '@/server/api/endpoints/agents/images/placeholder-status.js';
import { packAgentImagePlaceholder } from '@/server/api/endpoints/agents/images/_pack-placeholder.js';
import { loadSessionForReview } from './_utils.js';

export { paramDef };

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	res: userMeta.res,
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		@Inject(DI.agentImageGenerationsRepository)
		private agentImageGenerationsRepository: AgentImageGenerationsRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private agentService: AgentService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();
			const session = await loadSessionForReview(this.agentSessionsRepository, ps.sessionId);
			const message = await this.agentMessagesRepository.findOneBy({ id: ps.messageId, sessionId: session.id });
			if (!message || message.role !== 'assistant') {
				throw new ApiError({ message: 'No such message.', code: 'NO_SUCH_AGENT_MESSAGE', id: 'fd9e72f6-3d41-46a8-866a-eed5e62f09c8' });
			}

			const existing = await this.agentImageGenerationsRepository.findOne({
				where: {
					messageId: message.id,
					placeholderIndex: ps.placeholderIndex,
				},
				order: { createdAt: 'DESC' },
			});
			if (!existing) return null;

			return await packAgentImagePlaceholder(existing, this.driveFilesRepository, this.driveFileEntityService);
		});
	}
}
