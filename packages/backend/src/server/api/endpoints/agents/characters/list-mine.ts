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
				createdAt: { type: 'string', format: 'date-time' },
				updatedAt: { type: 'string', format: 'date-time' },
				avatar: { type: 'object', ref: 'DriveFile', nullable: true },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
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
			const rows = await this.agentCharactersRepository.find({
				where: { userId: me.id },
				order: { updatedAt: 'DESC' },
				select: ['id', 'name', 'summary', 'isPublished', 'reviewStatus', 'publishedVersion', 'avatarFileId', 'createdAt', 'updatedAt'],
				take: 100,
			});
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
				createdAt: r.createdAt.toISOString(),
				updatedAt: r.updatedAt.toISOString(),
				avatar: r.avatarFileId ? avatarMap.get(r.avatarFileId) ?? null : null,
			}));
		});
	}
}
