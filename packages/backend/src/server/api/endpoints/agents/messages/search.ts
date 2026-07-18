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

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:chat',
	limit: { duration: ms('1hour'), max: 120 },
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
		query: { type: 'string', minLength: 1, maxLength: 512 },
		limit: { type: 'integer', minimum: 1, maximum: 50, default: 30 },
	},
	required: ['sessionId', 'query'],
} as const;

function escapeIlikePattern(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'a5b6c7d8-e9f0-1234-abcd-ef9012345678' });
			}
			const limit = ps.limit ?? 30;
			const pattern = `%${escapeIlikePattern(ps.query)}%`;
			const rows = await this.agentMessagesRepository.createQueryBuilder('m')
				.where('m.sessionId = :sessionId', { sessionId: ps.sessionId })
				.andWhere('m.isInternal = false')
				.andWhere('m.content ILIKE :pattern ESCAPE \'\\\'', { pattern })
				.orderBy('m.id', 'DESC')
				.take(limit)
				.getMany();

			return rows.map(m => ({
				id: m.id,
				role: m.role,
				content: m.content,
				createdAt: m.createdAt.toISOString(),
			}));
		});
	}
}
