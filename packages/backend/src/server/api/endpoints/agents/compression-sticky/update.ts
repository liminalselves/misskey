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
import { AgentCompressionMemoryService } from '@/core/AgentCompressionMemoryService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: { type: 'string' },
			summaryText: { type: 'string' },
			userOverridden: { type: 'boolean' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		stickyId: { type: 'string', format: 'misskey:id' },
		summaryText: { type: 'string', minLength: 1, maxLength: 50000 },
	},
	required: ['sessionId', 'stickyId', 'summaryText'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,
		private agentService: AgentService,
		private agentCompressionMemoryService: AgentCompressionMemoryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const s = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!s || s.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'c3c3c3c3-d4d4-d4d4-d4d4-333333333333' });
			}
			const row = await this.agentCompressionMemoryService.updateStickyText(
				ps.stickyId,
				ps.sessionId,
				ps.summaryText,
				me.id,
				s.userId,
			);
			return {
				id: row.id,
				summaryText: row.summaryText,
				userOverridden: row.userOverridden,
			};
		});
	}
}
