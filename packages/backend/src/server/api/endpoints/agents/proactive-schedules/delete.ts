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

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 180 },
	res: { type: 'object', optional: false, nullable: false, properties: { ok: { type: 'boolean' } } },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		scheduleId: { type: 'string', format: 'misskey:id' },
	},
	required: ['sessionId', 'scheduleId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentProactiveSchedulesRepository)
		private schedulesRepository: AgentProactiveSchedulesRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'f81b385c-2cce-4e6e-9ca7-c21407ec2be5' });
			const result = await this.schedulesRepository.delete({ id: ps.scheduleId, sessionId: session.id });
			if ((result.affected ?? 0) !== 1) throw new ApiError({ message: 'No such schedule.', code: 'NO_SUCH_SCHEDULE', id: 'c7737daa-9b15-4b39-bf1c-4a271a4b8cd4' });
			return { ok: true };
		});
	}
}
