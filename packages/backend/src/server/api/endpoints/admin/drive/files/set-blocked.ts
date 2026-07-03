/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { ObjectCannedACL } from '@aws-sdk/client-s3';
import type { AgentImageGenerationsRepository, DriveFilesRepository } from '@/models/_.js';
import type { MiMeta } from '@/models/Meta.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { DI } from '@/di-symbols.js';
import { S3Service } from '@/core/S3Service.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';

const noSuchFileError = {
	message: 'No such file.',
	code: 'NO_SUCH_FILE',
	id: '3db53445-f58b-4e1c-bd85-3c5f8e77b7e2',
};

const notImageError = {
	message: 'Only image files can be blocked.',
	code: 'NOT_IMAGE_FILE',
	id: '89fc3145-c51e-477e-8e84-d4d986f5fd2d',
};

const objectStorageAclError = {
	message: 'Failed to update the object storage ACL.',
	code: 'DRIVE_FILE_OBJECT_STORAGE_ACL_FAILED',
	id: '3b63d4cd-2b28-4ad4-8213-7f6f73d925f0',
};

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'write:admin:drive',
	limit: { duration: ms('1hour'), max: 300 },
	res: {
		type: 'object',
		ref: 'DriveFile',
	},
	errors: {
		noSuchFile: noSuchFileError,
		notImage: notImageError,
		objectStorageAclFailed: objectStorageAclError,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		fileId: { type: 'string', format: 'misskey:id' },
		blocked: { type: 'boolean' },
	},
	required: ['fileId', 'blocked'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.agentImageGenerationsRepository)
		private agentImageGenerationsRepository: AgentImageGenerationsRepository,

		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private s3Service: S3Service,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const file = await this.driveFilesRepository.findOneBy({ id: ps.fileId });
			if (file == null) throw new ApiError(meta.errors.noSuchFile);
			if (!file.type.startsWith('image/')) throw new ApiError(meta.errors.notImage);

			let rollbackObjectStorageAcl: (() => Promise<void>) | null = null;
			if (!file.storedInternal && !file.isLink) {
				const bucket = this.serverSettings.objectStorageBucket;
				if (!this.serverSettings.useObjectStorage || bucket == null) {
					throw new ApiError(meta.errors.objectStorageAclFailed);
				}

				const targetAcl: ObjectCannedACL = ps.blocked
					? 'private'
					: this.serverSettings.objectStorageSetPublicRead ? 'public-read' : 'private';
				const rollbackAcl: ObjectCannedACL = file.isAgentImageBlocked
					? 'private'
					: this.serverSettings.objectStorageSetPublicRead ? 'public-read' : 'private';
				const keys = [
					file.accessKey,
					file.thumbnailAccessKey,
					file.webpublicAccessKey,
				].filter((key): key is string => key != null);
				const changedKeys: string[] = [];

				try {
					for (const key of keys) {
						await this.s3Service.setObjectAcl(this.serverSettings, {
							Bucket: bucket,
							Key: key,
							ACL: targetAcl,
						});
						changedKeys.push(key);
					}
				} catch {
					await Promise.allSettled(changedKeys.map(key => this.s3Service.setObjectAcl(this.serverSettings, {
						Bucket: bucket,
						Key: key,
						ACL: rollbackAcl,
					})));
					throw new ApiError(meta.errors.objectStorageAclFailed);
				}

				rollbackObjectStorageAcl = async () => {
					await Promise.allSettled(keys.map(key => this.s3Service.setObjectAcl(this.serverSettings, {
						Bucket: bucket,
						Key: key,
						ACL: rollbackAcl,
					})));
				};
			}

			try {
				await this.driveFilesRepository.update(file.id, {
					isAgentImageBlocked: ps.blocked,
				});
				if (file.isAgentGenerated) {
					await this.agentImageGenerationsRepository.update({
						fileId: file.id,
					}, ps.blocked ? {
						status: 'blocked',
						errorCode: null,
						isBlocked: true,
						blockedReason: null,
						blockedByUserId: me.id,
						blockedAt: new Date(),
						updatedAt: new Date(),
					} : {
						status: 'succeeded',
						errorCode: null,
						isBlocked: false,
						blockedReason: null,
						blockedByUserId: null,
						blockedAt: null,
						updatedAt: new Date(),
					});
				}
			} catch (error) {
				await rollbackObjectStorageAcl?.();
				throw error;
			}

			return await this.driveFileEntityService.pack(file.id, { detail: true, withUser: true, self: true });
		});
	}
}
