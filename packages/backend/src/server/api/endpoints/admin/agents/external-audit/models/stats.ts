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
import type { AgentExternalAuditFailureKind, AgentExternalAuditStatus } from '@/models/AgentExternalAuditLog.js';
import { isAgentExternalAuditProvider } from '@/models/AgentExternalAuditProvider.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			additionalProperties: true,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

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
			const instance = await this.metaService.fetch(true);
			const models = Array.isArray(instance.agentExternalAuditModels) ? instance.agentExternalAuditModels : [];
			const since = new Date(Date.now() - 60 * 60 * 1000);
			const rows = await this.agentExternalAuditLogsRepository.createQueryBuilder('log')
				.select('log.modelId', 'modelId')
				.addSelect('log.status', 'status')
				.addSelect('log.failureKind', 'failureKind')
				.addSelect('COUNT(*)::int', 'count')
				.addSelect('COUNT(log.durationMs)::int', 'durationCount')
				.addSelect('COALESCE(SUM(log.durationMs), 0)::bigint', 'durationSum')
				.where('log.createdAt >= :since', { since })
				.andWhere('log.modelId IS NOT NULL')
				.andWhere('log.status IN (:...statuses)', { statuses: ['allow', 'block', 'failed'] })
				.groupBy('log.modelId')
				.addGroupBy('log.status')
				.addGroupBy('log.failureKind')
				.getRawMany<{ modelId: string; status: AgentExternalAuditStatus; failureKind: AgentExternalAuditFailureKind | null; count: number; durationCount: number; durationSum: string | number }>();
			type Bucket = { total: number; allow: number; block: number; failed: number; apiFailed: number; parseFailed: number; durationCount: number; durationSum: number; okDurationCount: number; okDurationSum: number };
			const emptyBucket = (): Bucket => ({ total: 0, allow: 0, block: 0, failed: 0, apiFailed: 0, parseFailed: 0, durationCount: 0, durationSum: 0, okDurationCount: 0, okDurationSum: 0 });
			const byModel = new Map<string, Bucket>();
			for (const row of rows) {
				const bucket = byModel.get(row.modelId) ?? emptyBucket();
				const count = Number(row.count) || 0;
				const durationCount = Number(row.durationCount) || 0;
				const durationSum = Number(row.durationSum) || 0;
				bucket.total += count;
				bucket.durationCount += durationCount;
				bucket.durationSum += durationSum;
				// 得出审核结论（放行/拦截）的调用单独统计耗时，避免超时失败拉高均值
				if (row.status === 'allow' || row.status === 'block') {
					bucket.okDurationCount += durationCount;
					bucket.okDurationSum += durationSum;
				}
				if (row.status === 'allow') bucket.allow += count;
				if (row.status === 'block') bucket.block += count;
				if (row.status === 'failed') {
					bucket.failed += count;
					if (row.failureKind === 'parse') bucket.parseFailed += count;
					else bucket.apiFailed += count;
				}
				byModel.set(row.modelId, bucket);
			}
			return models.map((m, i) => {
				const id = typeof m.id === 'string' ? m.id : `model-${i + 1}`;
				const b = byModel.get(id) ?? emptyBucket();
					return {
						id,
						name: typeof m.name === 'string' ? m.name : id,
						provider: isAgentExternalAuditProvider(m.provider) ? m.provider : 'openai',
						apiModelName: typeof m.apiModelName === 'string' ? m.apiModelName : '',
						baseUrl: typeof m.baseUrl === 'string' ? m.baseUrl : '',
					priority: Number.isFinite(Number(m.priority)) ? Math.trunc(Number(m.priority)) : i,
					enabled: m.enabled !== false,
					autoDisabledAt: typeof m.autoDisabledAt === 'string' ? m.autoDisabledAt : null,
					autoDisabledReason: typeof m.autoDisabledReason === 'string' ? m.autoDisabledReason : null,
					total: b.total,
					allow: b.allow,
					block: b.block,
					failed: b.failed,
					apiFailed: b.apiFailed,
					parseFailed: b.parseFailed,
					failureRate: b.total > 0 ? b.failed / b.total : 0,
					avgDurationMs: b.durationCount > 0 ? b.durationSum / b.durationCount : null,
					avgSuccessDurationMs: b.okDurationCount > 0 ? b.okDurationSum / b.okDurationCount : null,
				};
			}).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
		});
	}
}
