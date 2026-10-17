/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { AgentModelUsageLogsRepository, AgentRedeemCodesRepository, AgentUserModelsRepository } from '@/models/_.js';
import type { MetaService } from '@/core/MetaService.js';
import type { AgentVisionService } from '@/core/AgentVisionService.js';
import { packPublicAgentModels } from '@/misc/agent-llm-models.js';

/**
 * 用户 / 管理端消费日志共用分页实现（agents/billing-logs 与 admin/users/agent-billing-logs）。
 *
 * 用量与兑换两类流水在 SQL 内 UNION 合并后统一排序分页：深分页时只取当前页行，
 * 不再各自预取 offset+pageSize+1 条后在内存归并；计数与列表使用完全相同的过滤条件。
 */
export type BillingItem = {
	id: string;
	kind: 'usage' | 'redeem';
	createdAt: string;
	amount: number;
	modelName: string | null;
	usageKind: 'chat' | 'compression' | 'image_generation' | 'vision' | 'sticker_description' | 'proactive_random' | 'proactive_scheduled' | 'checkin' | 'admin_reward' | 'admin_compensation' | 'credit_migration' | null;
	status: string | null;
	durationMs: number | null;
	redeemCode: string | null;
	usedFreeQuota: boolean | null;
	freeQuotaUsedAtCall: number | null;
	freeQuotaTotalAtCall: number | null;
};

type BillingDeps = {
	agentModelUsageLogsRepository: AgentModelUsageLogsRepository;
	agentRedeemCodesRepository: AgentRedeemCodesRepository;
	agentUserModelsRepository: AgentUserModelsRepository;
	metaService: MetaService;
	agentVisionService: AgentVisionService;
};

type BillingRow = {
	id: string;
	kind: 'usage' | 'redeem';
	ts: Date;
	cost: number | string | null;
	usageKind: BillingItem['usageKind'];
	modelId: string | null;
	modelApiName: string | null;
	errorCode: string | null;
	status: string | null;
	durationMs: number | null;
	usedFreeQuota: boolean | null;
	freeQuotaUsedAtCall: number | null;
	freeQuotaTotalAtCall: number | null;
	code: string | null;
};

export async function fetchAgentBillingPage(
	deps: BillingDeps,
	opts: {
		userId: string;
		page: number;
		pageSize: number;
		untilDate: Date | null;
	},
): Promise<{ items: BillingItem[]; hasMore: boolean; total: number }> {
	const { userId, page, pageSize } = opts;
	const offset = (page - 1) * pageSize;
	const until = opts.untilDate != null && !Number.isNaN(opts.untilDate.getTime()) ? opts.untilDate : null;

	const instanceMeta = await deps.metaService.fetch(true);
	const modelNameMap = new Map([
		...packPublicAgentModels(instanceMeta).map(m => [m.id, m.name] as const),
		...(await deps.agentVisionService.listAvailableVisionModels(instanceMeta)).map(m => [m.id, m.name] as const),
	]);

	// BYOK（自定义模型）请求不消耗平台额度，不在消费日志中展示；
	// modelId 为空的行（管理员签发 / 额度迁移等）不属于任何 BYOK 模型，须保留
	const byokModelIds = (await deps.agentUserModelsRepository.find({ where: { userId }, select: ['id'] })).map(m => m.id);

	// 基础参数（userId / byok / until）为列表与两个计数共用；分页参数仅列表使用
	const baseParams: unknown[] = [];
	const p = (value: unknown): string => {
		baseParams.push(value);
		return `$${baseParams.length}`;
	};
	const userIdP = p(userId);
	let usageWhere = `"userId" = ${userIdP}`;
	let redeemWhere = `"redeemedById" = ${userIdP} AND "redeemedAt" IS NOT NULL`;
	if (byokModelIds.length > 0) {
		const byokList = byokModelIds.map(id => p(id)).join(', ');
		usageWhere += ` AND ("modelId" IS NULL OR "modelId" NOT IN (${byokList}))`;
	}
	if (until != null) {
		const untilP = p(until);
		usageWhere += ` AND "requestedAt" < ${untilP}`;
		redeemWhere += ` AND "redeemedAt" < ${untilP}`;
	}

	const pageParams = [...baseParams];
	const limitP = `$${pageParams.push(pageSize + 1)}`;
	const offsetP = `$${pageParams.push(offset)}`;
	const pageSql = `
		SELECT * FROM (
			SELECT "id", 'usage' AS "kind", "requestedAt" AS "ts", "cost", "usageKind", "modelId", "modelApiName",
				"errorCode", "status", "durationMs", "usedFreeQuota", "freeQuotaUsedAtCall", "freeQuotaTotalAtCall", NULL AS "code"
			FROM "agent_model_usage_log"
			WHERE ${usageWhere}
			UNION ALL
			SELECT "id", 'redeem' AS "kind", "redeemedAt" AS "ts", "creditAmount" AS "cost", NULL AS "usageKind", NULL AS "modelId", NULL AS "modelApiName",
				NULL AS "errorCode", NULL AS "status", NULL AS "durationMs", NULL AS "usedFreeQuota", NULL AS "freeQuotaUsedAtCall", NULL AS "freeQuotaTotalAtCall", "code"
			FROM "agent_redeem_code"
			WHERE ${redeemWhere}
		) "merged"
		ORDER BY "merged"."ts" DESC, "merged"."kind" DESC, "merged"."id" DESC
		LIMIT ${limitP} OFFSET ${offsetP}`;

	const [rows, counts] = await Promise.all([
		deps.agentModelUsageLogsRepository.query<BillingRow[]>(pageSql, pageParams),
		deps.agentModelUsageLogsRepository.query<Array<{ cnt: string | number }>>(
			`SELECT COUNT(*) AS "cnt" FROM "agent_model_usage_log" WHERE ${usageWhere}
			 UNION ALL SELECT COUNT(*) AS "cnt" FROM "agent_redeem_code" WHERE ${redeemWhere}`, baseParams),
	]);

	const hasMore = rows.length > pageSize;
	const items: BillingItem[] = rows.slice(0, pageSize).map(row => row.kind === 'usage'
		? {
			id: row.id,
			kind: 'usage',
			createdAt: new Date(row.ts).toISOString(),
			amount: -(row.cost ?? 0),
			modelName: (row.usageKind === 'admin_reward' || row.usageKind === 'admin_compensation' || row.usageKind === 'credit_migration')
				? (row.errorCode ?? (row.usageKind === 'credit_migration' ? '额度迁移' : row.usageKind === 'admin_compensation' ? '管理员补偿' : '管理员签发'))
				: (row.modelId ? (modelNameMap.get(row.modelId) ?? row.modelApiName) : null),
			usageKind: row.usageKind,
			status: row.status,
			durationMs: row.durationMs,
			redeemCode: null,
			usedFreeQuota: row.usedFreeQuota ?? null,
			freeQuotaUsedAtCall: row.freeQuotaUsedAtCall ?? null,
			freeQuotaTotalAtCall: row.freeQuotaTotalAtCall ?? null,
		}
		: {
			id: row.id,
			kind: 'redeem',
			createdAt: new Date(row.ts).toISOString(),
			amount: Number(row.cost ?? 0),
			modelName: null,
			usageKind: null,
			status: null,
			durationMs: null,
			redeemCode: (row.code ?? '').slice(0, 4) + '****',
			usedFreeQuota: null,
			freeQuotaUsedAtCall: null,
			freeQuotaTotalAtCall: null,
		});

	const total = counts.reduce((sum, row) => sum + Number(row.cnt), 0);
	return { items, hasMore, total };
}
