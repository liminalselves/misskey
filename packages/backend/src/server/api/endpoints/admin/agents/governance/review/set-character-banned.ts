/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCharactersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { NotificationService } from '@/core/NotificationService.js';

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
		characterId: { type: 'string', format: 'misskey:id' },
		banned: { type: 'boolean' },
		reason: { type: 'string', maxLength: 1000, nullable: true },
	},
	required: ['characterId', 'banned'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		private agentService: AgentService,
		private moderationLogService: ModerationLogService,
		private notificationService: NotificationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentCharactersRepository.findOneBy({ id: ps.characterId });
			if (!row) throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: '4f6bc584-7968-4935-b77c-c6a143ff4c87' });
			const before = row.moderationBanned;
			row.moderationBanned = ps.banned;
			row.updatedAt = new Date();
			await this.agentCharactersRepository.save(row);
			await this.moderationLogService.log(me, 'setAgentCharacterModerationBan', {
				characterId: row.id,
				characterName: row.name,
				ownerUserId: row.userId,
				banned: ps.banned,
				before,
				reason: ps.reason?.trim() || null,
			});
			this.notificationService.createNotification(
				row.userId,
				'agentCharacterBanned',
				{ characterId: row.id, characterName: row.name, banned: ps.banned },
			);
			return { ok: true, moderationBanned: row.moderationBanned };
		});
	}
}
