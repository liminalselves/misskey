/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository, DriveFileTombstonesRepository, PagesRepository, PageLikesRepository } from '@/models/_.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { Packed } from '@/misc/json-schema.js';
import type { } from '@/models/Blocking.js';
import type { MiUser } from '@/models/User.js';
import type { MiPage } from '@/models/Page.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from './UserEntityService.js';
import { DriveFileEntityService } from './DriveFileEntityService.js';

@Injectable()
export class PageEntityService {
	constructor(
		@Inject(DI.pagesRepository)
		private pagesRepository: PagesRepository,

		@Inject(DI.pageLikesRepository)
		private pageLikesRepository: PageLikesRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.driveFileTombstonesRepository)
		private driveFileTombstonesRepository: DriveFileTombstonesRepository,

		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async pack(
		src: MiPage['id'] | MiPage,
		me?: { id: MiUser['id'] } | null | undefined,
		hint?: {
			packedUser?: Packed<'UserLite'>
		},
	): Promise<Packed<'Page'>> {
		const meId = me ? me.id : null;
		const page = typeof src === 'object' ? src : await this.pagesRepository.findOneByOrFail({ id: src });

		const attachedFileIds: string[] = [];
		const collectFile = (xs: any[]) => {
			for (const x of xs) {
				if (x.type === 'image') {
					attachedFileIds.push(x.fileId);
				}
				if (x.children) {
					collectFile(x.children);
				}
			}
		};
		collectFile(page.content);

		// 後方互換性のため
		let migrated = false;
		const migrate = (xs: any[]) => {
			for (const x of xs) {
				if (x.type === 'input') {
					if (x.inputType === 'text') {
						x.type = 'textInput';
					}
					if (x.inputType === 'number') {
						x.type = 'numberInput';
						if (x.default) x.default = parseInt(x.default, 10);
					}
					migrated = true;
				}
				if (x.children) {
					migrate(x.children);
				}
			}
		};
		migrate(page.content);
		if (migrated) {
			this.pagesRepository.update(page.id, {
				content: page.content,
			});
		}

		return await awaitAll({
			id: page.id,
			createdAt: this.idService.parse(page.id).date.toISOString(),
			updatedAt: page.updatedAt.toISOString(),
			userId: page.userId,
			user: hint?.packedUser ?? this.userEntityService.pack(page.user ?? page.userId, me), // { schema: 'UserDetailed' } すると無限ループするので注意
			content: page.content,
			variables: page.variables,
			title: page.title,
			name: page.name,
			summary: page.summary,
			hideTitleWhenPinned: page.hideTitleWhenPinned,
			alignCenter: page.alignCenter,
			font: page.font,
			script: page.script,
			eyeCatchingImageId: page.eyeCatchingImageId,
			eyeCatchingImage: page.eyeCatchingImageId ? await this.driveFileEntityService.packNullable(page.eyeCatchingImageId, { withDeleted: true }) : null,
			attachedFiles: this.packAttachedFilesWithDeleted(attachedFileIds, page.userId),
			likedCount: page.likedCount,
			isLiked: meId ? await this.pageLikesRepository.exists({ where: { pageId: page.id, userId: meId } }) : undefined,
		});
	}

	@bindThis
	private async packAttachedFilesWithDeleted(fileIds: string[], userId: MiPage['userId']): Promise<Packed<'DriveFile'>[]> {
		if (fileIds.length === 0) return [];
		const [files, tombstones] = await Promise.all([
			this.driveFilesRepository.findBy({ id: In(fileIds), userId }),
			this.driveFileTombstonesRepository.findBy({ id: In(fileIds), userId }),
		]);
		const foundIds = new Set(files.map(f => f.id));
		const packed = await this.driveFileEntityService.packMany(files);
		const packedTombstones = await this.driveFileEntityService.packTombstones(tombstones.filter(t => !foundIds.has(t.id)));
		// 保持 content 中的引用顺序
		const byId = new Map<string, Packed<'DriveFile'>>([...packed, ...packedTombstones].map(f => [f.id, f]));
		return fileIds.map(id => byId.get(id)).filter((x): x is Packed<'DriveFile'> => x != null);
	}

	@bindThis
	public async packMany(
		pages: MiPage[],
		me?: { id: MiUser['id'] } | null | undefined,
	) {
		const _users = pages.map(({ user, userId }) => user ?? userId);
		const _userMap = await this.userEntityService.packMany(_users, me)
			.then(users => new Map(users.map(u => [u.id, u])));
		return Promise.all(pages.map(page => this.pack(page, me, { packedUser: _userMap.get(page.userId) })));
	}
}
