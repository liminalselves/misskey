/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { DataSource } from 'typeorm';
import { MiAgentMessage } from '@/models/AgentMessage.js';
import { MiAgentSession } from '@/models/AgentSession.js';
import { AgentMessageNotifyService } from '@/core/AgentMessageNotifyService.js';
import { withWritableAgentSession } from '../_with-agent-lock.js';
import { invalidateMessageCompression } from './_invalidate-compression.js';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentSessionsRepository } from '@/models/_.js';
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
		properties: {},
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
			@Inject(DI.db) private db: DataSource,
			private agentMessageNotifyService: AgentMessageNotifyService,

		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		private agentService: AgentService,
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			await this.chatService.checkChatAvailability(me.id, 'write');

			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567891' });
			}
			const characterRow = await this.agentService.loadCharacterForAgentSessionOrThrow(session);
			this.agentService.assertAgentUserSessionChatAllowed(characterRow, session);

				await withWritableAgentSession(this.db, ps.sessionId, me.id, async (locked, manager) => {
				const row = await manager.findOneBy(MiAgentMessage, {
				id: ps.messageId,
				sessionId: ps.sessionId,
			});
			if (!row) {
				throw new ApiError({ message: 'No such message.', code: 'NO_SUCH_MESSAGE', id: 'bd8b45b6-52d7-4a64-8c64-b893d29a4623' });
			}

				await invalidateMessageCompression(manager, locked.id, row);
				await manager.delete(MiAgentMessage, {
				id: ps.messageId,
				sessionId: ps.sessionId,
			});

				const latest = await manager.findOne(MiAgentMessage, { where: { sessionId: locked.id }, order: { createdAt: 'DESC', id: 'DESC' } });
				await manager.update(MiAgentSession, { id: locked.id }, { updatedAt: new Date(), lastMessageAt: latest?.createdAt ?? null });
				});
				await this.agentMessageNotifyService.reconcileUnreadMessages(me.id, ps.sessionId);
				return {};
		});
	}
}
