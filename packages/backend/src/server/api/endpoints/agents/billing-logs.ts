/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentModelUsageLogsRepository, AgentRedeemCodesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { MetaService } from '@/core/MetaService.js';
import { AgentVisionService } from '@/core/AgentVisionService.js';
import { packPublicAgentModels } from '@/misc/agent-llm-models.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:account',
	limit: { duration: ms('5min'), max: 60 },
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
						usageKind: { type: 'string', enum: ['chat', 'compression', 'image_generation', 'vision', 'proactive_random', 'proactive_scheduled'], nullable: true },
						status: { type: 'string', nullable: true },
						durationMs: { type: 'integer', nullable: true },
						redeemCode: { type: 'string', nullable: true },
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
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		untilDate: { type: 'string', nullable: true },
		page: { type: 'integer', minimum: 1, default: 1 },
		pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
	},
	required: [],
} as const;

type BillingItem = {
	id: string;
	kind: 'usage' | 'redeem';
	createdAt: string;
	amount: number;
	modelName: string | null;
	usageKind: 'chat' | 'compression' | 'image_generation' | 'vision' | 'proactive_random' | 'proactive_scheduled' | null;
	status: string | null;
	durationMs: number | null;
	redeemCode: string | null;
};

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentModelUsageLogsRepository)
		private agentModelUsageLogsRepository: AgentModelUsageLogsRepository,

		@Inject(DI.agentRedeemCodesRepository)
		private agentRedeemCodesRepository: AgentRedeemCodesRepository,

		private agentService: AgentService,
		private metaService: MetaService,
		private agentVisionService: AgentVisionService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();

			const limit = ps.limit ?? 30;
			const page = ps.page ?? 1;
			const pageSize = ps.pageSize ?? limit;
			const offset = (page - 1) * pageSize;
			const fetchLimit = offset + pageSize + 1;
			const untilDate = ps.untilDate ? new Date(ps.untilDate) : null;

			const instanceMeta = await this.metaService.fetch(true);
			const modelNameMap = new Map([
				...packPublicAgentModels(instanceMeta).map(m => [m.id, m.name] as const),
				...this.agentVisionService.listAvailableVisionModels(instanceMeta).map(m => [m.id, m.name] as const),
			]);

			const usageQb = this.agentModelUsageLogsRepository.createQueryBuilder('log')
				.where('log.userId = :userId', { userId: me.id })
				.orderBy('log.requestedAt', 'DESC')
				.take(fetchLimit);
			if (untilDate) {
				usageQb.andWhere('log.requestedAt < :until', { until: untilDate });
			}
			const [usageLogs, usageTotal] = await Promise.all([
				usageQb.getMany(),
				this.agentModelUsageLogsRepository.countBy({ userId: me.id }),
			]);

			const redeemQb = this.agentRedeemCodesRepository.createQueryBuilder('c')
				.where('c.redeemedById = :userId', { userId: me.id })
				.andWhere('c.redeemedAt IS NOT NULL')
				.orderBy('c.redeemedAt', 'DESC')
				.take(fetchLimit);
			if (untilDate) {
				redeemQb.andWhere('c.redeemedAt < :until', { until: untilDate });
			}
			const [redeemLogs, redeemTotal] = await Promise.all([
				redeemQb.getMany(),
				this.agentRedeemCodesRepository.count({
					where: { redeemedById: me.id },
				}),
			]);

			const items: BillingItem[] = [];

			for (const log of usageLogs) {
				items.push({
					id: log.id,
					kind: 'usage',
					createdAt: log.requestedAt.toISOString(),
					amount: -log.cost,
					modelName: log.modelId ? (modelNameMap.get(log.modelId) ?? log.modelApiName) : null,
					usageKind: log.usageKind,
					status: log.status,
					durationMs: log.durationMs,
					redeemCode: null,
				});
			}

			for (const rc of redeemLogs) {
				items.push({
					id: rc.id,
					kind: 'redeem',
					createdAt: rc.redeemedAt!.toISOString(),
					amount: rc.creditAmount,
					modelName: null,
					usageKind: null,
					status: null,
					durationMs: null,
					redeemCode: rc.code.slice(0, 4) + '****',
				});
			}

			items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

			const hasMore = items.length > (offset + pageSize);
			const result = items.slice(offset, offset + pageSize);
			const total = usageTotal + redeemTotal;

			return { items: result, hasMore, total, page, pageSize };
		});
	}
}
