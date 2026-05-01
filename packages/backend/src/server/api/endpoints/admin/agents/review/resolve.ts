/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCharactersRepository, AgentDialogueStylesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { NotificationService } from '@/core/NotificationService.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			ok: { type: 'boolean' },
			reviewStatus: { type: 'string' },
			publishedVersion: { type: 'integer', nullable: true },
			isPublished: { type: 'boolean' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		kind: { type: 'string', enum: ['character', 'style'] },
		id: { type: 'string', format: 'misskey:id' },
		decision: { type: 'string', enum: ['approve', 'reject'] },
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

		private agentService: AgentService,

		private moderationLogService: ModerationLogService,

		private notificationService: NotificationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			if (ps.kind === 'character') {
				const row = await this.agentCharactersRepository.findOneBy({ id: ps.id });
				if (!row || row.reviewStatus !== 'pending') {
					throw new ApiError({
						message: 'No pending review for this character.',
						code: 'NO_SUCH_REVIEW',
						id: 'b8c9d0e1-f2a3-4567-bcde-f89012345678',
					});
				}
				if (ps.decision === 'approve') {
					const snap = this.agentService.buildCharacterSnapshotFromRow(row);
					row.publishedSnapshot = snap as unknown as Record<string, unknown>;
					row.publishedVersion = row.publishedVersion == null ? 0 : row.publishedVersion + 1;
					row.reviewStatus = 'published';
				} else {
					row.reviewStatus = row.publishedVersion != null ? 'published' : 'rejected';
				}
				this.agentService.syncCharacterListedFlag(row);
				row.updatedAt = new Date();
				await this.agentCharactersRepository.save(row);
			await this.moderationLogService.log(me, 'resolveAgentReview', {
				kind: 'character',
				id: row.id,
				decision: ps.decision,
				name: row.name,
				ownerUserId: row.userId,
				reviewStatus: row.reviewStatus,
				publishedVersion: row.publishedVersion,
				isPublished: row.isPublished,
			});
			this.notificationService.createNotification(
				row.userId,
				ps.decision === 'approve' ? 'agentReviewApproved' : 'agentReviewRejected',
				{ agentKind: 'character', resourceId: row.id, resourceName: row.name },
			);
			return {
				ok: true,
				reviewStatus: row.reviewStatus,
				publishedVersion: row.publishedVersion,
				isPublished: row.isPublished,
			};
			} else {
				const row = await this.agentDialogueStylesRepository.findOneBy({ id: ps.id });
				if (!row || row.reviewStatus !== 'pending') {
					throw new ApiError({
						message: 'No pending review for this style.',
						code: 'NO_SUCH_REVIEW',
						id: 'c9d0e1f2-a3b4-5678-cdef-901234567890',
					});
				}
				if (ps.decision === 'approve') {
					const snap = this.agentService.buildStyleSnapshotFromRow(row);
					row.publishedSnapshot = snap as unknown as Record<string, unknown>;
					row.publishedVersion = row.publishedVersion == null ? 0 : row.publishedVersion + 1;
					row.reviewStatus = 'published';
				} else {
					row.reviewStatus = row.publishedVersion != null ? 'published' : 'rejected';
				}
				this.agentService.syncStyleListedFlag(row);
				row.updatedAt = new Date();
				await this.agentDialogueStylesRepository.save(row);
			await this.moderationLogService.log(me, 'resolveAgentReview', {
				kind: 'style',
				id: row.id,
				decision: ps.decision,
				name: row.name,
				ownerUserId: row.userId,
				reviewStatus: row.reviewStatus,
				publishedVersion: row.publishedVersion,
				isPublished: row.isPublished,
			});
			this.notificationService.createNotification(
				row.userId,
				ps.decision === 'approve' ? 'agentReviewApproved' : 'agentReviewRejected',
				{ agentKind: 'style', resourceId: row.id, resourceName: row.name },
			);
			return {
				ok: true,
				reviewStatus: row.reviewStatus,
				publishedVersion: row.publishedVersion,
				isPublished: row.isPublished,
			};
			}
		});
	}
}
