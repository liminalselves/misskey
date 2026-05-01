/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { MoreThanOrEqual } from 'typeorm';
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
	limit: { duration: ms('1hour'), max: 180 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			deletedCount: { type: 'number' },
			content: { type: 'string' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		messageId: { type: 'string', format: 'misskey:id' },
	},
	required: ['sessionId', 'messageId'],
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
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'a5b6c7d8-e9f0-1234-5678-9abcdef01234' });
			}
			const characterRow = await this.agentService.loadCharacterForAgentSessionOrThrow(session);
			this.agentService.assertAgentUserSessionChatAllowed(characterRow, session);

			if (session.agentReplyPending) {
				throw new ApiError({
					message: 'A reply is still being generated for this session.',
					code: 'AGENT_REPLY_PENDING',
					id: 'd8e9f0a1-b2c3-4567-89ab-cdef01234567',
					kind: 'client',
					httpStatusCode: 409,
				});
			}

			const anchor = await this.agentMessagesRepository.findOneBy({
				id: ps.messageId,
				sessionId: ps.sessionId,
			});
			if (!anchor) {
				throw new ApiError({ message: 'No such message.', code: 'NO_SUCH_MESSAGE', id: 'b6c7d8e9-f0a1-2345-6789-abcdef012345' });
			}
			if (anchor.role !== 'user') {
				throw new ApiError({
					message: 'Only user messages can be rolled back to.',
					code: 'AGENT_ROLLBACK_ONLY_USER',
					id: 'c7d8e9f0-a1b2-3456-789a-bcdef0123456',
					kind: 'client',
					httpStatusCode: 400,
				});
			}

			const victims = await this.agentMessagesRepository.find({
				where: {
					sessionId: ps.sessionId,
					createdAt: MoreThanOrEqual(anchor.createdAt),
				},
				select: ['id', 'createdAt'],
			});
			const ids = victims
				.filter(v => v.createdAt.getTime() > anchor.createdAt.getTime() || v.id === anchor.id)
				.map(v => v.id);

			if (ids.length > 0) {
				await this.agentMessagesRepository.delete(ids);
			}

			return {
				deletedCount: ids.length,
				content: anchor.content,
			};
		});
	}
}
