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
	kind: 'read:chat',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				version: { type: 'integer' },
				draftRevision: { type: 'integer' },
				reviewStatus: { type: 'string' },
				isPublished: { type: 'boolean' },
				createdAt: { type: 'string', format: 'date-time' },
				updatedAt: { type: 'string', format: 'date-time' },
				isCurrentDraft: { type: 'boolean' },
				isCurrentPublished: { type: 'boolean' },
				isHistorical: { type: 'boolean' },
			},
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

		@Inject(DI.agentPublishedVersionsRepository)
		private agentPublishedVersionsRepository: AgentPublishedVersionsRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentDialogueStylesRepository.findOneBy({ id: ps.styleId });
			if (!row || row.userId !== me.id) {
				throw new ApiError({ message: 'No such style.', code: 'NO_SUCH_STYLE', id: 'a0f5f1c1-0e9d-4cf7-a1c9-671e9c75f2dd' });
			}
			const published = row.publishedVersion ?? null;
			const draft = row.draftRevision ?? 1;
			type VersionItem = {
				version: number;
				draftRevision: number;
				reviewStatus: string;
				isPublished: boolean;
				createdAt: string;
				updatedAt: string;
				isCurrentDraft: boolean;
				isCurrentPublished: boolean;
				isHistorical: boolean;
			};
			const items: VersionItem[] = [];

			const history = await this.agentPublishedVersionsRepository.find({
				where: { kind: 'style', targetId: row.id },
				order: { version: 'DESC' },
				take: 50,
			});
			for (const h of history) {
				const snapRevision = typeof h.snapshot?.draftRevision === 'number' ? h.snapshot.draftRevision : h.version;
				items.push({
					version: h.version,
					draftRevision: snapRevision,
					reviewStatus: 'published',
					isPublished: true,
					createdAt: h.createdAt.toISOString(),
					updatedAt: h.createdAt.toISOString(),
					isCurrentDraft: false,
					isCurrentPublished: published != null && h.version === published,
					isHistorical: true,
				});
			}

			// 兼容旧数据：已发布但归档表无对应记录时补一条当前发布版。
			if (published != null && !items.some(it => it.version === published)) {
				items.unshift({
					version: published,
					draftRevision: draft,
					reviewStatus: row.reviewStatus,
					isPublished: true,
					createdAt: row.updatedAt.toISOString(),
					updatedAt: row.updatedAt.toISOString(),
					isCurrentDraft: false,
					isCurrentPublished: true,
					isHistorical: false,
				});
			}

			items.unshift({
				version: draft,
				draftRevision: draft,
				reviewStatus: row.reviewStatus,
				isPublished: row.isPublished,
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString(),
				isCurrentDraft: true,
				isCurrentPublished: published == null,
				isHistorical: false,
			});
			return items;
		});
	}
}
