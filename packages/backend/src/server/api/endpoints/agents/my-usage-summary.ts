/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type {
	AgentCharactersRepository,
	AgentDialogueStylesRepository,
	UserProfilesRepository,
} from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentImageService } from '@/core/AgentImageService.js';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';
import { MetaService } from '@/core/MetaService.js';
import { getEffectiveLlmModels } from '@/misc/agent-llm-models.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:account',
	limit: { duration: ms('5min'), max: 30 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			creditBalance: { type: 'number' },
			recentLogs: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						requestedAt: { type: 'string' },
						completedAt: { type: 'string', nullable: true },
						durationMs: { type: 'integer', nullable: true },
						modelId: { type: 'string', nullable: true },
						modelName: { type: 'string', nullable: true },
						modelApiName: { type: 'string', nullable: true },
						usageKind: { type: 'string', enum: ['chat', 'compression', 'image_generation', 'vision', 'proactive_random', 'proactive_scheduled', 'checkin', 'admin_reward'] },
						status: { type: 'string' },
						cost: { type: 'number' },
						promptTokens: { type: 'integer', nullable: true },
						completionTokens: { type: 'integer', nullable: true },
						usedFreeQuota: { type: 'boolean', nullable: true },
						freeQuotaUsedAtCall: { type: 'integer', nullable: true },
						freeQuotaTotalAtCall: { type: 'integer', nullable: true },
					},
					required: ['id', 'requestedAt', 'status', 'cost', 'usageKind'],
				},
			},
			recentLogsHasMore: { type: 'boolean' },
			recentLogsTotal: { type: 'integer' },
			recentLogsPage: { type: 'integer' },
			recentLogsPageSize: { type: 'integer' },
			modelStats: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						modelId: { type: 'string', nullable: true },
						modelName: { type: 'string', nullable: true },
						total: { type: 'integer' },
						success: { type: 'integer' },
						failed: { type: 'integer' },
						aborted: { type: 'integer' },
						totalCost: { type: 'number' },
						freeQuotaUsed: { type: 'integer' },
						freeQuotaTotal: { type: 'integer' },
					},
					required: ['modelId', 'modelName', 'total', 'success', 'failed', 'aborted', 'totalCost'],
				},
			},
			characterStats: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						characterId: { type: 'string' },
						characterName: { type: 'string', nullable: true },
						total: { type: 'integer' },
					},
					required: ['characterId', 'characterName', 'total'],
				},
			},
			characterStatsTotal: { type: 'integer' },
			dialogueStyleStats: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						dialogueStyleId: { type: 'string' },
						dialogueStyleName: { type: 'string', nullable: true },
						total: { type: 'integer' },
					},
					required: ['dialogueStyleId', 'dialogueStyleName', 'total'],
				},
			},
			dialogueStyleStatsTotal: { type: 'integer' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100 },
		recentLogsPage: { type: 'integer', minimum: 1, default: 1 },
		recentLogsPageSize: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		characterStatsOffset: { type: 'integer', minimum: 0, default: 0 },
		characterStatsLimit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		dialogueStyleStatsOffset: { type: 'integer', minimum: 0, default: 0 },
		dialogueStyleStatsLimit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		private agentService: AgentService,
		private agentImageService: AgentImageService,
		private agentModelUsageService: AgentModelUsageService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();

			const profile = await this.userProfilesRepository.findOneBy({ userId: me.id });
			const creditBalance = profile?.agentCreditBalance ?? 0;

			const limit = ps.limit ?? 30;
			const recentLogsPage = ps.recentLogsPage ?? 1;
			const recentLogsPageSize = ps.recentLogsPageSize ?? limit;
			const recentLogsOffset = (recentLogsPage - 1) * recentLogsPageSize;
			const fetchLimit = recentLogsPageSize + 1;
			const untilDate = ps.untilDate ? new Date(ps.untilDate) : null;
			const charOffset = ps.characterStatsOffset ?? 0;
			const charLimit = ps.characterStatsLimit ?? 10;
			const styleOffset = ps.dialogueStyleStatsOffset ?? 0;
			const styleLimit = ps.dialogueStyleStatsLimit ?? 10;

			const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

			const [recentLogsRaw, recentLogsTotal, modelStatsRaw, freeQuota30dMap, characterStatsRaw, dialogueStyleStatsRaw, characterStatsTotal, dialogueStyleStatsTotal, instanceMeta] = await Promise.all([
				this.agentModelUsageService.listUserRecent(me.id, { limit: fetchLimit, untilDate, offset: recentLogsOffset }),
				this.agentModelUsageService.countUserLogs(me.id),
				this.agentModelUsageService.aggregateByModel({ userId: me.id, since: since30d }),
				this.agentModelUsageService.countFreeQuotaByModel({ userId: me.id, since: since30d }),
				this.agentModelUsageService.aggregateByCharacter({ userId: me.id, since: since30d, limit: charLimit, offset: charOffset }),
				this.agentModelUsageService.aggregateByDialogueStyle({ userId: me.id, since: since30d, limit: styleLimit, offset: styleOffset }),
				this.agentModelUsageService.countDistinctCharacters({ userId: me.id, since: since30d }),
				this.agentModelUsageService.countDistinctDialogueStyles({ userId: me.id, since: since30d }),
				this.metaService.fetch(true),
			]);

			const recentLogsHasMore = recentLogsRaw.length > recentLogsPageSize;
			if (recentLogsHasMore) recentLogsRaw.pop();

			// 名称映射使用全量模型（含已下架/禁用），避免历史用量记录因模型下架而显示为“—”
			const modelNameMap = new Map<string, string>([
				...getEffectiveLlmModels(instanceMeta).map(m => [m.id, m.name] as const),
				...this.agentImageService.listAvailableImageModels(instanceMeta, true).map(m => [m.id, m.name] as const),
				...(instanceMeta.agentVisionModels ?? []).map(m => [m.id, m.name] as const),
			]);
			const characterIds = characterStatsRaw.map(r => r.characterId);
			const dialogueStyleIds = dialogueStyleStatsRaw.map(r => r.dialogueStyleId);

			const [characterRows, dialogueStyleRows] = await Promise.all([
				characterIds.length > 0
					? this.agentCharactersRepository.find({
						where: { id: In(characterIds) },
						select: ['id', 'name'],
					})
					: Promise.resolve([]),
				dialogueStyleIds.length > 0
					? this.agentDialogueStylesRepository.find({
						where: { id: In(dialogueStyleIds) },
						select: ['id', 'name'],
					})
					: Promise.resolve([]),
			]);

			const characterNameMap = new Map(characterRows.map(r => [r.id, r.name]));
			const dialogueStyleNameMap = new Map(dialogueStyleRows.map(r => [r.id, r.name]));

			// 构建模型免费额度映射（LLM + 生图）
			const quotaMap = new Map<string, number>();
			for (const m of getEffectiveLlmModels(instanceMeta)) {
				if (m.dailyFreeQuota && m.dailyFreeQuota > 0) quotaMap.set(m.id, m.dailyFreeQuota);
			}
			for (const m of this.agentImageService.listAvailableImageModels(instanceMeta, true)) {
				const dfq = (m as any).dailyFreeQuota;
				if (typeof dfq === 'number' && dfq > 0) quotaMap.set(m.id, Math.trunc(dfq));
			}

			const modelStats = modelStatsRaw.map(r => {
				const total = r.modelId ? (quotaMap.get(r.modelId) ?? 0) : 0;
				// 免费次数取近 30 天数据库快照统计（usedFreeQuota=true），而非 Redis 当日计数
				const used = r.modelId ? (freeQuota30dMap.get(r.modelId) ?? 0) : 0;
				return {
					modelId: r.modelId,
					modelName: r.modelId ? (modelNameMap.get(r.modelId) ?? null) : null,
					total: r.total,
					success: r.success,
					failed: r.failed,
					aborted: r.aborted,
					totalCost: r.totalCost,
					freeQuotaUsed: used,
					freeQuotaTotal: total,
				};
			});

			const recentLogs = recentLogsRaw.map(log => ({
				id: log.id,
				requestedAt: log.requestedAt.toISOString(),
				completedAt: log.completedAt?.toISOString() ?? null,
				durationMs: log.durationMs,
				modelId: log.modelId,
				modelName: log.modelId ? (modelNameMap.get(log.modelId) ?? null) : null,
				modelApiName: log.modelApiName,
				usageKind: log.usageKind,
				status: log.status,
				cost: log.cost,
				promptTokens: log.promptTokens,
				completionTokens: log.completionTokens,
				usedFreeQuota: log.usedFreeQuota ?? null,
				freeQuotaUsedAtCall: log.freeQuotaUsedAtCall ?? null,
				freeQuotaTotalAtCall: log.freeQuotaTotalAtCall ?? null,
			}));

			return {
				creditBalance,
				recentLogs,
				recentLogsHasMore,
				recentLogsTotal,
				recentLogsPage,
				recentLogsPageSize,
				modelStats,
				characterStats: characterStatsRaw.map(r => ({
					characterId: r.characterId,
					characterName: characterNameMap.get(r.characterId) ?? null,
					total: r.total,
				})),
				characterStatsTotal,
				dialogueStyleStats: dialogueStyleStatsRaw.map(r => ({
					dialogueStyleId: r.dialogueStyleId,
					dialogueStyleName: dialogueStyleNameMap.get(r.dialogueStyleId) ?? null,
					total: r.total,
				})),
				dialogueStyleStatsTotal,
			};
		});
	}
}
