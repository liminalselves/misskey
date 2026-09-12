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
				.where('log.createdAt >= :since', { since })
				.andWhere('log.modelId IS NOT NULL')
				.andWhere('log.status IN (:...statuses)', { statuses: ['allow', 'block', 'failed'] })
				.groupBy('log.modelId')
				.addGroupBy('log.status')
				.addGroupBy('log.failureKind')
				.getRawMany<{ modelId: string; status: AgentExternalAuditStatus; failureKind: AgentExternalAuditFailureKind | null; count: number }>();
			const byModel = new Map<string, { total: number; allow: number; block: number; failed: number; apiFailed: number; parseFailed: number }>();
			for (const row of rows) {
				const bucket = byModel.get(row.modelId) ?? { total: 0, allow: 0, block: 0, failed: 0, apiFailed: 0, parseFailed: 0 };
				const count = Number(row.count) || 0;
				bucket.total += count;
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
				const b = byModel.get(id) ?? { total: 0, allow: 0, block: 0, failed: 0, apiFailed: 0, parseFailed: 0 };
				return {
					id,
					name: typeof m.name === 'string' ? m.name : id,
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
				};
			}).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
		});
	}
}
