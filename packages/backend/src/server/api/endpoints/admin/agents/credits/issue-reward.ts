/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { IdService } from '@/core/IdService.js';
import { MetaService } from '@/core/MetaService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { creditGrantErrors, issueAgentCreditGrant } from './_issue-grant.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'write:admin',
	limit: { duration: ms('1hour'), max: 60 },
	res: { type: 'object', optional: false, nullable: false, additionalProperties: true },
	errors: creditGrantErrors,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', minLength: 1, maxLength: 128 },
		amount: { type: 'number', minimum: 0.01, maximum: 100000 },
		reason: { type: 'string', maxLength: 200, nullable: true },
	},
	required: ['userId', 'amount'],
} as const;

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
			return issueAgentCreditGrant({
				usersRepository: this.usersRepository,
				db: this.db,
				idService: this.idService,
				notificationService: this.notificationService,
				notificationIcon: instance.iconUrl ?? instance.logoImageUrl ?? null,
			}, {
				kind: 'reward',
				userRef: ps.userId,
				amount: Math.round(ps.amount * 100) / 100,
				reason: ps.reason,
			});
		});
	}
}
