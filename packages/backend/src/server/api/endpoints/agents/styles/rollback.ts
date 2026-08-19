/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentDialogueStylesRepository, AgentPublishedVersionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 30 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: { type: 'string', format: 'misskey:id' },
			isPublished: { type: 'boolean' },
			reviewStatus: { type: 'string' },
			publishedVersion: { type: 'integer', nullable: true },
			draftRevision: { type: 'integer' },
			updatedAt: { type: 'string', format: 'date-time' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		styleId: { type: 'string', format: 'misskey:id' },
		// 可选：回滚到指定历史已上线版本号；不传则回滚到最新发布快照。
		version: { type: 'integer', nullable: true },
	},
	required: ['styleId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		@Inject(DI.agentPublishedVersionsRepository)
		private agentPublishedVersionsRepository: AgentPublishedVersionsRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentDialogueStylesRepository.findOneBy({ id: ps.styleId });
			if (!row || row.userId !== me.id) {
				throw new ApiError({ message: 'No such style.', code: 'NO_SUCH_STYLE', id: 'fe2d8fb4-e9a5-4d7a-a89f-3cb2cc53cd1b' });
			}
			// 审核中的草稿必须冻结：回滚同样会替换待审内容
			if (row.reviewStatus === 'pending') {
				throw new ApiError({
					message: 'This style is pending review and cannot be edited. Withdraw the submission first.',
					code: 'AGENT_REVIEW_PENDING_LOCKED',
					id: 'd3e4f5a6-b7c8-4789-bcde-f456789012c3',
				});
			}
			if (ps.version != null) {
				const archived = await this.agentPublishedVersionsRepository.findOneBy({ kind: 'style', targetId: row.id, version: ps.version });
				if (!archived) {
					throw new ApiError({ message: 'No such historical version.', code: 'AGENT_NO_SUCH_VERSION', id: '8a7b6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d' });
				}
				if (!this.agentService.applyStyleSnapshot(row, archived.snapshot)) {
					throw new ApiError({ message: 'Historical snapshot is invalid.', code: 'AGENT_PUBLISHED_UNAVAILABLE', id: 'd2c5aa0d-5636-43b2-b5bb-bd5d44fca4fb' });
				}
			} else {
				if (row.publishedSnapshot == null) {
					throw new ApiError({ message: 'No published snapshot to rollback to.', code: 'AGENT_NO_PUBLISHED_SNAPSHOT', id: '7e3e9b8c-99e5-4a82-84fe-3d3e3fe3b8db' });
				}
				if (!this.agentService.restoreStyleFromPublishedSnapshot(row)) {
					throw new ApiError({ message: 'Published snapshot is invalid.', code: 'AGENT_PUBLISHED_UNAVAILABLE', id: 'd2c5aa0d-5636-43b2-b5bb-bd5d44fca4fb' });
				}
			}
			row.updatedAt = new Date();
			await this.agentDialogueStylesRepository.save(row);
			return {
				id: row.id,
				isPublished: row.isPublished,
				reviewStatus: row.reviewStatus,
				publishedVersion: row.publishedVersion,
				draftRevision: row.draftRevision,
				updatedAt: row.updatedAt.toISOString(),
			};
		});
	}
}
