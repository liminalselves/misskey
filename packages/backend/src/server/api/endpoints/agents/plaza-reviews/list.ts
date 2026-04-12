/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { AgentPlazaReviewService } from '@/core/AgentPlazaReviewService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:notes',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			reviews: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						stars: { type: 'integer', optional: false, nullable: false },
						note: { type: 'object', optional: false, nullable: false, ref: 'Note' },
					},
					required: ['stars', 'note'],
				},
			},
		},
		required: ['reviews'],
	},
	errors: {
		invalidTarget: {
			message: 'Specify exactly one of characterId or styleId.',
			code: 'INVALID_PLAZA_REVIEW_LIST_TARGET',
			id: 'f6a7b8c9-d0e1-2345-f012-456789012345',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		characterId: { type: 'string', format: 'misskey:id', nullable: true },
		styleId: { type: 'string', format: 'misskey:id', nullable: true },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		untilNoteId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private agentPlazaReviewService: AgentPlazaReviewService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const hasCh = ps.characterId != null && ps.characterId !== '';
			const hasSt = ps.styleId != null && ps.styleId !== '';
			if (hasCh === hasSt) {
				throw new ApiError(meta.errors.invalidTarget);
			}
			const reviews = await this.agentPlazaReviewService.listReviews(me, {
				characterId: hasCh ? ps.characterId! : null,
				styleId: hasSt ? ps.styleId! : null,
				limit: ps.limit ?? 30,
				untilNoteId: ps.untilNoteId ?? null,
			});
			return { reviews };
		});
	}
}
