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

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:chat',
	limit: { duration: ms('1hour'), max: 720 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			state: { type: 'string', enum: ['pending', 'completed', 'none'] },
			userMessageId: { type: 'string', format: 'misskey:id', nullable: true },
			assistantMessageId: { type: 'string', format: 'misskey:id', nullable: true },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		clientRequestId: { type: 'string', minLength: 1, maxLength: 64 },
	},
	required: ['sessionId', 'clientRequestId'],
} as const;

/**
 * 查询一次 send 请求在服务端的结果，供客户端在连接中断（App 切后台、断网）后对账。
 * - completed：助手回复已落库（assistantMessageId 为 null 表示仅含控制指令的内部回复）
 * - pending：会话仍在生成
 * - none：没有产生回复（失败/被拦截/被中断时用户消息已回滚，或请求未到达服务端）
 */
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: '5b0e9c2a-7d41-4f3e-9a86-1c2d3e4f5a6b' });
			}
			const [userMessage, assistantMessage] = await Promise.all([
				this.agentMessagesRepository.findOne({ where: { sessionId: session.id, clientRequestId: ps.clientRequestId, role: 'user' }, select: { id: true } }),
				this.agentMessagesRepository.findOne({ where: { sessionId: session.id, clientRequestId: ps.clientRequestId, role: 'assistant' }, select: { id: true, isInternal: true } }),
			]);
			if (assistantMessage) {
				return {
					state: 'completed' as const,
					userMessageId: userMessage?.id ?? null,
					assistantMessageId: assistantMessage.isInternal ? null : assistantMessage.id,
				};
			}
			// 会话仍被占用：本请求可能还在生成（含尚未写入用户消息的预检阶段），继续等待
			if (session.agentReplyPending) {
				return { state: 'pending' as const, userMessageId: userMessage?.id ?? null, assistantMessageId: null };
			}
			return { state: 'none' as const, userMessageId: null, assistantMessageId: null };
		});
	}
}
