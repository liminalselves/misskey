/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In, IsNull } from 'typeorm';
import type { AgentExternalAuditLogsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'write:admin',
	limit: { duration: ms('1hour'), max: 60 },
	res: { type: 'object', optional: false, nullable: false, additionalProperties: true },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		/** 要忽略的外审记录 ID 列表 */
		ids: {
			type: 'array',
			items: { type: 'string', format: 'misskey:id' },
			minItems: 1,
		},
	},
	required: ['ids'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentExternalAuditLogsRepository)
		private agentExternalAuditLogsRepository: AgentExternalAuditLogsRepository,

		private agentService: AgentService,
		private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();

			const result = await this.agentExternalAuditLogsRepository.update(
				{ id: In(ps.ids), reviewIgnoredAt: IsNull() },
				{ reviewIgnoredAt: new Date(), reviewIgnoredById: me.id },
			);

			await this.moderationLogService.log(me, 'ignoreAgentExternalAuditReview', {
				ids: ps.ids,
				count: result.affected ?? 0,
			});

			return { ok: true, ignored: result.affected ?? 0 };
		});
	}
}
