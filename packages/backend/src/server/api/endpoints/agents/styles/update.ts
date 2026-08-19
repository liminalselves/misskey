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
import { AgentService, AGENT_TEXT_FIELD_MAX } from '@/core/AgentService.js';

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
			name: { type: 'string' },
			isPublished: { type: 'boolean' },
			updatedAt: { type: 'string', format: 'date-time' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
		properties: {
			styleId: { type: 'string', format: 'misskey:id' },
			name: { type: 'string', minLength: 1, maxLength: 256, nullable: true },
			summary: { type: 'string', nullable: true, maxLength: 512 },
			body: { type: 'string', maxLength: AGENT_TEXT_FIELD_MAX, nullable: true },
			promptOpenSourced: { type: 'boolean' },
		},
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
				throw new ApiError({ message: 'No such style.', code: 'NO_SUCH_STYLE', id: 'a3b4c5d6-e7f8-9012-6789-123456789012' });
			}
			// 审核中的草稿必须冻结：否则作者可在审核员通过前替换内容，导致发布内容与审核所见不一致
			if (row.reviewStatus === 'pending') {
				throw new ApiError({
					message: 'This style is pending review and cannot be edited. Withdraw the submission first.',
					code: 'AGENT_REVIEW_PENDING_LOCKED',
					id: 'c2d3e4f5-a6b7-4789-bcde-f345678901b2',
				});
			}
			if (ps.name != null) row.name = ps.name;
			if (ps.summary !== undefined) row.summary = ps.summary;
			if (ps.body != null) row.body = ps.body;
			if (ps.promptOpenSourced !== undefined) row.promptOpenSourced = ps.promptOpenSourced === true;
			row.draftRevision = (row.draftRevision ?? 1) + 1;
			row.updatedAt = new Date();
			await this.agentDialogueStylesRepository.save(row);
			return {
				id: row.id,
				name: row.name,
				isPublished: row.isPublished,
				updatedAt: row.updatedAt.toISOString(),
			};
		});
	}
}
