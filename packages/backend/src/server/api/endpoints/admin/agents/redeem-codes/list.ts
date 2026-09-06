/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Brackets, In } from 'typeorm';
import type { AgentRedeemCodesRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { escapeIlikePattern } from '../governance/_utils.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	secure: true,
	requireAdmin: true,
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
				code: { type: 'string' },
				creditAmount: { type: 'number' },
				note: { type: 'string' },
				expiresAt: { type: 'string', format: 'date-time', nullable: true },
				redeemedAt: { type: 'string', format: 'date-time', nullable: true },
				redeemedBy: { type: 'object', ref: 'UserLite', nullable: true },
				revoked: { type: 'boolean' },
				status: { type: 'string', enum: ['available', 'redeemed', 'expired', 'revoked'] },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		status: { type: 'string', enum: ['available', 'redeemed', 'expired', 'revoked'], nullable: true },
		query: { type: 'string', minLength: 1, maxLength: 512, nullable: true },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		untilId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;

type CodeStatus = 'available' | 'redeemed' | 'expired' | 'revoked';

function getStatus(row: { revoked: boolean; redeemedAt: Date | null; expiresAt: Date | null }): CodeStatus {
	if (row.revoked) return 'revoked';
	if (row.redeemedAt) return 'redeemed';
	if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return 'expired';
	return 'available';
}

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentRedeemCodesRepository)
		private agentRedeemCodesRepository: AgentRedeemCodesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private queryService: QueryService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const q = this.queryService.makePaginationQuery(
				this.agentRedeemCodesRepository.createQueryBuilder('c')
					.leftJoin('c.redeemedBy', 'ru'),
				null,
				ps.untilId ?? null,
			).take(ps.limit ?? 30);

			if (ps.status === 'revoked') {
				q.andWhere('c.revoked = true');
			} else if (ps.status === 'redeemed') {
				q.andWhere('c.revoked = false').andWhere('c.redeemedAt IS NOT NULL');
			} else if (ps.status === 'expired') {
				q.andWhere('c.revoked = false')
					.andWhere('c.redeemedAt IS NULL')
					.andWhere('c.expiresAt IS NOT NULL')
					.andWhere('c.expiresAt < NOW()');
			} else if (ps.status === 'available') {
				q.andWhere('c.revoked = false')
					.andWhere('c.redeemedAt IS NULL')
					.andWhere('(c.expiresAt IS NULL OR c.expiresAt >= NOW())');
			}

			if (ps.query) {
				const pattern = `%${escapeIlikePattern(ps.query.trim())}%`;
				q.andWhere(new Brackets(qb => {
					qb.where('c.code ILIKE :pattern ESCAPE \'\\\'')
						.orWhere('c.note ILIKE :pattern ESCAPE \'\\\'')
						.orWhere('ru.username ILIKE :pattern ESCAPE \'\\\'')
						.orWhere('ru.name ILIKE :pattern ESCAPE \'\\\'');
				}), { pattern });
			}

			const rows = await q.getMany();

			const redeemedUserIds = [...new Set(rows.map(r => r.redeemedById).filter(Boolean))] as string[];
			const users = redeemedUserIds.length > 0 ? await this.usersRepository.findBy({ id: In(redeemedUserIds) }) : [];
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));

			return rows.map(r => ({
				id: r.id,
				createdAt: r.createdAt.toISOString(),
				code: r.code,
				creditAmount: r.creditAmount,
				note: r.note,
				expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
				redeemedAt: r.redeemedAt ? r.redeemedAt.toISOString() : null,
				redeemedBy: r.redeemedById ? (userById.get(r.redeemedById) ?? null) : null,
				revoked: r.revoked,
				status: getStatus(r),
			}));
		});
	}
}
