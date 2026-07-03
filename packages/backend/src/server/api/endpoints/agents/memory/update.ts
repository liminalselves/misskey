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
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		memoryNodeId: { type: 'string', minLength: 8, maxLength: 128 },
		content: { type: 'string', minLength: 1, maxLength: 8000 },
	},
	required: ['sessionId', 'memoryNodeId', 'content'],
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
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'dd3c5499-dc29-4c13-8598-473c43d4c0da' });
			}
			const characterRow = await this.agentService.loadCharacterForAgentSessionOrThrow(session);
			this.agentService.assertAgentUserSessionChatAllowed(characterRow, session);
			const instanceMeta = await this.metaService.fetch(true);
			if (!this.agentDashscopeMemoryService.isRunnable(instanceMeta)) {
				throw new ApiError({ message: 'Long-term memory is not available.', code: 'MEMORY_NOT_AVAILABLE', id: '5b6560a8-b32c-4bc6-a56d-0ea64b8159ae' });
			}
			const bailianUserId = this.agentDashscopeMemoryService.bailianUserId(me.id, session.id);
			const ok = await this.agentDashscopeMemoryService.updateMemoryNode({
				meta: instanceMeta,
				bailianUserId,
				memoryNodeId: ps.memoryNodeId,
				customContent: ps.content,
			});
			if (!ok) {
				throw new ApiError({ message: 'Could not update memory.', code: 'MEMORY_PROVIDER_ERROR', id: 'a85efced-cf41-4a23-bc54-56f2304b32c6' });
			}
			return {};
		});
	}
}
