/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCharactersRepository, AgentDialogueStylesRepository, AgentPublishedVersionsRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { IdService } from '@/core/IdService.js';
import { MiAgentPublishedVersion } from '@/models/AgentPublishedVersion.js';
import { getAcctByUserId } from '../_utils.js';

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
		kind: { type: 'string', enum: ['character', 'style'] },
		id: { type: 'string', format: 'misskey:id' },
		decision: { type: 'string', enum: ['approve', 'reject'] },
		rejectReason: { type: 'string', minLength: 1, maxLength: 64, nullable: true },
		rejectMessage: { type: 'string', minLength: 1, maxLength: 2000, nullable: true },
		internalNote: { type: 'string', maxLength: 2000, nullable: true },
	},
	required: ['kind', 'id', 'decision'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		@Inject(DI.agentPublishedVersionsRepository)
		private agentPublishedVersionsRepository: AgentPublishedVersionsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private agentService: AgentService,
		private moderationLogService: ModerationLogService,
		private notificationService: NotificationService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const rejectReason = ps.rejectReason?.trim() || null;
			const rejectMessage = ps.rejectMessage?.trim() || null;
			const internalNote = ps.internalNote?.trim() || null;
			if (ps.decision === 'reject' && (rejectReason == null || rejectMessage == null)) {
				throw new ApiError({
					message: 'Reject reason and message are required.',
					code: 'REJECT_REASON_REQUIRED',
					id: 'ebf4bda5-4688-49a4-95ad-e99ce9ecdd4e',
				});
			}

			if (ps.kind === 'character') {
				const row = await this.agentCharactersRepository.findOneBy({ id: ps.id });
				if (!row || row.reviewStatus !== 'pending') {
					throw new ApiError({ message: 'No pending review for this character.', code: 'NO_SUCH_REVIEW', id: 'c9fb2179-dbb1-4f24-a0dc-ef7d3ed140d2' });
				}
				let archivedSnapshot: Record<string, unknown> | null = null;
				if (ps.decision === 'approve') {
					const snap = this.agentService.buildCharacterSnapshotFromRow(row);
					row.publishedSnapshot = snap as unknown as Record<string, unknown>;
					row.publishedVersion = row.publishedVersion == null ? 0 : row.publishedVersion + 1;
					row.reviewStatus = 'published';
					row.reviewRejectReason = null;
					row.reviewRejectMessage = null;
					row.reviewInternalNote = internalNote;
					archivedSnapshot = snap as unknown as Record<string, unknown>;
				} else {
					row.reviewStatus = row.publishedVersion != null ? 'published' : 'rejected';
					row.reviewRejectReason = rejectReason;
					row.reviewRejectMessage = rejectMessage;
					row.reviewInternalNote = internalNote;
				}
				this.agentService.syncCharacterListedFlag(row);
				row.updatedAt = new Date();
				await this.agentCharactersRepository.save(row);
				if (archivedSnapshot != null && row.publishedVersion != null) {
					const now = new Date();
					await this.agentPublishedVersionsRepository.save(new MiAgentPublishedVersion({
						id: this.idService.gen(now.getTime()),
						createdAt: now,
						kind: 'character',
						targetId: row.id,
						userId: row.userId,
						version: row.publishedVersion,
						snapshot: archivedSnapshot,
					}));
				}
				const ownerAcct = await getAcctByUserId(this.usersRepository, row.userId);
				await this.moderationLogService.log(me, 'resolveAgentReview', {
					kind: 'character',
					id: row.id,
					decision: ps.decision,
					name: row.name,
					ownerUserId: row.userId,
					ownerAcct,
					reviewStatus: row.reviewStatus,
					publishedVersion: row.publishedVersion,
					isPublished: row.isPublished,
					rejectReason,
					rejectMessage,
					internalNote,
				});
				this.notificationService.createNotification(
					row.userId,
					ps.decision === 'approve' ? 'agentReviewApproved' : 'agentReviewRejected',
					{ agentKind: 'character', resourceId: row.id, resourceName: row.name },
				);
				return { ok: true, reviewStatus: row.reviewStatus, publishedVersion: row.publishedVersion, isPublished: row.isPublished };
			}

			const row = await this.agentDialogueStylesRepository.findOneBy({ id: ps.id });
			if (!row || row.reviewStatus !== 'pending') {
				throw new ApiError({ message: 'No pending review for this style.', code: 'NO_SUCH_REVIEW', id: 'd5ec8470-1a3c-4557-b7d7-f13d8dc3a4d2' });
			}
			let archivedSnapshot: Record<string, unknown> | null = null;
			if (ps.decision === 'approve') {
				const snap = this.agentService.buildStyleSnapshotFromRow(row);
				row.publishedSnapshot = snap as unknown as Record<string, unknown>;
				row.publishedVersion = row.publishedVersion == null ? 0 : row.publishedVersion + 1;
				row.reviewStatus = 'published';
				row.reviewRejectReason = null;
				row.reviewRejectMessage = null;
				row.reviewInternalNote = internalNote;
				archivedSnapshot = snap as unknown as Record<string, unknown>;
			} else {
				row.reviewStatus = row.publishedVersion != null ? 'published' : 'rejected';
				row.reviewRejectReason = rejectReason;
				row.reviewRejectMessage = rejectMessage;
				row.reviewInternalNote = internalNote;
			}
			this.agentService.syncStyleListedFlag(row);
			row.updatedAt = new Date();
			await this.agentDialogueStylesRepository.save(row);
			if (archivedSnapshot != null && row.publishedVersion != null) {
				const now = new Date();
				await this.agentPublishedVersionsRepository.save(new MiAgentPublishedVersion({
					id: this.idService.gen(now.getTime()),
					createdAt: now,
					kind: 'style',
					targetId: row.id,
					userId: row.userId,
					version: row.publishedVersion,
					snapshot: archivedSnapshot,
				}));
			}
			const ownerAcct = await getAcctByUserId(this.usersRepository, row.userId);
			await this.moderationLogService.log(me, 'resolveAgentReview', {
				kind: 'style',
				id: row.id,
				decision: ps.decision,
				name: row.name,
				ownerUserId: row.userId,
				ownerAcct,
				reviewStatus: row.reviewStatus,
				publishedVersion: row.publishedVersion,
				isPublished: row.isPublished,
				rejectReason,
				rejectMessage,
				internalNote,
			});
			this.notificationService.createNotification(
				row.userId,
				ps.decision === 'approve' ? 'agentReviewApproved' : 'agentReviewRejected',
				{ agentKind: 'style', resourceId: row.id, resourceName: row.name },
			);
			return { ok: true, reviewStatus: row.reviewStatus, publishedVersion: row.publishedVersion, isPublished: row.isPublished };
		});
	}
}
