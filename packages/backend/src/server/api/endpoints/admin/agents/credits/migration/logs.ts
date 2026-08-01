/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCreditMigrationsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	requireAdmin: true,
	secure: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: { type: 'string', format: 'misskey:id' },
				createdAt: { type: 'string', format: 'date-time' },
				targetUser: { type: 'object', ref: 'UserLite', nullable: true },
				amount: { type: 'number' },
				requestId: { type: 'string', nullable: true },
				sourceInfo: { type: 'string', nullable: true },
				operator: { type: 'object', ref: 'UserLite', nullable: true },
				status: { type: 'string' },
				failReason: { type: 'string', nullable: true },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		untilId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCreditMigrationsRepository)
		private agentCreditMigrationsRepository: AgentCreditMigrationsRepository,

		private queryService: QueryService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const q = this.queryService.makePaginationQuery(
				this.agentCreditMigrationsRepository.createQueryBuilder('m'),
				null,
				ps.untilId ?? null,
			).take(ps.limit ?? 30);

			const rows = await q.getMany();
			if (rows.length === 0) return [];

			const userIds = [...new Set(rows.flatMap(r => [r.targetUserId, r.operatorId]))];
			const usersMap = await this.userEntityService.packMany(userIds, me, { schema: 'UserLite' })
				.then(users => new Map(users.map(u => [u.id, u])));

			return rows.map(r => ({
				id: r.id,
				createdAt: r.createdAt.toISOString(),
				targetUser: usersMap.get(r.targetUserId) ?? null,
				amount: r.amount,
				requestId: r.requestId,
				sourceInfo: r.sourceInfo,
				operator: usersMap.get(r.operatorId) ?? null,
				status: r.status,
				failReason: r.failReason,
			}));
		});
	}
}
