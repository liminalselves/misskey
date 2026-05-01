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
	kind: 'read:chat',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: { type: 'string' },
				createdAt: { type: 'string', format: 'date-time' },
				updatedAt: { type: 'string', format: 'date-time' },
				fromMessageId: { type: 'string' },
				toMessageId: { type: 'string' },
				summaryText: { type: 'string' },
				state: { type: 'string' },
				userOverridden: { type: 'boolean' },
				sourceFingerprint: { type: 'string', nullable: true },
				errorMessage: { type: 'string', nullable: true },
				lastModelId: { type: 'string', nullable: true },
				sortIndex: { type: 'number' },
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
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'b2b2b2b2-c3c3-c3c3-c3c3-222222222222' });
			}
			const rows = await this.agentCompressionMemoryService.listStickies(ps.sessionId);
			return rows.map(r => ({
				id: r.id,
				createdAt: r.createdAt.toISOString(),
				updatedAt: r.updatedAt.toISOString(),
				fromMessageId: r.fromMessageId,
				toMessageId: r.toMessageId,
				summaryText: r.summaryText,
				state: r.state,
				userOverridden: r.userOverridden,
				sourceFingerprint: r.sourceFingerprint,
				errorMessage: r.errorMessage,
				lastModelId: r.lastModelId,
				sortIndex: r.sortIndex,
			}));
		});
	}
}
