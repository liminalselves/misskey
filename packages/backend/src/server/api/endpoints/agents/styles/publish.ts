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
				throw new ApiError({ message: 'No such style.', code: 'NO_SUCH_STYLE', id: 'e7f8a9b0-c1d2-3456-0123-567890123456' });
			}
			if (row.reviewStatus === 'pending') {
				throw new ApiError({
					message: 'This style is already pending review.',
					code: 'AGENT_REVIEW_PENDING',
					id: 'a5b6c7d8-e9f0-1234-abcd-ef5678901234',
				});
			}
			if (row.publishedVersion != null && this.agentService.isStyleContentUnchangedFromPublished(row)) {
				throw new ApiError({
					message: 'Style content is unchanged from the published version; nothing to submit for update.',
					code: 'AGENT_PUBLISH_NO_CONTENT_CHANGE',
					id: 'b8c9d0e1-f2a3-4567-89ab-cdef01234567',
				});
			}
			row.reviewStatus = 'pending';
			row.draftRevision = (row.draftRevision ?? 1) + 1;
			// 审核中不覆盖已批准的 publishedSnapshot：审核期间广场与社区会话继续使用上一已上线快照，
			// 待审内容由管理端 review/resolve 在通过时重建快照。首次发布尚未上线，草稿不会外泄。
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
