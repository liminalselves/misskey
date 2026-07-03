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
import { AgentDashscopeMemoryService } from '@/core/AgentDashscopeMemoryService.js';
import { MetaService } from '@/core/MetaService.js';
import { ChatService } from '@/core/ChatService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 60 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			memoryNodes: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						memoryNodeId: { type: 'string' },
						content: { type: 'string' },
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		content: { type: 'string', minLength: 1, maxLength: 8000 },
	},
	required: ['sessionId', 'content'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		private agentService: AgentService,
		private agentDashscopeMemoryService: AgentDashscopeMemoryService,
		private metaService: MetaService,
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			await this.chatService.checkChatAvailability(me.id, 'write');
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: '0783b289-d53c-45d7-bf9f-1185212bcac5' });
			}
			const characterRow = await this.agentService.loadCharacterForAgentSessionOrThrow(session);
			this.agentService.assertAgentUserSessionChatAllowed(characterRow, session);
			const instanceMeta = await this.metaService.fetch(true);
			if (!this.agentDashscopeMemoryService.isRunnable(instanceMeta)) {
				throw new ApiError({ message: 'Long-term memory is not available.', code: 'MEMORY_NOT_AVAILABLE', id: '83936b89-c903-496b-9f4d-a2973cdec387' });
			}
			const bailianUserId = this.agentDashscopeMemoryService.bailianUserId(me.id, session.id);
			const result = await this.agentDashscopeMemoryService.addCustomMemory({
				meta: instanceMeta,
				bailianUserId,
				customContent: ps.content,
			});
			if (result == null) {
				throw new ApiError({ message: 'Could not add memory.', code: 'MEMORY_PROVIDER_ERROR', id: '9c1d5dee-6d5b-4aa9-b2b0-d7b4ced12fee' });
			}
			return { memoryNodes: result.memoryNodes };
		});
	}
}
