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
	AgentUserModelsRepository,
} from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentImageService } from '@/core/AgentImageService.js';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';
import { MetaService } from '@/core/MetaService.js';
import { getEffectiveLlmModels } from '@/misc/agent-llm-models.js';

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
			modelStats: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						modelId: { type: 'string', nullable: true },
						modelName: { type: 'string', nullable: true },
						modelSource: { type: 'string', enum: ['official', 'user'], nullable: true },
						total: { type: 'integer' },
						success: { type: 'integer' },
						failed: { type: 'integer' },
						aborted: { type: 'integer' },
						totalCost: { type: 'number' },
						freeQuotaUsed: { type: 'integer' },
						freeQuotaTotal: { type: 'integer' },
					},
					required: ['modelId', 'modelName', 'modelSource', 'total', 'success', 'failed', 'aborted', 'totalCost', 'freeQuotaUsed', 'freeQuotaTotal'],
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
		required: ['modelStats', 'characterStats', 'characterStatsTotal', 'dialogueStyleStats', 'dialogueStyleStatsTotal'],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		hours: { type: 'integer', minimum: 1, maximum: 2160, default: 720 },
		characterStatsOffset: { type: 'integer', minimum: 0, default: 0 },
		characterStatsLimit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		dialogueStyleStatsOffset: { type: 'integer', minimum: 0, default: 0 },
		dialogueStyleStatsLimit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		@Inject(DI.agentUserModelsRepository)
		private agentUserModelsRepository: AgentUserModelsRepository,

		private agentService: AgentService,
		private agentImageService: AgentImageService,
		private agentModelUsageService: AgentModelUsageService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();

			const since = new Date(Date.now() - (ps.hours ?? 720) * 60 * 60 * 1000);
			const characterStatsOffset = ps.characterStatsOffset ?? 0;
			const characterStatsLimit = ps.characterStatsLimit ?? 10;
			const dialogueStyleStatsOffset = ps.dialogueStyleStatsOffset ?? 0;
			const dialogueStyleStatsLimit = ps.dialogueStyleStatsLimit ?? 10;

			const [modelStatsRaw, freeQuotaMap, characterStatsRaw, characterStatsTotal, dialogueStyleStatsRaw, dialogueStyleStatsTotal, instanceMeta, userModels] = await Promise.all([
				this.agentModelUsageService.aggregateByModel({ userId: ps.userId, since }),
				this.agentModelUsageService.countFreeQuotaByModel({ userId: ps.userId, since }),
				this.agentModelUsageService.aggregateByCharacter({ userId: ps.userId, since, limit: characterStatsLimit, offset: characterStatsOffset }),
				this.agentModelUsageService.countDistinctCharacters({ userId: ps.userId, since }),
				this.agentModelUsageService.aggregateByDialogueStyle({ userId: ps.userId, since, limit: dialogueStyleStatsLimit, offset: dialogueStyleStatsOffset }),
				this.agentModelUsageService.countDistinctDialogueStyles({ userId: ps.userId, since }),
				this.metaService.fetch(true),
				this.agentUserModelsRepository.find({ where: { userId: ps.userId } }),
			]);

			const llmModels = getEffectiveLlmModels(instanceMeta);
			const imageModels = this.agentImageService.listAvailableImageModels(instanceMeta, true);
			const modelNameMap = new Map<string, string>([
				...llmModels.map(m => [m.id, m.name] as const),
				...imageModels.map(m => [m.id, m.name] as const),
				...(instanceMeta.agentVisionModels ?? []).map(m => [m.id, m.name] as const),
				...userModels.map(m => [m.id, m.name] as const),
			]);
			const quotaMap = new Map<string, number>();
			for (const model of llmModels) {
				if (model.dailyFreeQuota && model.dailyFreeQuota > 0) quotaMap.set(model.id, model.dailyFreeQuota);
			}
			for (const model of imageModels) {
				const dailyFreeQuota = (model as { dailyFreeQuota?: unknown }).dailyFreeQuota;
				if (typeof dailyFreeQuota === 'number' && dailyFreeQuota > 0) quotaMap.set(model.id, Math.trunc(dailyFreeQuota));
			}

			const characterIds = characterStatsRaw.map(row => row.characterId);
			const dialogueStyleIds = dialogueStyleStatsRaw.map(row => row.dialogueStyleId);
			const [characterRows, dialogueStyleRows] = await Promise.all([
				characterIds.length > 0
					? this.agentCharactersRepository.find({ where: { id: In(characterIds) }, select: ['id', 'name'] })
					: Promise.resolve([]),
				dialogueStyleIds.length > 0
					? this.agentDialogueStylesRepository.find({ where: { id: In(dialogueStyleIds) }, select: ['id', 'name'] })
					: Promise.resolve([]),
			]);
			const characterNameMap = new Map(characterRows.map(row => [row.id, row.name]));
			const dialogueStyleNameMap = new Map(dialogueStyleRows.map(row => [row.id, row.name]));

			const modelSourceOf = (modelId: string | null): 'official' | 'user' | null => {
				if (!modelId) return null;
				if (userModels.some(model => model.id === modelId) || modelId.startsWith('u')) return 'user';
				return modelNameMap.has(modelId) ? 'official' : null;
			};
			const resolveModelName = (modelId: string | null): string | null => {
				if (!modelId) return null;
				return modelNameMap.get(modelId) ?? (modelId.startsWith('u') ? '自定义模型' : null);
			};

			return {
				modelStats: modelStatsRaw.map(row => ({
					modelId: row.modelId,
					modelName: resolveModelName(row.modelId),
					modelSource: modelSourceOf(row.modelId),
					total: row.total,
					success: row.success,
					failed: row.failed,
					aborted: row.aborted,
					totalCost: row.totalCost,
					freeQuotaUsed: row.modelId ? (freeQuotaMap.get(row.modelId) ?? 0) : 0,
					freeQuotaTotal: row.modelId ? (quotaMap.get(row.modelId) ?? 0) : 0,
				})).sort((a, b) => b.total - a.total),
				characterStats: characterStatsRaw.map(row => ({
					characterId: row.characterId,
					characterName: characterNameMap.get(row.characterId) ?? null,
					total: row.total,
				})),
				characterStatsTotal,
				dialogueStyleStats: dialogueStyleStatsRaw.map(row => ({
					dialogueStyleId: row.dialogueStyleId,
					dialogueStyleName: dialogueStyleNameMap.get(row.dialogueStyleId) ?? null,
					total: row.total,
				})),
				dialogueStyleStatsTotal,
			};
		});
	}
}
