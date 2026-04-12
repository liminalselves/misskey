/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { AgentPlazaReviewService } from '@/core/AgentPlazaReviewService.js';
import { MAX_NOTE_TEXT_LENGTH } from '@/const.js';

/** 广场评价帖仅允许与普通帖等价的两种范围（不含首页专用 / 指定用户） */
const plazaReviewVisibilities = ['public', 'followers'] as const;

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:notes',
	limit: { duration: ms('1hour'), max: 60 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			note: { type: 'object', optional: false, nullable: false, ref: 'Note' },
		},
	},
	errors: {
		invalidTarget: {
			message: 'Specify exactly one of characterId or styleId.',
			code: 'INVALID_PLAZA_REVIEW_TARGET',
			id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
		},
		invalidStars: {
			message: 'Stars must be between 0 and 5.',
			code: 'INVALID_PLAZA_REVIEW_STARS',
			id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
		},
		invalidText: {
			message: 'Review text is required.',
			code: 'INVALID_PLAZA_REVIEW_TEXT',
			id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
		},
		noSuch: {
			message: 'No such plaza item.',
			code: 'NO_SUCH_PLAZA_REVIEW_TARGET',
			id: 'd4e5f6a7-b8c9-0123-def0-234567890123',
		},
		invalidVisibility: {
			message: 'Visibility must be public or followers only.',
			code: 'INVALID_PLAZA_REVIEW_VISIBILITY',
			id: 'e5f6a7b8-c9d0-1234-ef01-456789012345',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		characterId: { type: 'string', format: 'misskey:id', nullable: true },
		styleId: { type: 'string', format: 'misskey:id', nullable: true },
		stars: { type: 'integer', minimum: 0, maximum: 5 },
		text: { type: 'string', minLength: 1, maxLength: MAX_NOTE_TEXT_LENGTH },
		cw: { type: 'string', nullable: true, maxLength: 500 },
		visibility: { type: 'string', enum: [...plazaReviewVisibilities] },
		visibleUserIds: {
			type: 'array',
			nullable: true,
			items: { type: 'string', format: 'misskey:id' },
		},
		localOnly: { type: 'boolean', default: false },
		reactionAcceptance: { type: 'string', nullable: true },
	},
	required: ['stars', 'text', 'visibility'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private agentPlazaReviewService: AgentPlazaReviewService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const res = await this.agentPlazaReviewService.createOrReplace(me, {
					characterId: ps.characterId ?? null,
					styleId: ps.styleId ?? null,
					stars: ps.stars,
					text: ps.text,
					visibility: ps.visibility,
					visibleUserIds: ps.visibleUserIds ?? [],
					localOnly: ps.localOnly ?? false,
					cw: ps.cw ?? null,
					reactionAcceptance: ps.reactionAcceptance ?? null,
				});
				return { note: res.note };
			} catch (e) {
				if (e instanceof Error) {
					if (e.message === 'INVALID_TARGET') throw new ApiError(meta.errors.invalidTarget);
					if (e.message === 'INVALID_STARS') throw new ApiError(meta.errors.invalidStars);
					if (e.message === 'INVALID_TEXT') throw new ApiError(meta.errors.invalidText);
					if (e.message === 'NO_SUCH_CHARACTER' || e.message === 'NO_SUCH_STYLE') throw new ApiError(meta.errors.noSuch);
					if (e.message === 'INVALID_VISIBILITY') throw new ApiError(meta.errors.invalidVisibility);
				}
				if (e instanceof IdentifiableError) {
					if (e.id === '689ee33f-f97c-479a-ac49-1b9f8140af99') {
						throw new ApiError({ message: 'Contains prohibited words.', code: 'CONTAINS_PROHIBITED_WORDS', id: 'e5f6a7b8-c9d0-1234-ef01-345678901234' });
					}
				}
				throw e;
			}
		});
	}
}
