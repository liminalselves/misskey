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
import { MetaService } from '@/core/MetaService.js';
import { AgentExternalAuditService } from '@/core/AgentExternalAuditService.js';
import { AgentProactiveScheduleService } from '@/core/AgentProactiveScheduleService.js';

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
			auditBlocked: { type: 'boolean' },
			auditBlockCode: { type: 'string', nullable: true },
			auditCategory: { type: 'string', nullable: true },
			auditReason: { type: 'string', nullable: true },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		messageId: { type: 'string', format: 'misskey:id' },
		content: { type: 'string', minLength: 0, maxLength: 16000 },
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
		private metaService: MetaService,
		private agentExternalAuditService: AgentExternalAuditService,
		private agentProactiveScheduleService: AgentProactiveScheduleService,
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
			if (ps.content.trim() === '' && !(row.role === 'user' && row.imageFileId != null)) {
				throw new ApiError({
					message: 'Text is required unless the user message has an attached image.',
					code: 'AGENT_MESSAGE_EMPTY',
					id: '1a0b0ecf-0d89-465a-8565-3f1e0d94f4e8',
					kind: 'client',
					httpStatusCode: 400,
				});
			}

			const editedVisibleContent = row.role === 'assistant'
				? this.extractEditedAssistantVisibleContent(ps.content, row.proactiveScheduleControlRaw)
				: ps.content;
			if (row.role === 'assistant' && editedVisibleContent !== row.content) {
				const instance = await this.metaService.fetch(true);
				const audit = await this.agentExternalAuditService.auditReply({
					instance,
					user: me,
					session,
					userText: '用户正在修改一条既有的智能体助手回复。请审核修改后的助手内容是否允许展示或执行。',
					assistantText: editedVisibleContent,
				}).catch(() => ({ blocked: false as const, allFailed: true }));
				if (audit.blocked === true) {
					return {
						id: row.id,
						role: row.role,
						content: row.content,
						createdAt: row.createdAt.toISOString(),
						auditBlocked: true,
						auditBlockCode: audit.blockCode,
						auditCategory: audit.category,
						auditReason: audit.reason,
					};
				}
			}

			row.content = editedVisibleContent;
			if (row.role === 'assistant' && row.proactiveScheduleControlRaw) {
				// The executed control journal is immutable; editing changes only the visible reply.
				row.rawContent = `${editedVisibleContent}\n${row.proactiveScheduleControlRaw}`;
			}
			await this.agentMessagesRepository.save(row);

			return {
				id: row.id,
				role: row.role,
				content: row.content,
				createdAt: row.createdAt.toISOString(),
				auditBlocked: false,
				auditBlockCode: null,
				auditCategory: null,
				auditReason: null,
			};
		});
	}

	private extractEditedAssistantVisibleContent(content: string, immutableControlRaw: string | null): string {
		if (immutableControlRaw) {
			const controlAt = content.lastIndexOf(immutableControlRaw);
			if (controlAt >= 0) return content.slice(0, controlAt).trimEnd();
			// The editor may contain the server-only rejection receipt. It is not user-visible
			// content and must never be persisted as part of the assistant reply.
			const withoutResult = content.replace(/\n?<proactive_schedule_result\b[\s\S]*?<\/proactive_schedule_result>\s*$/u, '').trimEnd();
			return this.agentProactiveScheduleService.extractControl(withoutResult).visibleContent;
		}
		return this.agentProactiveScheduleService.extractControl(content).visibleContent;
	}
}
