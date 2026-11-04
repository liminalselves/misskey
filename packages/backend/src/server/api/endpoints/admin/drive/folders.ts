/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { DriveFoldersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { DriveFolderEntityService } from '@/core/entities/DriveFolderEntityService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:drive',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			folder: { type: 'object', optional: false, nullable: true, ref: 'DriveFolder' },
			folders: {
				type: 'array',
				optional: false, nullable: false,
				items: { type: 'object', optional: false, nullable: false, ref: 'DriveFolder' },
			},
		},
	},

	errors: {
		noSuchFolder: {
			message: 'No such folder.',
			code: 'NO_SUCH_FOLDER',
			id: '6f1b6a0e-8a2e-4a8f-9a55-2a4bd1e6c7a1',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		folderId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
	},
	required: ['userId'],
} as const;

/** 管理端按文件夹浏览用户网盘：返回当前文件夹（含祖先链，供面包屑）及其直接子文件夹。 */
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFoldersRepository)
		private driveFoldersRepository: DriveFoldersRepository,

		private driveFolderEntityService: DriveFolderEntityService,
	) {
		super(meta, paramDef, async (ps) => {
			let folder = null;
			if (ps.folderId != null) {
				const row = await this.driveFoldersRepository.findOneBy({ id: ps.folderId, userId: ps.userId });
				if (row == null) throw new ApiError(meta.errors.noSuchFolder);
				folder = await this.driveFolderEntityService.pack(row, { detail: true });
			}

			const query = this.driveFoldersRepository.createQueryBuilder('folder')
				.where('folder.userId = :userId', { userId: ps.userId })
				.orderBy('folder.name', 'ASC')
				.addOrderBy('folder.id', 'ASC')
				.limit(ps.limit);
			if (ps.folderId != null) query.andWhere('folder.parentId = :parentId', { parentId: ps.folderId });
			else query.andWhere('folder.parentId IS NULL');

			const folders = await this.driveFolderEntityService.packMany(await query.getMany(), { detail: true });
			return { folder, folders };
		});
	}
}
