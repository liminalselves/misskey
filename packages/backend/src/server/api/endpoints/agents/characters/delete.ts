/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MiAgentCharacter } from '@/models/AgentCharacter.js';
import { MiAgentPublishedVersion } from '@/models/AgentPublishedVersion.js';
import { MiAgentPlazaReview } from '@/models/AgentPlazaReview.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { withLockedAgentCharacter } from '../_with-agent-lock.js';

export const meta = {
	tags: ['agents'], requireCredential: true, prohibitMoved: true, kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 30 },
	res: { type: 'object', optional: false, nullable: false, properties: { success: { type: 'boolean' } } },
} as const;
export const paramDef = { type: 'object', properties: { characterId: { type: 'string', format: 'misskey:id' } }, required: ['characterId'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db) private db: DataSource,
		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			return withLockedAgentCharacter(this.db, ps.characterId, async (row, manager) => {
				if (!row || row.userId !== me.id) throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: '9aab27e7-bcc2-4eb2-96cb-cd4fcbfbd292' });
				await manager.delete(MiAgentPublishedVersion, { kind: 'character', targetId: row.id });
				await manager.delete(MiAgentPlazaReview, { characterId: row.id });
				await manager.delete(MiAgentCharacter, { id: row.id });
				return { success: true };
			});
		});
	}
}
