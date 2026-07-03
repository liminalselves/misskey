/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1min'), max: 30 },
	res: {
		type: 'array',
		nullable: false, optional: false,
		items: {
			type: 'object',
			properties: {
				userId: { type: 'string', format: 'misskey:id' },
				total: { type: 'integer' },
				success: { type: 'integer' },
				failed: { type: 'integer' },
				aborted: { type: 'integer' },
				/** 成功率 0~1，total=0 时为 null */
				successRate: { type: 'number', nullable: true },
			},
			required: ['userId', 'total', 'success', 'failed', 'aborted', 'successRate'],
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userIds: {
			type: 'array',
			minItems: 1,
			maxItems: 100,
			items: { type: 'string', format: 'misskey:id' },
		},
		windowMs: {
			type: 'integer',
			minimum: 60000,
			maximum: 86400000,
			description: '统计时间窗（毫秒），默认 3600000（1 小时）',
		},
	},
	required: ['userIds'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private agentService: AgentService,
		private agentModelUsageService: AgentModelUsageService,
	) {
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();
			const windowMs = ps.windowMs ?? 3_600_000;
			const rateMap = await this.agentModelUsageService.recentSuccessRate(ps.userIds, windowMs);
			return ps.userIds.map(userId => {
				const r = rateMap.get(userId) ?? { total: 0, success: 0, failed: 0, aborted: 0 };
				const successRate = r.total > 0 ? r.success / r.total : null;
				return { userId, ...r, successRate };
			});
		});
	}
}
