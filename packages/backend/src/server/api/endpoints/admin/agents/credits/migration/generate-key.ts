/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaService } from '@/core/MetaService.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	requireAdmin: true,
	secure: true,
	kind: 'write:admin',
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			key: { type: 'string' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// 生成 64 字符随机 hex Key
			const plainKey = crypto.randomBytes(32).toString('hex');

			// SHA-256 哈希后存储
			const hash = crypto.createHash('sha256').update(plainKey).digest('hex');

			await this.metaService.update({
				agentMigrationKeyHash: hash,
			});

			// 明文仅本次返回
			return { key: plainKey };
		});
	}
}
