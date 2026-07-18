/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentProactiveSchedulesRepository, AgentSessionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentProactiveScheduleService } from '@/core/AgentProactiveScheduleService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 180 },
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			ok: { type: 'boolean' },
			status: { type: 'string', enum: ['active', 'paused', 'completed'] },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		scheduleId: { type: 'string', format: 'misskey:id' },
		status: { type: 'string', enum: ['active', 'paused'] },
	},
	required: ['sessionId', 'scheduleId', 'status'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentProactiveSchedulesRepository)
		private schedulesRepository: AgentProactiveSchedulesRepository,

		private agentService: AgentService,
		private agentProactiveScheduleService: AgentProactiveScheduleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'cb7d298e-aa07-40c9-808d-00e39d294c13' });
			if (ps.status === 'active' && (!session.timeAwarenessEnabled || !session.scheduledProactiveEnabled)) {
				throw new ApiError({ message: 'Scheduled proactive messages are disabled.', code: 'SCHEDULE_MODE_DISABLED', id: '88e3b4b8-0e34-4d0c-8d37-a4166fe362f4' });
			}
			const schedule = await this.schedulesRepository.findOneBy({ id: ps.scheduleId, sessionId: session.id });
			if (!schedule) throw new ApiError({ message: 'No such schedule.', code: 'NO_SUCH_SCHEDULE', id: 'e03cf7a7-7842-4fb2-a8aa-7c781cf50e6b' });
			const updated = await this.agentProactiveScheduleService.setStatus(schedule, ps.status);
			return { ok: true, status: updated.status === 'completed' ? 'completed' : ps.status };
		});
	}
}
