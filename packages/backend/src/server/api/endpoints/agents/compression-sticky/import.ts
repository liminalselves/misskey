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
import { agentCompressionStickyStates } from '@/models/AgentSessionCompressionSticky.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 30 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			importedCount: { type: 'integer' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		stickies: {
			type: 'array',
			maxItems: 500,
			items: {
				type: 'object',
				properties: {
					summaryText: { type: 'string', minLength: 1, maxLength: 50000 },
					state: { type: 'string', enum: agentCompressionStickyStates },
					userOverridden: { type: 'boolean' },
					sortIndex: { type: 'number' },
				},
				required: ['summaryText', 'state', 'userOverridden', 'sortIndex'],
			},
		},
	},
	required: ['sessionId', 'stickies'],
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
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'e4f5a6b7-c8d9-4e0f-a1b2-c3d4e5f6a7b8' });
			}

			const importedCount = await this.agentCompressionMemoryService.importStickies(
				session.id,
				ps.stickies,
				me.id,
				session.userId,
			);
			return { importedCount };
		});
	}
}
