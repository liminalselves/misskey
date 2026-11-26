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

	kind: 'write:chat',

	errors: {
		noSuchSession: {
			message: 'No such session.',
			code: 'NO_SUCH_SESSION',
			id: 'a2a1a62b-3f2e-4f6c-9b4b-0f2a4e2c1a01',
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

			await this.agentMessageNotifyService.readAgentMessages(me.id, ps.sessionId);
		});
	}
}
