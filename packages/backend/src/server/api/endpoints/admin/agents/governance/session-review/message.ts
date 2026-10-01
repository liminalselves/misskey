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
import { AgentProactiveScheduleService } from '@/core/AgentProactiveScheduleService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { loadSessionForReview } from './_utils.js';

// 镜像 agents/messages/show：审查页 messageId 深链定位单条消息
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
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		messageId: { type: 'string', format: 'misskey:id' },
	},
	required: ['sessionId', 'messageId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		private agentService: AgentService,
		private agentProactiveScheduleService: AgentProactiveScheduleService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();
			await loadSessionForReview(this.agentSessionsRepository, ps.sessionId);
			const row = await this.agentMessagesRepository.findOneBy({
				id: ps.messageId,
				sessionId: ps.sessionId,
			});
			if (!row) {
				throw new ApiError({ message: 'No such message.', code: 'NO_SUCH_MESSAGE', id: '41cf2a02-14b7-45f1-b63f-42cecb3b1e4a' });
			}
			return {
				id: row.id,
				role: row.role,
				content: row.role === 'assistant' && row.proactiveScheduleControlRaw
					? this.agentProactiveScheduleService.privateControlForLlm(row)
					: row.rawContent ?? row.content,
				createdAt: row.createdAt.toISOString(),
				file: row.imageFileId ? await this.driveFileEntityService.pack(row.imageFileId, {}).catch(() => null) : null,
				proactiveScheduleActionTypes: this.agentProactiveScheduleService.actionTypes(row),
				proactiveScheduleControlFailed: row.proactiveScheduleControlError != null,
			};
		});
	}
}
