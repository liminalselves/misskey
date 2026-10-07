/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DriveFilesRepository } from '@/models/_.js';
import type { MiAgentImageGeneration } from '@/models/AgentImageGeneration.js';
import type { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';

export async function packAgentImagePlaceholder(
	row: MiAgentImageGeneration,
	driveFilesRepository: DriveFilesRepository,
	driveFileEntityService: DriveFileEntityService,
) {
	if (row.messageId == null) return null;
	let file = null;
	const rawFile = row.fileId == null ? null : await driveFilesRepository.findOneBy({ id: row.fileId });
	const isAutoCleaned = row.status === 'auto_cleaned' || row.autoCleanedAt != null;
	const isBlocked = !isAutoCleaned && (row.isBlocked || rawFile?.isAgentImageBlocked === true);
	if (!isAutoCleaned && !isBlocked && row.status === 'succeeded' && row.fileId != null) {
		try {
			file = await driveFileEntityService.pack(row.fileId, { self: true, withDeleted: true });
		} catch {
			file = null;
		}
	}
	return {
		id: row.id,
		messageId: row.messageId,
		placeholderIndex: row.placeholderIndex,
		status: isAutoCleaned ? 'auto_cleaned' : isBlocked ? 'blocked' : row.status,
		fileId: row.fileId,
		url: isAutoCleaned || isBlocked ? null : row.url,
		file,
		errorCode: isAutoCleaned || isBlocked ? null : row.errorCode,
		errorMessage: isAutoCleaned || isBlocked ? null : row.errorMessage,
		tag: row.tag,
		size: row.size,
		isBlocked: isAutoCleaned ? false : isBlocked,
		autoCleanedAt: row.autoCleanedAt?.toISOString() ?? null,
		autoCleanedReason: row.autoCleanedReason,
	};
}
