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
import { ChatService } from '@/core/ChatService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 360 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: { type: 'string', format: 'misskey:id' },
			role: { type: 'string' },
			content: { type: 'string' },
			createdAt: { type: 'string', format: 'date-time' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		messageId: { type: 'string', format: 'misskey:id' },
		content: { type: 'string', minLength: 1, maxLength: 16000 },
	},
	required: ['sessionId', 'messageId', 'content'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		private agentService: AgentService,
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			await this.chatService.checkChatAvailability(me.id, 'write');

			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'd2e3f4a5-b6c7-8901-d234-ef5678901234' });
			}
			const characterRow = await this.agentService.loadCharacterForAgentSessionOrThrow(session);
			this.agentService.assertAgentUserSessionChatAllowed(characterRow, session);

			const row = await this.agentMessagesRepository.findOneBy({
				id: ps.messageId,
				sessionId: ps.sessionId,
			});
			if (!row) {
				throw new ApiError({ message: 'No such message.', code: 'NO_SUCH_MESSAGE', id: 'e3f4a5b6-c7d8-9012-e345-f67890123456' });
			}

			if (row.role !== 'user' && row.role !== 'assistant') {
				throw new ApiError({
					message: 'Only user and assistant messages can be edited.',
					code: 'AGENT_MESSAGE_NOT_EDITABLE',
					id: 'f4a5b6c7-d8e9-0123-f456-789012345678',
					kind: 'client',
					httpStatusCode: 400,
				});
			}

			row.content = ps.content;
			await this.agentMessagesRepository.save(row);

			return {
				id: row.id,
				role: row.role,
				content: row.content,
				createdAt: row.createdAt.toISOString(),
			};
		});
	}
}
