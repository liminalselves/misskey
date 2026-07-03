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
	properties: { characterId: { type: 'string', format: 'misskey:id' } },
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
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: '0d9ce0f8-2ae5-4c84-8fe2-4e1e2a4e7cb2' });
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

			// 历史已上线版本（含已被更高版本替换的旧版），来自不可变归档表，按版本号倒序。
			const history = await this.agentPublishedVersionsRepository.find({
				where: { kind: 'character', targetId: row.id },
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

			// 兼容旧数据：若已发布但归档表暂无对应记录（历史版本特性上线前发布的），补一条当前发布版。
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

			// 当前草稿态（编辑中的工作副本）。
			items.unshift({
				version: draft,
				draftRevision: draft,
				reviewStatus: row.reviewStatus,
				isPublished: row.isPublished,
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString(),
				isCurrentDraft: true,
				isCurrentPublished: false,
				isHistorical: false,
			});
			return items;
		});
	}
}
