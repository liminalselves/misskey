/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { AgentModelReportsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';

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
		},
	},
} as const;

export const paramDef = { type: 'object', properties: {}, required: [] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentModelReportsRepository)
		private agentModelReportsRepository: AgentModelReportsRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (_ps, _me) => {
			this.agentService.assertAgentsEnabled();
			const pending = await this.agentModelReportsRepository.exists({ where: { resolvedAt: IsNull() } });
			return { pending };
		});
	}
}
