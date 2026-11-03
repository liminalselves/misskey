/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentExternalAuditLogsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { MetaService } from '@/core/MetaService.js';
import { countPendingReviewUsers } from './_review-qualification.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	requireModerator: true,
	secure: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			pending: { type: 'boolean' },
			count: { type: 'integer' },
		},
	},
} as const;

export const paramDef = { type: 'object', properties: {}, required: [] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentExternalAuditLogsRepository)
		private agentExternalAuditLogsRepository: AgentExternalAuditLogsRepository,

		private agentService: AgentService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async () => {
			this.agentService.assertAgentsEnabled();
			const metaEntity = await this.metaService.fetch();
			const count = await countPendingReviewUsers(this.agentExternalAuditLogsRepository, metaEntity.agentReviewTriggerRules);
			return { pending: count > 0, count };
		});
	}
}
