/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In, IsNull, LessThanOrEqual } from 'typeorm';
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
	anyOf: [
		{
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
		},
		{
			type: 'object',
			properties: {
				/** 忽略该用户截至 untilId（含）的全部未审阅拦截记录，之后新到的记录保持待复审 */
				userId: { type: 'string', format: 'misskey:id' },
				untilId: { type: 'string', format: 'misskey:id' },
				/** 给出（含 null=无会话）时只忽略该会话组；省略则覆盖该用户全部会话 */
				sessionId: { type: 'string', format: 'misskey:id', nullable: true },
			},
			required: ['userId', 'untilId'],
		},
	],
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

			// A user range is updated by condition, so long-lived backlogs never hit bind-parameter limits.
			const target = 'ids' in ps
				? { id: In(ps.ids) }
				: {
					userId: ps.userId,
					status: 'block' as const,
					id: LessThanOrEqual(ps.untilId),
					...(ps.sessionId === undefined ? {} : { sessionId: ps.sessionId === null ? IsNull() : ps.sessionId }),
				};
			const result = await this.agentExternalAuditLogsRepository.update(
				{ ...target, reviewIgnoredAt: IsNull() },
				{ reviewIgnoredAt: new Date(), reviewIgnoredById: me.id },
			);

			await this.moderationLogService.logSafely(me, 'ignoreAgentExternalAuditReview', {
				...('ids' in ps ? { ids: ps.ids } : { ids: [], userId: ps.userId, untilId: ps.untilId, sessionId: ps.sessionId }),
				count: result.affected ?? 0,
			});

			return { ok: true, ignored: result.affected ?? 0 };
		});
	}
}
