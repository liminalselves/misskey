/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { DataSource } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import { MiNote } from '@/models/Note.js';
import { MiChatMessage } from '@/models/ChatMessage.js';
import { MiAgentMessage } from '@/models/AgentMessage.js';
import { MiGalleryPost } from '@/models/GalleryPost.js';
import { MiPage } from '@/models/Page.js';
import { QueryService } from '@/core/QueryService.js';
import { RoleService } from '@/core/RoleService.js';
import type { DriveFilesRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { MetaService } from '@/core/MetaService.js';
import { S3Service } from '@/core/S3Service.js';
import { contentDisposition } from '@/misc/content-disposition.js';

export const meta = {
	tags: ['drive'],
	requireCredential: true,
	kind: 'read:drive',
	limit: { duration: ms('1hour'), max: 240 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			url: { type: 'string' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		fileId: { type: 'string', format: 'misskey:id' },
	},
	required: ['fileId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db) private db: DataSource,
		private queryService: QueryService,
		private roleService: RoleService,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.config)
		private config: Config,

		private metaService: MetaService,
		private s3Service: S3Service,
	) {
		super(meta, paramDef, async (ps, me) => {
			const file = await this.driveFilesRepository.findOneBy({ id: ps.fileId });
			if (!file || file.isAgentImageBlocked) {
				throw new ApiError({
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: '352efb7b-b2b8-4cff-b044-629fc2730dc2',
				});
			}

			if (file.userId !== me.id && !await this.roleService.isModerator(me) && !await this.isAttachedToReadableContent(file.id, file.userId, me.id)) {
				throw new ApiError({ message: 'Access denied.', code: 'ACCESS_DENIED', id: 'f33b7c5d-7471-4c45-9f53-4d7d91d9691e' });
			}

			const instance = await this.metaService.fetch(true);
			if (instance.useObjectStorage && typeof instance.objectStorageBucket === 'string' && file.userHost == null && file.accessKey) {
				const url = await this.s3Service.getSignedDownloadUrl(instance, {
					Bucket: instance.objectStorageBucket,
					Key: file.accessKey,
					ResponseContentDisposition: contentDisposition('attachment', file.name),
				}, 60);
				const signedUrl = new URL(url);
				if (file.url.startsWith('https://') || instance.objectStorageForceHttps) {
					signedUrl.protocol = 'https:';
				}
				return { url: signedUrl.toString() };
			}

			const proxyUrl = new URL('/proxy/image.webp', this.config.url);
			proxyUrl.searchParams.set('url', file.url);
			proxyUrl.searchParams.set('origin', '1');
			proxyUrl.searchParams.set('download', file.name);
			return { url: proxyUrl.toString() };
		});
	}

	private async isAttachedToReadableContent(fileId: string, fileOwnerId: string | null, userId: string): Promise<boolean> {
		const notes = this.db.getRepository(MiNote).createQueryBuilder('note')
			.where('note.fileIds @> ARRAY[:fileId]::varchar[]', { fileId });
		this.queryService.generateVisibilityQuery(notes, { id: userId });
		if (await notes.getExists()) return true;

		const chat = this.db.getRepository(MiChatMessage).createQueryBuilder('message')
			.leftJoin('message.toRoom', 'room')
			.where('message.fileId = :fileId', { fileId })
			.andWhere(`(message.fromUserId = :userId OR message.toUserId = :userId
				OR room.ownerId = :userId
				OR EXISTS (SELECT 1 FROM chat_room_membership membership WHERE membership."roomId" = room.id AND membership."userId" = :userId))`, { userId });
		if (await chat.getExists()) return true;

		if (await this.db.getRepository(MiAgentMessage).createQueryBuilder('message')
			.innerJoin('message.session', 'session')
			.where('message.imageFileId = :fileId AND session.userId = :userId', { fileId, userId }).getExists()) return true;
		if (await this.db.getRepository(MiGalleryPost).createQueryBuilder('post')
			.where('post.fileIds @> ARRAY[:fileId]::varchar[]', { fileId }).getExists()) return true;

		// Page body attachments are packed only when owned by the page author.
		return this.db.getRepository(MiPage).createQueryBuilder('page')
			.where(`(page.eyeCatchingImageId = :fileId OR (page.userId = :fileOwnerId AND jsonb_path_exists(page.content,
				'$.** ? (@.type == "image").fileId ? (@ == $fileId)', jsonb_build_object('fileId', CAST(:fileId AS text)))))`, { fileId, fileOwnerId })
			.getExists();
	}
}
