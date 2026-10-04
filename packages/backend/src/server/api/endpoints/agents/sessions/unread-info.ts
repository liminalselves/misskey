/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { AgentSessionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentMessageNotifyService } from '@/core/AgentMessageNotifyService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['agents'],

	requireCredential: true,

	kind: 'read:chat',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			// 未读条数。有未读但条数未知（存量数据无计数）时为 null
			count: { type: 'number', optional: false, nullable: true },
			// 首条未读消息 id（同上，存量数据无此记录时为 null）
			firstUnreadId: { type: 'string', optional: false, nullable: true },
		},
	},

	errors: {
		noSuchSession: {
			message: 'No such session.',
			code: 'NO_SUCH_SESSION',
			id: 'b7c2e5a1-3d4f-4e8a-8c1d-5e6f7a8b9c02',
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
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		private agentMessageNotifyService: AgentMessageNotifyService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError(meta.errors.noSuchSession);
			}

			return await this.agentMessageNotifyService.getUnreadInfo(me.id, ps.sessionId);
		});
	}
}
