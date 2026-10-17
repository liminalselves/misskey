/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { IdService } from '@/core/IdService.js';
import { MetaService } from '@/core/MetaService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { issueAgentCreditGrant } from './_issue-grant.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'write:admin',
	limit: { duration: ms('1hour'), max: 20 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			results: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						index: { type: 'integer' },
						kind: { type: 'string', enum: ['reward', 'compensation'] },
						userRef: { type: 'string' },
						amount: { type: 'number' },
						ok: { type: 'boolean' },
						userId: { type: 'string', optional: true },
						newBalance: { type: 'number', optional: true },
						error: {
							type: 'object', optional: true,
							properties: {
								code: { type: 'string' },
								message: { type: 'string' },
							},
						},
					},
				},
			},
			successCount: { type: 'integer' },
			failCount: { type: 'integer' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		items: {
			type: 'array', minItems: 1, maxItems: 200,
			items: {
				type: 'object',
				properties: {
					kind: { type: 'string', enum: ['reward', 'compensation'] },
					userRef: { type: 'string', minLength: 1, maxLength: 128 },
					amount: { type: 'number', minimum: 0.01, maximum: 100000 },
					reason: { type: 'string', maxLength: 200, nullable: true },
				},
				required: ['kind', 'userRef', 'amount'],
			},
		},
	},
	required: ['items'],
} as const;

type GrantResult = {
	index: number;
	kind: 'reward' | 'compensation';
	userRef: string;
	amount: number;
	ok: boolean;
	userId?: string;
	newBalance?: number;
	error?: { code: string; message: string };
};

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.db)
		private db: DataSource,

		private agentService: AgentService,
		private idService: IdService,
		private metaService: MetaService,
		private notificationService: NotificationService,
	) {
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();
			const instance = await this.metaService.fetch(true);
			const deps = {
				usersRepository: this.usersRepository,
				db: this.db,
				idService: this.idService,
				notificationService: this.notificationService,
				notificationIcon: instance.iconUrl ?? instance.logoImageUrl ?? null,
			};
			const logger = new Logger('AgentCreditGrantBatch');
			const resolvedUserIds = new Map<string, string | null>();
			const results: GrantResult[] = [];
			for (const [index, item] of ps.items.entries()) {
				const base = { index, kind: item.kind, userRef: item.userRef, amount: item.amount };
				try {
					const result = await issueAgentCreditGrant(deps, item, resolvedUserIds);
					results.push({ ...base, ...result, ok: true });
				} catch (error) {
					if (!(error instanceof ApiError)) logger.error(`Credit grant row ${index} failed`, error);
					results.push({
						...base,
						ok: false,
						error: error instanceof ApiError
							? { code: error.code, message: error.message }
							: { code: 'INTERNAL_ERROR', message: 'Credit grant failed.' },
					});
				}
			}
			const successCount = results.filter(result => result.ok).length;
			return { results, successCount, failCount: results.length - successCount };
		});
	}
}
