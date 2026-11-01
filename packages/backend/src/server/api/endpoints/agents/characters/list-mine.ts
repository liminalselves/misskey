/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCharactersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'read:chat',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: { type: 'string', format: 'misskey:id' },
				name: { type: 'string' },
				summary: { type: 'string', nullable: true },
				isPublished: { type: 'boolean' },
				reviewStatus: { type: 'string' },
				publishedVersion: { type: 'integer', nullable: true },
				reviewRejectReason: { type: 'string', nullable: true },
				reviewRejectMessage: { type: 'string', nullable: true },
				hasWorldbook: { type: 'boolean' },
				createdAt: { type: 'string', format: 'date-time' },
				updatedAt: { type: 'string', format: 'date-time' },
				avatar: { type: 'object', ref: 'DriveFile', nullable: true },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
		untilId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		private agentService: AgentService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const limit = ps.limit ?? 100;
			const qb = this.agentCharactersRepository.createQueryBuilder('c')
				.where('c.userId = :userId', { userId: me.id })
				.select(['c.id', 'c.name', 'c.summary', 'c.isPublished', 'c.reviewStatus', 'c.publishedVersion', 'c.reviewRejectReason', 'c.reviewRejectMessage', 'c.worldbook', 'c.avatarFileId', 'c.createdAt', 'c.updatedAt'])
				.orderBy('c.updatedAt', 'DESC')
				.addOrderBy('c.id', 'DESC')
				.take(limit);
			if (ps.untilId != null) {
				// (updatedAt, id) 复合游标：updatedAt 相同的并列行按 id 决胜，避免翻页丢行/重行
				const cursor = await this.agentCharactersRepository.findOne({
					where: { id: ps.untilId, userId: me.id },
					select: { id: true, updatedAt: true },
				});
				if (cursor) {
					qb.andWhere('(c.updatedAt < :cursorUpdatedAt OR (c.updatedAt = :cursorUpdatedAt AND c.id < :cursorId))', {
						cursorUpdatedAt: cursor.updatedAt,
						cursorId: cursor.id,
					});
				}
			}
			const rows = await qb.getMany();
			const avatarIds = [...new Set(rows.map(r => r.avatarFileId).filter((id): id is string => id != null))];
			const avatarMap = avatarIds.length > 0
				? await this.driveFileEntityService.packManyByIdsMap(avatarIds, {})
				: new Map();
			return rows.map(r => ({
				id: r.id,
				name: r.name,
				summary: r.summary,
				isPublished: r.isPublished,
				reviewStatus: r.reviewStatus,
				publishedVersion: r.publishedVersion,
				reviewRejectReason: r.reviewRejectReason,
				reviewRejectMessage: r.reviewRejectMessage,
				hasWorldbook: this.agentService.hasWorldbookEntries(r.worldbook),
				createdAt: r.createdAt.toISOString(),
				updatedAt: r.updatedAt.toISOString(),
				avatar: r.avatarFileId ? avatarMap.get(r.avatarFileId) ?? null : null,
			}));
		});
	}
}
