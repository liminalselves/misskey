/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { In } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { DriveFilesRepository, DriveMissingObjectReportsRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { driveMissingObjectScopes } from '@/models/DriveMissingObjectReport.js';

export const meta = {
	tags: ['admin', 'drive'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:drive',

	limit: { duration: ms('1min'), max: 60 },

	description: 'List drive files reported as missing from the object storage, waiting for review.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			items: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						id: { type: 'string', optional: false, nullable: false },
						fileId: { type: 'string', optional: false, nullable: false },
						name: { type: 'string', optional: false, nullable: false },
						type: { type: 'string', optional: false, nullable: false },
						size: { type: 'integer', optional: false, nullable: false },
						user: { type: 'object', optional: false, nullable: true, ref: 'UserLite' },
						bucket: { type: 'string', optional: false, nullable: false },
						objectKey: { type: 'string', optional: false, nullable: false },
						scope: { type: 'string', optional: false, nullable: false, enum: [...driveMissingObjectScopes] },
						reportCount: { type: 'integer', optional: false, nullable: false },
						firstReportedAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
						lastReportedAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
						verifiedAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
					},
				},
			},
			total: { type: 'integer', optional: false, nullable: false },
			page: { type: 'integer', optional: false, nullable: false },
			pageSize: { type: 'integer', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		page: { type: 'integer', minimum: 1, default: 1 },
		pageSize: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
		scope: { type: 'string', enum: [...driveMissingObjectScopes] },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveMissingObjectReportsRepository)
		private reportsRepository: DriveMissingObjectReportsRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const page = ps.page;
			const pageSize = ps.pageSize;

			const where = ps.scope != null ? { scope: ps.scope } : {};
			const [rows, total] = await this.reportsRepository.findAndCount({
				where,
				order: { lastReportedAt: 'DESC', id: 'DESC' },
				take: pageSize,
				skip: (page - 1) * pageSize,
			});

			const files = rows.length > 0 ? await this.driveFilesRepository.findBy({ id: In(rows.map(r => r.fileId)) }) : [];
			const fileById = new Map(files.map(f => [f.id, f]));

			const userIds = [...new Set(files.map(f => f.userId).filter((id): id is string => typeof id === 'string'))];
			const users = userIds.length > 0 ? await this.usersRepository.findBy({ id: In(userIds) }) : [];
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));

			return {
				items: rows.flatMap(r => {
					const file = fileById.get(r.fileId);
					// 外键级联保证正常情况下文件一定存在；竞态下文件刚被删时直接跳过该行
					if (file == null) return [];
					return [{
						id: r.id,
						fileId: r.fileId,
						name: file.name,
						type: file.type,
						size: file.size,
						user: file.userId ? userById.get(file.userId) ?? null : null,
						bucket: r.bucket,
						objectKey: r.objectKey,
						scope: r.scope,
						reportCount: r.reportCount,
						firstReportedAt: r.firstReportedAt.toISOString(),
						lastReportedAt: r.lastReportedAt.toISOString(),
						verifiedAt: r.verifiedAt.toISOString(),
					}];
				}),
				total,
				page,
				pageSize,
			};
		});
	}
}
