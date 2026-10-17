/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentModelUsageLogsRepository, AgentRedeemCodesRepository, AgentUserModelsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { MetaService } from '@/core/MetaService.js';
import { AgentVisionService } from '@/core/AgentVisionService.js';
import { fetchAgentBillingPage } from '../../agents/_billing-logs.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1min'), max: 30 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			items: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						kind: { type: 'string', enum: ['usage', 'redeem'] },
						createdAt: { type: 'string', format: 'date-time' },
						amount: { type: 'number' },
						modelName: { type: 'string', nullable: true },
						usageKind: { type: 'string', enum: ['chat', 'compression', 'image_generation', 'vision', 'sticker_description', 'proactive_random', 'proactive_scheduled', 'checkin', 'admin_reward', 'admin_compensation', 'credit_migration'], nullable: true },
						status: { type: 'string', nullable: true },
						durationMs: { type: 'integer', nullable: true },
						redeemCode: { type: 'string', nullable: true },
						usedFreeQuota: { type: 'boolean', nullable: true },
						freeQuotaUsedAtCall: { type: 'integer', nullable: true },
						freeQuotaTotalAtCall: { type: 'integer', nullable: true },
					},
				},
			},
			hasMore: { type: 'boolean' },
			total: { type: 'integer' },
			page: { type: 'integer' },
			pageSize: { type: 'integer' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		untilDate: { type: 'string', nullable: true, maxLength: 64 },
		page: { type: 'integer', minimum: 1, default: 1 },
		pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentModelUsageLogsRepository)
		private agentModelUsageLogsRepository: AgentModelUsageLogsRepository,

		@Inject(DI.agentRedeemCodesRepository)
		private agentRedeemCodesRepository: AgentRedeemCodesRepository,

		@Inject(DI.agentUserModelsRepository)
		private agentUserModelsRepository: AgentUserModelsRepository,

		private agentService: AgentService,
		private metaService: MetaService,
		private agentVisionService: AgentVisionService,
	) {
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();

			const limit = ps.limit ?? 30;
			const page = ps.page ?? 1;
			const pageSize = ps.pageSize ?? limit;
			// 校验器未注册 date-time 格式，非法时间串在此统一退化为「无上限」
			const untilDate = ps.untilDate != null ? new Date(ps.untilDate) : null;

			const { items, hasMore, total } = await fetchAgentBillingPage({
				agentModelUsageLogsRepository: this.agentModelUsageLogsRepository,
				agentRedeemCodesRepository: this.agentRedeemCodesRepository,
				agentUserModelsRepository: this.agentUserModelsRepository,
				metaService: this.metaService,
				agentVisionService: this.agentVisionService,
			}, { userId: ps.userId, page, pageSize, untilDate });

			return { items, hasMore, total, page, pageSize };
		});
	}
}
