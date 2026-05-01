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
	kind: 'read:chat',
	limit: { duration: ms('1hour'), max: 180 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: { type: 'string', format: 'misskey:id' },
			userId: { type: 'string', format: 'misskey:id' },
			name: { type: 'string' },
			summary: { type: 'string', nullable: true },
			body: { type: 'string' },
			isPublished: { type: 'boolean' },
			reviewStatus: { type: 'string', optional: true },
			publishedVersion: { type: 'integer', nullable: true, optional: true },
			promptOpenSourced: { type: 'boolean' },
			createdAt: { type: 'string', format: 'date-time' },
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
			if (!row) {
				throw new ApiError({ message: 'No such style.', code: 'NO_SUCH_STYLE', id: 'c5d6e7f8-a9b0-1234-8901-345678901234' });
			}
			const isOwner = row.userId === me.id;
			if (!isOwner && !this.agentService.isListedOnPlazaStyle(row)) {
				throw new ApiError({ message: 'No such style.', code: 'NO_SUCH_STYLE', id: 'd6e7f8a9-b0c1-2345-9012-456789012345' });
			}
			const display = isOwner ? row : this.agentService.effectiveStyleForLlm(row, true);
			const exposeBody = isOwner || row.promptOpenSourced === true;
			return {
				id: row.id,
				userId: row.userId,
				name: display.name,
				summary: display.summary,
				body: exposeBody ? display.body : '',
				isPublished: row.isPublished,
				...(isOwner ? { reviewStatus: row.reviewStatus, publishedVersion: row.publishedVersion } : {}),
				promptOpenSourced: row.promptOpenSourced === true,
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString(),
			};
		});
	}
}
