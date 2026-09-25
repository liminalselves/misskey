/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentSessionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentProactiveScheduleService, ScheduleControlError } from '@/core/AgentProactiveScheduleService.js';
import { agentProactiveScheduleStatuses, type AgentProactiveScheduleTrigger } from '@/models/AgentProactiveSchedule.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 60 },
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			importedCount: { type: 'integer' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
			schedules: {
				type: 'array',
				maxItems: 5000,
				items: {
					type: 'object',
					properties: {
						description: { type: 'string', minLength: 1, maxLength: 80 },
						status: { type: 'string', enum: agentProactiveScheduleStatuses },
						trigger: { type: 'object', additionalProperties: true },
						createdAt: { type: 'string', nullable: true },
						updatedAt: { type: 'string', nullable: true },
						nextRunAt: { type: 'string', nullable: true },
						lastRunAt: { type: 'string', nullable: true },
						remainingRuns: { type: 'integer', nullable: true, minimum: 0 },
					},
					required: ['description', 'status', 'trigger'],
				},
			},
	},
	required: ['sessionId', 'schedules'],
} as const;

/** 将导入的原始 trigger 结构规范化为联合类型；无法识别时返回 null（由服务层安全跳过）。 */
function parseImportedTrigger(raw: unknown): AgentProactiveScheduleTrigger | null {
	if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const value = raw as Record<string, unknown>;
	if (value.type === 'once' && typeof value.at === 'string') {
		return { type: 'once', at: value.at };
	}
	if (value.type === 'recurring' && typeof value.cron === 'string') {
		const repeat = value.repeat as Record<string, unknown> | undefined;
		if (repeat != null && typeof repeat === 'object') {
			if (repeat.mode === 'unlimited') {
				return { type: 'recurring', cron: value.cron, repeat: { mode: 'unlimited' } };
			}
			if (repeat.mode === 'count' && typeof repeat.count === 'number' && Number.isInteger(repeat.count)) {
				return { type: 'recurring', cron: value.cron, repeat: { mode: 'count', count: repeat.count } };
			}
		}
	}
	return null;
}

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		private agentService: AgentService,
		private agentProactiveScheduleService: AgentProactiveScheduleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'd3f0b2a4-9c1e-4b7a-8f5d-2a6c9e1b4f07' });

			const normalized = ps.schedules.map(item => {
				const trigger = parseImportedTrigger(item.trigger);
				if (trigger == null) {
					throw new ApiError({ message: 'Invalid proactive schedule trigger.', code: 'INVALID_PARAM', id: '97b93fc9-55bd-45fe-a1b6-775aa45bd65a' });
				}
				return {
					description: item.description,
					status: item.status,
					trigger,
					createdAt: item.createdAt,
					updatedAt: item.updatedAt,
					nextRunAt: item.nextRunAt,
					lastRunAt: item.lastRunAt,
					remainingRuns: item.remainingRuns,
				};
			});

			try {
				const importedCount = await this.agentProactiveScheduleService.importSchedules(session.id, normalized);
				return { importedCount };
			} catch (error) {
				if (error instanceof ScheduleControlError) {
					throw new ApiError({
						message: error.message,
						code: error.code,
						id: '0abcfdb9-e2e2-4301-a944-b31bcf9a0d30',
						kind: 'client',
						httpStatusCode: 400,
					});
				}
				throw error;
			}
		});
	}
}
