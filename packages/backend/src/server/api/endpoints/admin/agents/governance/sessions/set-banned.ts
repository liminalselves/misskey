/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentSessionsRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { getAcctByUserId } from '../_utils.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'write:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: { type: 'object', optional: false, nullable: false, additionalProperties: true },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		banned: { type: 'boolean' },
		reason: { type: 'string', maxLength: 1000, nullable: true },
	},
	required: ['sessionId', 'banned'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private agentService: AgentService,
		private moderationLogService: ModerationLogService,
		private notificationService: NotificationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!row) throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'e0a5f341-171e-4ce8-8305-7af29e167477' });
			const before = row.moderationBanned;
			row.moderationBanned = ps.banned;
			row.updatedAt = new Date();
			await this.agentSessionsRepository.save(row);
			const userAcct = await getAcctByUserId(this.usersRepository, row.userId);
			await this.moderationLogService.log(me, 'setAgentSessionModerationBan', {
				sessionId: row.id,
				sessionName: row.name,
				userId: row.userId,
				userAcct,
				characterId: row.characterId,
				banned: ps.banned,
				before,
				reason: ps.reason?.trim() || null,
			});
			this.notificationService.createNotification(
				row.userId,
				'agentSessionBanned',
				{ sessionId: row.id, sessionName: row.name, banned: ps.banned },
			);
			return { ok: true, moderationBanned: row.moderationBanned };
		});
	}
}
