/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { ModerationLogsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { ModerationLogEntityService } from '@/core/entities/ModerationLogEntityService.js';
import { agentGovernanceLogTypes } from '../_utils.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: { type: 'array', optional: false, nullable: false, items: { type: 'object', additionalProperties: true } },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		type: { type: 'string', enum: [...agentGovernanceLogTypes, 'all'], default: 'all' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		untilId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.moderationLogsRepository)
		private moderationLogsRepository: ModerationLogsRepository,

		private moderationLogEntityService: ModerationLogEntityService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps) => {
			const query = this.queryService.makePaginationQuery(
				this.moderationLogsRepository.createQueryBuilder('log'),
				null,
				ps.untilId ?? null,
			).take(ps.limit ?? 30);
			if (ps.type && ps.type !== 'all') {
				query.andWhere('log.type = :type', { type: ps.type });
			} else {
				query.andWhere('log.type IN (:...types)', { types: agentGovernanceLogTypes });
			}
			return await this.moderationLogEntityService.packMany(await query.getMany());
		});
	}
}
