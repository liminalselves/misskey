/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { AgentImageGenerationsRepository, DriveFilesRepository } from '@/models/_.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { MiAgentImageGeneration } from '@/models/AgentImageGeneration.js';
import type { MiMeta } from '@/models/Meta.js';
import type { S3Service } from '@/core/S3Service.js';
import type { ObjectCannedACL } from '@aws-sdk/client-s3';
import { ApiError } from '@/server/api/error.js';

export type SetAgentImageBlockedErrors = {
	noSuchGeneration: { message: string; code: string; id: string };
	objectStorageAclFailed: { message: string; code: string; id: string };
};

const logger = new Logger('AgentImageModeration');

export async function setAgentImageGenerationBlocked(
	deps: {
		db: DataSource;
		agentImageGenerationsRepository: AgentImageGenerationsRepository;
		driveFilesRepository: DriveFilesRepository;
		serverSettings: MiMeta;
		s3Service: S3Service;
	},
	ps: { id: string; blocked: boolean; reason?: string | null },
	meId: string,
	errors: SetAgentImageBlockedErrors,
): Promise<{ id: string; isBlocked: boolean }> {
	const { db, agentImageGenerationsRepository, driveFilesRepository, serverSettings, s3Service } = deps;
	const row = await agentImageGenerationsRepository.findOneBy({ id: ps.id });
	if (!row) throw new ApiError(errors.noSuchGeneration);

	const file = row.fileId == null ? null : await driveFilesRepository.findOneBy({ id: row.fileId });
	let rollbackObjectStorageAcl: (() => Promise<void>) | null = null;
	if (file && !file.storedInternal && !file.isLink) {
		const bucket = serverSettings.objectStorageBucket;
		if (!serverSettings.useObjectStorage || bucket == null) throw new ApiError(errors.objectStorageAclFailed);
		const targetAcl: ObjectCannedACL = ps.blocked
			? 'private'
			: serverSettings.objectStorageSetPublicRead ? 'public-read' : 'private';
		const rollbackAcl: ObjectCannedACL = row.isBlocked
			? 'private'
			: serverSettings.objectStorageSetPublicRead ? 'public-read' : 'private';
		const keys = [file.accessKey, file.thumbnailAccessKey, file.webpublicAccessKey].filter((key): key is string => key != null);
		const restoreAcl = async (changedKeys: string[]) => {
			const results = await Promise.allSettled(changedKeys.map(key => s3Service.setObjectAcl(serverSettings, { Bucket: bucket, Key: key, ACL: rollbackAcl })));
			if (results.some(result => result.status === 'rejected')) {
				logger.error(`Failed to restore object storage ACL for agent image ${row.id}`);
			}
		};
		const changedKeys: string[] = [];
		try {
			for (const key of keys) {
				await s3Service.setObjectAcl(serverSettings, { Bucket: bucket, Key: key, ACL: targetAcl });
				changedKeys.push(key);
			}
		} catch {
			await restoreAcl(changedKeys);
			throw new ApiError(errors.objectStorageAclFailed);
		}
		rollbackObjectStorageAcl = () => restoreAcl(keys);
	}

	const status: MiAgentImageGeneration['status'] = ps.blocked
		? 'blocked'
		: row.status === 'blocked' ? file ? 'succeeded' : 'failed' : row.status;
	const errorCode = ps.blocked ? null : row.status === 'blocked' ? file ? null : 'AGENT_IMAGE_FILE_REMOVED' : row.errorCode;
	const now = new Date();
	try {
		// Storage ACL changes cannot participate in this database transaction.
		await db.transaction(async tm => {
			const changed = await tm.update(MiAgentImageGeneration, { id: row.id, updatedAt: row.updatedAt }, {
				status, errorCode, isBlocked: ps.blocked,
				blockedReason: ps.blocked ? ps.reason ?? null : null,
				blockedByUserId: ps.blocked ? meId : null,
				blockedAt: ps.blocked ? now : null,
				updatedAt: now,
			});
			if (changed.affected !== 1) throw new ApiError(errors.noSuchGeneration);
			if (file != null) await tm.update(MiDriveFile, { id: file.id }, { isAgentImageBlocked: ps.blocked });
		});
	} catch (error) {
		await rollbackObjectStorageAcl?.();
		throw error;
	}
	return { id: row.id, isBlocked: ps.blocked };
}
