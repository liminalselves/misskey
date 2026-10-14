/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MiAgentSession } from '@/models/AgentSession.js';
import { AgentMessageNotifyService } from '@/core/AgentMessageNotifyService.js';
import { withWritableAgentSession } from '../_with-agent-lock.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
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
			ok: { type: 'boolean' },
			aliyunMemoryProviderError: { type: 'boolean' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
	},
	required: ['sessionId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
			@Inject(DI.db)
			private db: DataSource,
			private agentMessageNotifyService: AgentMessageNotifyService,

		private agentService: AgentService,
		private agentDashscopeMemoryService: AgentDashscopeMemoryService,
		private metaService: MetaService,
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			await this.chatService.checkChatAvailability(me.id, 'write');

				const session = await withWritableAgentSession(this.db, ps.sessionId, me.id, async (row, manager) => {
					await manager.delete(MiAgentSession, { id: row.id });
					return row;
				});
				await this.agentMessageNotifyService.readAgentMessages(me.id, session.id);

			const instanceMeta = await this.metaService.fetch(true);
			let aliyunMemoryProviderError = false;
			if (this.agentDashscopeMemoryService.isRunnable(instanceMeta)) {
				const bailianUserId = this.agentDashscopeMemoryService.bailianUserId(me.id, session.id);
				const memResult = await this.agentDashscopeMemoryService.deleteAllMemoryNodesForBailianUser({
					meta: instanceMeta,
					bailianUserId,
				});
				if (memResult.providerFailed) {
					aliyunMemoryProviderError = true;
				}
			}

			return {
				ok: true,
				aliyunMemoryProviderError,
			};
		});
	}
}
