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
import { QueryService } from '@/core/QueryService.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentProactiveScheduleService } from '@/core/AgentProactiveScheduleService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:chat',
	limit: { duration: ms('1hour'), max: 180 },
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: { type: 'string', format: 'misskey:id' },
				role: { type: 'string', enum: ['user', 'assistant', 'system'] },
				content: { type: 'string' },
				createdAt: { type: 'string', format: 'date-time' },
				file: { type: 'object', ref: 'DriveFile', nullable: true },
				imageRecognitionStatus: { type: 'string', nullable: true },
				imageRecognitionDescription: { type: 'string', nullable: true },
				proactiveScheduleActionTypes: { type: 'array', items: { type: 'string', enum: ['create', 'update', 'cancel'] } },
				proactiveScheduleControlFailed: { type: 'boolean' },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		sinceId: { type: 'string', format: 'misskey:id', nullable: true },
		untilId: { type: 'string', format: 'misskey:id', nullable: true },
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

		private queryService: QueryService,
		private agentService: AgentService,
		private agentProactiveScheduleService: AgentProactiveScheduleService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'b6c7d8e9-f0a1-2345-9012-456789012345' });
			}

			const q = this.queryService.makePaginationQuery(
				this.agentMessagesRepository.createQueryBuilder('m')
					.where('m.sessionId = :sessionId', { sessionId: ps.sessionId })
					.andWhere('m.isInternal = false')
					.select(['m.id', 'm.role', 'm.content', 'm.createdAt', 'm.imageFileId', 'm.imageRecognitionStatus', 'm.imageRecognitionDescription', 'm.proactiveScheduleControlRaw', 'm.proactiveScheduleControlError']),
				ps.sinceId ?? null,
				ps.untilId ?? null,
			).take(ps.limit ?? 30);

			const rows = await q.getMany();
			return await Promise.all(rows.map(async m => ({
				id: m.id,
				role: m.role,
				content: m.content,
				createdAt: m.createdAt.toISOString(),
				file: m.imageFileId ? await this.driveFileEntityService.pack(m.imageFileId, {}).catch(() => null) : null,
				imageRecognitionStatus: m.imageRecognitionStatus,
				imageRecognitionDescription: m.imageRecognitionDescription,
				proactiveScheduleActionTypes: this.agentProactiveScheduleService.actionTypes(m),
				proactiveScheduleControlFailed: m.proactiveScheduleControlError != null,
			})));
		});
	}
}
