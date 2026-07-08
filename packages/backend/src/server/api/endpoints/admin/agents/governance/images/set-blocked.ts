/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentImageGenerationsRepository, DriveFilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { S3Service } from '@/core/S3Service.js';
import type { MiMeta } from '@/models/Meta.js';
import type { ObjectCannedACL } from '@aws-sdk/client-s3';

const objectStorageAclError = {
	message: 'Failed to update the object storage ACL.',
	code: 'AGENT_IMAGE_OBJECT_STORAGE_ACL_FAILED',
	id: 'e2682226-074c-44b9-a7f2-3910934fd5bf',
};

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'write:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: { type: 'object', optional: false, nullable: false, additionalProperties: true },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
		blocked: { type: 'boolean' },
		reason: { type: 'string', nullable: true, maxLength: 256 },
	},
	required: ['id', 'blocked'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentImageGenerationsRepository)
		private agentImageGenerationsRepository: AgentImageGenerationsRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private agentService: AgentService,
		private s3Service: S3Service,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentImageGenerationsRepository.findOneBy({ id: ps.id });
			if (!row) throw new ApiError({ message: 'No such image generation.', code: 'NO_SUCH_AGENT_IMAGE_GENERATION', id: 'f39050e7-738a-4c51-a87d-3e74cd4e32e1' });

			const file = row.fileId == null ? null : await this.driveFilesRepository.findOneBy({ id: row.fileId });
			let rollbackObjectStorageAcl: (() => Promise<void>) | null = null;
			if (file && !file.storedInternal && !file.isLink) {
				const bucket = this.serverSettings.objectStorageBucket;
				if (!this.serverSettings.useObjectStorage || bucket == null) throw new ApiError(objectStorageAclError);
				const targetAcl: ObjectCannedACL = ps.blocked ? 'private' : this.serverSettings.objectStorageSetPublicRead ? 'public-read' : 'private';
				const rollbackAcl: ObjectCannedACL = row.isBlocked ? 'private' : this.serverSettings.objectStorageSetPublicRead ? 'public-read' : 'private';
				const keys = [file.accessKey, file.thumbnailAccessKey, file.webpublicAccessKey].filter((key): key is string => key != null);
				const changedKeys: string[] = [];
				try {
					for (const key of keys) {
						await this.s3Service.setObjectAcl(this.serverSettings, { Bucket: bucket, Key: key, ACL: targetAcl });
						changedKeys.push(key);
					}
				} catch {
					await Promise.allSettled(changedKeys.map(key => this.s3Service.setObjectAcl(this.serverSettings, { Bucket: bucket, Key: key, ACL: rollbackAcl })));
					throw new ApiError(objectStorageAclError);
				}
				rollbackObjectStorageAcl = async () => {
					await Promise.allSettled(keys.map(key => this.s3Service.setObjectAcl(this.serverSettings, { Bucket: bucket, Key: key, ACL: rollbackAcl })));
				};
			}

			if (ps.blocked) {
				row.status = 'blocked';
				row.errorCode = null;
			} else if (row.status === 'blocked') {
				const fileExists = file != null;
				row.status = fileExists ? 'succeeded' : 'failed';
				row.errorCode = fileExists ? null : 'AGENT_IMAGE_FILE_REMOVED';
			}

			row.isBlocked = ps.blocked;
			row.blockedReason = ps.blocked ? ps.reason ?? null : null;
			row.blockedByUserId = ps.blocked ? me.id : null;
			row.blockedAt = ps.blocked ? new Date() : null;
			row.updatedAt = new Date();
			try {
				await this.agentImageGenerationsRepository.save(row);
				if (file) await this.driveFilesRepository.update(file.id, { isAgentImageBlocked: ps.blocked });
			} catch (error) {
				await rollbackObjectStorageAcl?.();
				throw error;
			}
			return { id: row.id, isBlocked: row.isBlocked };
		});
	}
}
