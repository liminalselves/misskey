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

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireAdmin: true,
	kind: 'read:admin',
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
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
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
	) {
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'c7d8e9f0-a1b2-3456-0123-567890abcdef' });
			}

			const q = this.queryService.makePaginationQuery(
				this.agentMessagesRepository.createQueryBuilder('m')
					.where('m.sessionId = :sessionId', { sessionId: ps.sessionId })
					.select(['m.id', 'm.role', 'm.content', 'm.createdAt']),
				null,
				ps.untilId ?? null,
			).take(ps.limit ?? 50);

			const rows = await q.getMany();
			return rows.map(m => ({
				id: m.id,
				role: m.role,
				content: m.content,
				createdAt: m.createdAt.toISOString(),
			}));
		});
	}
}
