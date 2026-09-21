/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { AgentCheckinService } from '@/core/AgentCheckinService.js';
import { AgentService } from '@/core/AgentService.js';
import { DI } from '@/di-symbols.js';
import type { UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { resolveUserIdFromAcctOrId } from './agents/governance/_utils.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	requireAdmin: true,
	secure: true,
	kind: 'write:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			userId: { type: 'string' },
			date: { type: 'string' },
		},
	},
	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '22c0a20a-e2d7-48bd-8f94-8ee3a8673fef',
		},
		checkinFailed: {
			message: 'Admin makeup check-in failed.',
			code: 'CHECKIN_FAILED',
			id: '8dfe1826-858c-4b2c-89b8-f5bc5ef04b08',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', minLength: 1, maxLength: 128 },
		date: { type: 'string', minLength: 10, maxLength: 10, pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
	},
	required: ['userId', 'date'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private agentCheckinService: AgentCheckinService,
		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps) => {
			this.agentService.assertAgentsEnabled();

			const targetUserId = await resolveUserIdFromAcctOrId(this.usersRepository, ps.userId);
			const targetUser = targetUserId
				? await this.usersRepository.findOne({ where: { id: targetUserId }, select: ['id'] })
				: null;
			if (!targetUser) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			const result = await this.agentCheckinService.performAdminMakeup(targetUser.id, ps.date);
			if (!result.ok) {
				throw new ApiError({ ...meta.errors.checkinFailed, message: result.reason });
			}

			return { userId: targetUser.id, date: ps.date };
		});
	}
}
