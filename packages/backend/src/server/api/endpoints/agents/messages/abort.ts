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

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 240 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			aborted: { type: 'boolean' },
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
 * 终止正在进行中的智能体请求。
 * 只允许会话的所有者发起；调用后由 send 端点在 catch 分支中
 * 标记为 aborted、删除已入库的用户消息并返回 409 错误。
 */
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'fdb17c96-1d40-43e0-8bb3-a69a57db4a71' });
			}
			const aborted = this.agentService.abortPending(session.id, ps.clientRequestId);
			return { aborted };
		});
	}
}
