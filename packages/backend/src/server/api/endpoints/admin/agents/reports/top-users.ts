/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';

/** 前端 BYOK 合并行使用的伪模型 id（与前端约定保持一致） */
const BYOK_MERGED_MODEL_ID = '__byok_custom_models__';

/** 前端“未关联模型”合并行使用的伪模型 id（与前端约定保持一致） */
const UNASSIGNED_MODEL_ID = '__unassigned_model__';

/** since/until 自定义窗口的最大跨度（自然年，防止全表扫描） */
const MAX_WINDOW_MS = 366 * 24 * 60 * 60 * 1000;

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireAdmin: true,
	kind: 'read:admin',
	limit: { duration: ms('5min'), max: 60 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			total: { type: 'integer' },
			users: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						userId: { type: 'string' },
						username: { type: 'string' },
						name: { type: 'string', nullable: true },
						total: { type: 'integer' },
						freeCalls: { type: 'integer' },
						paidCalls: { type: 'integer' },
						creditsCharged: { type: 'number' },
					},
					required: ['userId', 'username', 'name', 'total', 'freeCalls', 'paidCalls', 'creditsCharged'],
				},
			},
		},
		required: ['total', 'users'],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		hours: { type: 'integer', minimum: 1, maximum: 2160 },
		// ISO 8601 时间字符串（校验器未注册 date-time 格式，保持纯 string，与签到报表 dateFrom/dateTo 一致）
		since: { type: 'string' },
		until: { type: 'string' },
		modelId: { type: 'string' },
		page: { type: 'integer', minimum: 1 },
		limit: { type: 'integer', minimum: 1, maximum: 100 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private agentService: AgentService,
		private agentModelUsageService: AgentModelUsageService,
	) {
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();

			// 时间窗口：优先 since/until（自然月等自定义维度），否则按 hours 回滚（与 overview 同口径）
			const now = Date.now();
			let since = ps.since != null ? new Date(ps.since) : new Date(now - (ps.hours ?? 24) * 60 * 60 * 1000);
			let until = ps.until != null ? new Date(ps.until) : new Date(now);
			if (Number.isNaN(since.getTime())) since = new Date(now - (ps.hours ?? 24) * 60 * 60 * 1000);
			if (Number.isNaN(until.getTime()) || until.getTime() <= since.getTime()) until = new Date(now);
			if (until.getTime() - since.getTime() > MAX_WINDOW_MS) since = new Date(until.getTime() - MAX_WINDOW_MS);

			const modelFilter = ps.modelId === BYOK_MERGED_MODEL_ID
				? { byokOnly: true as const }
				: (ps.modelId === UNASSIGNED_MODEL_ID
					? { unassignedOnly: true as const }
					: (ps.modelId != null ? { modelId: ps.modelId } : {}));

			const page = ps.page ?? 1;
			const limit = ps.limit ?? 10;

			const [total, users] = await Promise.all([
				this.agentModelUsageService.countModelUsageUsers({ since, until, ...modelFilter }),
				this.agentModelUsageService.topUsersByCharged({ since, until, limit, offset: (page - 1) * limit, ...modelFilter }),
			]);

			return { total, users };
		});
	}
}
