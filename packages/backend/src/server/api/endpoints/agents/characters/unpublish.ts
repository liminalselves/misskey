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

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 60 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: { type: 'string', format: 'misskey:id' },
			isPublished: { type: 'boolean' },
			reviewStatus: { type: 'string' },
			publishedVersion: { type: 'integer', nullable: true },
			updatedAt: { type: 'string', format: 'date-time' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { characterId: { type: 'string', format: 'misskey:id' } },
	required: ['characterId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentCharactersRepository.findOneBy({ id: ps.characterId });
			if (!row || row.userId !== me.id) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: '514ceb53-9f25-486d-bc96-c4a1b67a997b' });
			}
			if (row.reviewStatus === 'pending') {
				row.reviewStatus = row.publishedVersion == null ? 'draft' : 'published';
				row.updatedAt = new Date();
				this.agentService.syncCharacterListedFlag(row);
				await this.agentCharactersRepository.save(row);
				return {
					id: row.id,
					isPublished: row.isPublished,
					reviewStatus: row.reviewStatus,
					publishedVersion: row.publishedVersion,
					updatedAt: row.updatedAt.toISOString(),
				};
			}
			row.reviewStatus = 'draft';
			row.publishedVersion = null;
			row.publishedSnapshot = null;
			row.updatedAt = new Date();
			this.agentService.syncCharacterListedFlag(row);
			await this.agentCharactersRepository.save(row);
			return {
				id: row.id,
				isPublished: row.isPublished,
				reviewStatus: row.reviewStatus,
				publishedVersion: row.publishedVersion,
				updatedAt: row.updatedAt.toISOString(),
			};
		});
	}
}
