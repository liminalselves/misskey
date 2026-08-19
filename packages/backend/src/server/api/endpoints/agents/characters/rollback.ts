/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCharactersRepository, AgentPublishedVersionsRepository } from '@/models/_.js';
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
		characterId: { type: 'string', format: 'misskey:id' },
		// 可选：回滚到指定历史已上线版本号；不传则回滚到最新发布快照。
		version: { type: 'integer', nullable: true },
	},
	required: ['characterId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.agentPublishedVersionsRepository)
		private agentPublishedVersionsRepository: AgentPublishedVersionsRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentCharactersRepository.findOneBy({ id: ps.characterId });
			if (!row || row.userId !== me.id) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: '22a1c6b0-7f7a-4f46-8f28-4e1f49d78c11' });
			}
			// 审核中的草稿必须冻结：回滚同样会替换待审内容
			if (row.reviewStatus === 'pending') {
				throw new ApiError({
					message: 'This character is pending review and cannot be edited. Withdraw the submission first.',
					code: 'AGENT_REVIEW_PENDING_LOCKED',
					id: 'e4f5a6b7-c8d9-4789-bcde-f567890123d4',
				});
			}
			if (ps.version != null) {
				const archived = await this.agentPublishedVersionsRepository.findOneBy({ kind: 'character', targetId: row.id, version: ps.version });
				if (!archived) {
					throw new ApiError({ message: 'No such historical version.', code: 'AGENT_NO_SUCH_VERSION', id: '6b1d5c2e-7c8a-4b6f-9e2d-1a2b3c4d5e6f' });
				}
				if (!this.agentService.applyCharacterSnapshot(row, archived.snapshot)) {
					throw new ApiError({ message: 'Historical snapshot is invalid.', code: 'AGENT_PUBLISHED_UNAVAILABLE', id: '40c3e8d8-5b45-4b94-8d4d-71d4f5d0f3c1' });
				}
			} else {
				if (row.publishedSnapshot == null) {
					throw new ApiError({ message: 'No published snapshot to rollback to.', code: 'AGENT_NO_PUBLISHED_SNAPSHOT', id: '3a6f2a18-9fd4-4dc6-8e6f-3a9c96d63c89' });
				}
				if (!this.agentService.restoreCharacterFromPublishedSnapshot(row)) {
					throw new ApiError({ message: 'Published snapshot is invalid.', code: 'AGENT_PUBLISHED_UNAVAILABLE', id: '40c3e8d8-5b45-4b94-8d4d-71d4f5d0f3c1' });
				}
			}
			row.updatedAt = new Date();
			await this.agentCharactersRepository.save(row);
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
