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
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { NotificationService } from '@/core/NotificationService.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'write:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			ok: { type: 'boolean' },
			moderationBanned: { type: 'boolean' },
		},
	},
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

		private agentService: AgentService,
		private moderationLogService: ModerationLogService,
		private notificationService: NotificationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!row) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'a3b4c5d6-e7f8-9012-abcd-ef0123456789' });
			}
			const before = row.moderationBanned;
			row.moderationBanned = ps.banned;
			// 封禁时持久化原因供用户侧展示；解封时清空
			row.moderationBannedReason = ps.banned ? (ps.reason?.trim() || null) : null;
			row.updatedAt = new Date();
			await this.agentSessionsRepository.save(row);
			await this.moderationLogService.log(me, 'setAgentSessionModerationBan', {
				sessionId: row.id,
				sessionName: row.name,
				userId: row.userId,
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
