/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { IdService } from '@/core/IdService.js';
import { resolveAgentReview } from '../_resolve-review.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	secure: true,
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
		rejectReason: { type: 'string', minLength: 1, maxLength: 64, nullable: true },
		rejectMessage: { type: 'string', minLength: 1, maxLength: 2000, nullable: true },
		internalNote: { type: 'string', maxLength: 2000, nullable: true },
	},
	required: ['kind', 'id', 'decision'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db)
		private db: DataSource,

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
					id: 'd3f91c13-56b1-4ad5-9a8c-16275cfa0b5a',
				});
			}

			const resolved = await resolveAgentReview(this.db, this.agentService, this.idService, {
				kind: ps.kind,
				id: ps.id,
				decision: ps.decision,
				rejectReason,
				rejectMessage,
				internalNote,
				noSuchCharacterReviewId: 'b8c9d0e1-f2a3-4567-bcde-f89012345678',
				noSuchStyleReviewId: 'c9d0e1f2-a3b4-5678-cdef-901234567890',
			});
			const row = resolved.row;
			await this.moderationLogService.logSafely(me, 'resolveAgentReview', {
				kind: resolved.kind,
				id: row.id,
				decision: ps.decision,
				name: row.name,
				ownerUserId: row.userId,
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
				{ agentKind: resolved.kind, resourceId: row.id, resourceName: row.name },
			);
			return {
				ok: true,
				reviewStatus: row.reviewStatus,
				publishedVersion: row.publishedVersion,
				isPublished: row.isPublished,
			};
		});
	}
}
