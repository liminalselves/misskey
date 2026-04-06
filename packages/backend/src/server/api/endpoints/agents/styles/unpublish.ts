/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentDialogueStylesRepository } from '@/models/_.js';
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
	properties: { styleId: { type: 'string', format: 'misskey:id' } },
	required: ['styleId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentDialogueStylesRepository.findOneBy({ id: ps.styleId });
			if (!row || row.userId !== me.id) {
				throw new ApiError({ message: 'No such style.', code: 'NO_SUCH_STYLE', id: 'f8a9b0c1-d2e3-4567-1234-678901234567' });
			}
			if (row.reviewStatus === 'pending' && row.publishedVersion == null) {
				row.reviewStatus = 'draft';
				row.updatedAt = new Date();
				this.agentService.syncStyleListedFlag(row);
				await this.agentDialogueStylesRepository.save(row);
				return {
					id: row.id,
					isPublished: row.isPublished,
					reviewStatus: row.reviewStatus,
					publishedVersion: row.publishedVersion,
					updatedAt: row.updatedAt.toISOString(),
				};
			}
			if (row.reviewStatus === 'pending' && row.publishedVersion != null) {
				row.reviewStatus = 'published';
				row.updatedAt = new Date();
				this.agentService.syncStyleListedFlag(row);
				await this.agentDialogueStylesRepository.save(row);
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
			this.agentService.syncStyleListedFlag(row);
			await this.agentDialogueStylesRepository.save(row);
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
