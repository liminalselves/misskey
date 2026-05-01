/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import crypto from 'node:crypto';
import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentRedeemCodesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin',
	limit: { duration: ms('1hour'), max: 60 },
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: { type: 'string', format: 'misskey:id' },
				code: { type: 'string' },
				creditAmount: { type: 'number' },
				note: { type: 'string' },
				expiresAt: { type: 'string', format: 'date-time', nullable: true },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		count: { type: 'integer', minimum: 1, maximum: 100, default: 1 },
		creditAmount: { type: 'number', minimum: 0.0001, maximum: 1000000 },
		note: { type: 'string', minLength: 0, maxLength: 256, default: '' },
		expiresAt: { type: 'string', nullable: true },
	},
	required: ['creditAmount'],
} as const;

function generateCode(): string {
	return crypto.randomBytes(8).toString('hex').toUpperCase();
}

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentRedeemCodesRepository)
		private agentRedeemCodesRepository: AgentRedeemCodesRepository,

		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const count = ps.count ?? 1;
			const expiresAt = ps.expiresAt ? new Date(ps.expiresAt) : null;
			const results: { id: string; code: string; creditAmount: number; note: string; expiresAt: string | null }[] = [];

			for (let i = 0; i < count; i++) {
				const code = generateCode();
				const id = this.idService.gen();
				await this.agentRedeemCodesRepository.insert({
					id,
					createdAt: new Date(),
					code,
					creditAmount: ps.creditAmount,
					note: ps.note ?? '',
					createdById: me.id,
					expiresAt,
					redeemedAt: null,
					redeemedById: null,
					revoked: false,
				});
				results.push({
					id,
					code,
					creditAmount: ps.creditAmount,
					note: ps.note ?? '',
					expiresAt: expiresAt ? expiresAt.toISOString() : null,
				});
			}
			return results;
		});
	}
}
