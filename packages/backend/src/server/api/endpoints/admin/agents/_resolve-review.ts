/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DataSource, EntityManager } from 'typeorm';
import { MiAgentCharacter } from '@/models/AgentCharacter.js';
import { MiAgentDialogueStyle } from '@/models/AgentDialogueStyle.js';
import { MiAgentPublishedVersion } from '@/models/AgentPublishedVersion.js';
import type { AgentService } from '@/core/AgentService.js';
import type { IdService } from '@/core/IdService.js';
import { ApiError } from '@/server/api/error.js';

export type AgentReviewKind = 'character' | 'style';
export type AgentReviewDecision = 'approve' | 'reject';

type ResolveAgentReviewParams = {
	kind: AgentReviewKind;
	id: string;
	decision: AgentReviewDecision;
	rejectReason: string | null;
	rejectMessage: string | null;
	internalNote: string | null;
	noSuchCharacterReviewId: string;
	noSuchStyleReviewId: string;
};

type ResolvedAgentReview =
	| { kind: 'character'; row: MiAgentCharacter }
	| { kind: 'style'; row: MiAgentDialogueStyle };

async function getNextPublishedVersion(
	manager: EntityManager,
	kind: AgentReviewKind,
	targetId: string,
	currentVersion: number | null,
): Promise<number> {
	const result = await manager.createQueryBuilder(MiAgentPublishedVersion, 'version')
		.select('MAX(version.version)', 'max')
		.where('version.kind = :kind', { kind })
		.andWhere('version.targetId = :targetId', { targetId })
		.getRawOne<{ max: string | number | null }>();
	const archivedMax = result?.max == null ? -1 : Number(result.max);
	return Math.max(currentVersion ?? -1, archivedMax) + 1;
}

export async function resolveAgentReview(
	db: DataSource,
	agentService: AgentService,
	idService: IdService,
	params: ResolveAgentReviewParams,
): Promise<ResolvedAgentReview> {
	return db.transaction(async manager => {
		if (params.kind === 'character') {
			const row = await manager.findOne(MiAgentCharacter, {
				where: { id: params.id },
				lock: { mode: 'pessimistic_write' },
			});
			if (!row || row.reviewStatus !== 'pending') {
				throw new ApiError({ message: 'No pending review for this character.', code: 'NO_SUCH_REVIEW', id: params.noSuchCharacterReviewId });
			}

			const now = new Date();
			if (params.decision === 'approve') {
				const snapshot = agentService.buildCharacterSnapshotFromRow(row) as unknown as Record<string, unknown>;
				row.publishedSnapshot = snapshot;
				row.publishedVersion = await getNextPublishedVersion(manager, 'character', row.id, row.publishedVersion);
				row.reviewStatus = 'published';
				row.reviewRejectReason = null;
				row.reviewRejectMessage = null;
				row.reviewInternalNote = params.internalNote;
				agentService.syncCharacterListedFlag(row);
				row.updatedAt = now;
				await manager.save(MiAgentCharacter, row);
				await manager.save(MiAgentPublishedVersion, new MiAgentPublishedVersion({
					id: idService.gen(now.getTime()),
					createdAt: now,
					kind: 'character',
					targetId: row.id,
					userId: row.userId,
					version: row.publishedVersion,
					snapshot,
				}));
			} else {
				row.reviewStatus = row.publishedVersion != null ? 'published' : 'rejected';
				row.reviewRejectReason = params.rejectReason;
				row.reviewRejectMessage = params.rejectMessage;
				row.reviewInternalNote = params.internalNote;
				agentService.syncCharacterListedFlag(row);
				row.updatedAt = now;
				await manager.save(MiAgentCharacter, row);
			}
			return { kind: 'character', row };
		}

		const row = await manager.findOne(MiAgentDialogueStyle, {
			where: { id: params.id },
			lock: { mode: 'pessimistic_write' },
		});
		if (!row || row.reviewStatus !== 'pending') {
			throw new ApiError({ message: 'No pending review for this style.', code: 'NO_SUCH_REVIEW', id: params.noSuchStyleReviewId });
		}

		const now = new Date();
		if (params.decision === 'approve') {
			const snapshot = agentService.buildStyleSnapshotFromRow(row) as unknown as Record<string, unknown>;
			row.publishedSnapshot = snapshot;
			row.publishedVersion = await getNextPublishedVersion(manager, 'style', row.id, row.publishedVersion);
			row.reviewStatus = 'published';
			row.reviewRejectReason = null;
			row.reviewRejectMessage = null;
			row.reviewInternalNote = params.internalNote;
			agentService.syncStyleListedFlag(row);
			row.updatedAt = now;
			await manager.save(MiAgentDialogueStyle, row);
			await manager.save(MiAgentPublishedVersion, new MiAgentPublishedVersion({
				id: idService.gen(now.getTime()),
				createdAt: now,
				kind: 'style',
				targetId: row.id,
				userId: row.userId,
				version: row.publishedVersion,
				snapshot,
			}));
		} else {
			row.reviewStatus = row.publishedVersion != null ? 'published' : 'rejected';
			row.reviewRejectReason = params.rejectReason;
			row.reviewRejectMessage = params.rejectMessage;
			row.reviewInternalNote = params.internalNote;
			agentService.syncStyleListedFlag(row);
			row.updatedAt = now;
			await manager.save(MiAgentDialogueStyle, row);
		}
		return { kind: 'style', row };
	});
}
