/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentRedeemCodesRepository, UserProfilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:account',
	limit: { duration: ms('1hour'), max: 30 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			ok: { type: 'boolean' },
			creditAmount: { type: 'number' },
			newBalance: { type: 'number' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		code: { type: 'string', minLength: 1, maxLength: 32 },
	},
	required: ['code'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentRedeemCodesRepository)
		private agentRedeemCodesRepository: AgentRedeemCodesRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			const code = ps.code.trim().toUpperCase();
			const row = await this.agentRedeemCodesRepository.findOneBy({ code });

			if (!row) {
				throw new ApiError({
					message: 'Invalid redeem code.',
					code: 'INVALID_REDEEM_CODE',
					id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
				});
			}
			if (row.revoked) {
				throw new ApiError({
					message: 'This code has been revoked.',
					code: 'REDEEM_CODE_REVOKED',
					id: 'b2c3d4e5-f6a7-8901-2345-67890abcdef0',
				});
			}
			if (row.redeemedAt) {
				throw new ApiError({
					message: 'This code has already been redeemed.',
					code: 'REDEEM_CODE_ALREADY_USED',
					id: 'c3d4e5f6-a7b8-9012-3456-7890abcdef01',
				});
			}
			if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
				throw new ApiError({
					message: 'This code has expired.',
					code: 'REDEEM_CODE_EXPIRED',
					id: 'd4e5f6a7-b8c9-0123-4567-890abcdef012',
				});
			}

			// 一次性码必须用条件更新原子认领：并发请求中只有一个能命中
			// `redeemedAt IS NULL`，杜绝 check-then-act 竞态导致的重复入账
			const claim = await this.agentRedeemCodesRepository.createQueryBuilder()
				.update()
				.set({
					redeemedAt: new Date(),
					redeemedById: me.id,
				})
				.where('id = :id AND "redeemedAt" IS NULL AND revoked = false', { id: row.id })
				.execute();
			if ((claim.affected ?? 0) !== 1) {
				throw new ApiError({
					message: 'This code has already been redeemed.',
					code: 'REDEEM_CODE_ALREADY_USED',
					id: 'c3d4e5f6-a7b8-9012-3456-7890abcdef01',
				});
			}

			await this.userProfilesRepository.increment(
				{ userId: me.id },
				'agentCreditBalance',
				row.creditAmount,
			);

			const profile = await this.userProfilesRepository.findOneBy({ userId: me.id });
			const newBalance = profile?.agentCreditBalance ?? row.creditAmount;

			return {
				ok: true,
				creditAmount: row.creditAmount,
				newBalance,
			};
		});
	}
}
