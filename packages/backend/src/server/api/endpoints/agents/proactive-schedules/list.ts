/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentSessionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentProactiveScheduleService } from '@/core/AgentProactiveScheduleService.js';

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
				description: { type: 'string' },
				trigger: { type: 'object' },
				status: { type: 'string' },
				createdAt: { type: 'string', format: 'date-time' },
				nextRunAt: { type: 'string', format: 'date-time', nullable: true },
				lastRunAt: { type: 'string', format: 'date-time', nullable: true },
				remainingRuns: { type: 'integer', nullable: true },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { sessionId: { type: 'string', format: 'misskey:id' } },
	required: ['sessionId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		private agentService: AgentService,
		private agentProactiveScheduleService: AgentProactiveScheduleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: '92230cd5-2771-4c78-8a41-7a8dc3f483c6' });
			}
			const schedules = await this.agentProactiveScheduleService.listForUser(session.id);
			return schedules.map(schedule => ({
				id: schedule.id,
				description: schedule.description,
				trigger: schedule.trigger,
				status: schedule.status,
				createdAt: schedule.createdAt.toISOString(),
				nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
				lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
				remainingRuns: schedule.remainingRuns,
			}));
		});
	}
}
