/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentRedeemCodesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			ok: { type: 'boolean' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		codeId: { type: 'string', format: 'misskey:id' },
	},
	required: ['codeId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentRedeemCodesRepository)
		private agentRedeemCodesRepository: AgentRedeemCodesRepository,
	) {
		super(meta, paramDef, async (ps, _me) => {
			const row = await this.agentRedeemCodesRepository.findOneBy({ id: ps.codeId });
			if (!row) {
				throw new ApiError({
					message: 'No such redeem code.',
					code: 'NO_SUCH_REDEEM_CODE',
					id: 'e1f2a3b4-c5d6-7890-abcd-ef1234567890',
				});
			}
			if (row.redeemedAt) {
				throw new ApiError({
					message: 'This code has already been redeemed.',
					code: 'ALREADY_REDEEMED',
					id: 'f2a3b4c5-d6e7-8901-bcde-f12345678901',
				});
			}
			await this.agentRedeemCodesRepository.update(row.id, { revoked: true });
			return { ok: true };
		});
	}
}
