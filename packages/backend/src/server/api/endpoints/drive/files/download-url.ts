/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
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
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.config)
		private config: Config,

		private metaService: MetaService,
		private s3Service: S3Service,
	) {
		super(meta, paramDef, async (ps) => {
			const file = await this.driveFilesRepository.findOneBy({ id: ps.fileId });
			if (!file || file.isAgentImageBlocked) {
				throw new ApiError({
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: '352efb7b-b2b8-4cff-b044-629fc2730dc2',
				});
			}

			const instance = await this.metaService.fetch(true);
			if (instance.useObjectStorage && typeof instance.objectStorageBucket === 'string' && file.userHost == null && file.accessKey) {
				const url = await this.s3Service.getSignedDownloadUrl(instance, {
					Bucket: instance.objectStorageBucket,
					Key: file.accessKey,
					ResponseContentType: file.type,
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
}
