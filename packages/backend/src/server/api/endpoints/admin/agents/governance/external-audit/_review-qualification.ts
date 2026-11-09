/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets } from 'typeorm';
import type { SelectQueryBuilder } from 'typeorm';
import type { AgentExternalAuditLogsRepository } from '@/models/_.js';
import type { MiAgentReviewTriggerRule } from '@/models/Meta.js';

export type ReviewGroupRow = {
	userId: string;
	sessionId: string | null;
	blockCount: string;
	latestBlockAt: Date | string;
	reviewUntilId: string;
};

export function enabledReviewRules(rules: MiAgentReviewTriggerRule[] | null | undefined): MiAgentReviewTriggerRule[] {
	return (rules ?? []).filter(r => r.enabled !== false);
}

/**
 * 一条规则下自身达标的「用户 + 会话」组，供外层 EXISTS 匹配。
 * 窗口峰值在任一历史时刻达到阈值即保留，不随时间流逝消失。
 */
function qualifiedGroupsQuery(
	repository: AgentExternalAuditLogsRepository,
	rule: MiAgentReviewTriggerRule,
	filterUserId: string | null,
	index: number,
) {
	// 各规则的子查询共享外层参数表，参数名必须按规则区分
	const windowParam = `rule${index}WindowMinutes`;
	const thresholdParam = `rule${index}BlockThreshold`;
	const userParam = `rule${index}FilterUserId`;
	const windows = repository
		.createQueryBuilder('log')
		.select('log.userId', 'userId')
		.addSelect('log.sessionId', 'sessionId')
		.addSelect(`COUNT(*) OVER (PARTITION BY "log"."userId", "log"."sessionId" ORDER BY "log"."createdAt"
			RANGE BETWEEN (:${windowParam} * INTERVAL '1 minute') PRECEDING AND CURRENT ROW)`, 'blockCount')
		.where('log.status = :status', { status: 'block' })
		.andWhere('log.userId IS NOT NULL')
		.andWhere('log.reviewIgnoredAt IS NULL')
		.setParameter(windowParam, rule.timeWindowMinutes);
	if (filterUserId) windows.andWhere(`log.userId = :${userParam}`, { [userParam]: filterUserId });

	const peaks = repository.manager.createQueryBuilder()
		.select('"windows"."userId"', 'userId')
		.addSelect('"windows"."sessionId"', 'sessionId')
		.addSelect('MAX("windows"."blockCount")', 'blockCount')
		.from(`(${windows.getQuery()})`, 'windows')
		.setParameters(windows.getParameters())
		.groupBy('"windows"."userId"')
		.addGroupBy('"windows"."sessionId"');

	return repository.manager.createQueryBuilder()
		.select('"peaks"."userId"', 'userId')
		.addSelect('"peaks"."sessionId"', 'sessionId')
		.from(`(${peaks.getQuery()})`, 'peaks')
		.setParameters(peaks.getParameters())
		.where(`"peaks"."blockCount" >= :${thresholdParam}`, { [thresholdParam]: rule.blockThreshold })
		// 无会话（sessionId 为 NULL）的组也必须可匹配，IN 对 NULL 永不成立
		.andWhere('"peaks"."userId" = "log"."userId" AND "peaks"."sessionId" IS NOT DISTINCT FROM "log"."sessionId"');
}

/** 待复审的「用户 + 会话」组；列表与徽标计数共用，保证口径一致 */
export function pendingReviewGroupsQuery(
	repository: AgentExternalAuditLogsRepository,
	rules: MiAgentReviewTriggerRule[],
	filterUserId: string | null,
): SelectQueryBuilder<any> {
	const evidence = repository
		.createQueryBuilder('log')
		.select('log.userId', 'userId')
		.addSelect('log.sessionId', 'sessionId')
		.addSelect('COUNT(*)', 'blockCount')
		.addSelect('MAX(log.createdAt)', 'latestBlockAt')
		// 操作上界：之后新到的记录保持待复审
		.addSelect('MAX(log.id)', 'reviewUntilId')
		.where('log.status = :status', { status: 'block' })
		.andWhere('log.userId IS NOT NULL')
		.andWhere('log.reviewIgnoredAt IS NULL')
		.groupBy('log.userId')
		.addGroupBy('log.sessionId');
	if (filterUserId) evidence.andWhere('log.userId = :filterUserId', { filterUserId });

	// 子查询是拼进外层 SQL 的，参数必须显式合并到外层
	const keyQueries = rules.map((rule, index) => qualifiedGroupsQuery(repository, rule, filterUserId, index));
	const match = new Brackets(qb => {
		for (const keys of keyQueries) {
			qb.orWhere('EXISTS (' + keys.getQuery() + ')');
		}
	});
	const result = evidence.andWhere(match);
	for (const keys of keyQueries) result.setParameters(keys.getParameters());
	return result;
}

export async function pendingReviewGroups(
	repository: AgentExternalAuditLogsRepository,
	rules: MiAgentReviewTriggerRule[],
	filterUserId: string | null,
	offset: number,
	limit: number,
): Promise<ReviewGroupRow[]> {
	return pendingReviewGroupsQuery(repository, rules, filterUserId)
		.orderBy('"blockCount"', 'DESC')
		.addOrderBy('"latestBlockAt"', 'DESC')
		.addOrderBy('"userId"', 'ASC')
		.addOrderBy('"sessionId"', 'ASC', 'NULLS LAST')
		.offset(offset)
		.limit(limit)
		.getRawMany<ReviewGroupRow>();
}

/** Number of user+session groups currently awaiting an external-audit review. */
export async function countPendingReviewSessions(
	repository: AgentExternalAuditLogsRepository,
	rules: MiAgentReviewTriggerRule[] | null | undefined,
): Promise<number> {
	const enabled = enabledReviewRules(rules);
	if (enabled.length === 0) return 0;
	const groups = pendingReviewGroupsQuery(repository, enabled, null);
	const row = await repository.manager.createQueryBuilder()
		.select('COUNT(*)', 'count')
		.from(`(${groups.getQuery()})`, 'groups')
		.setParameters(groups.getParameters())
		.getRawOne<{ count: string }>();
	return parseInt(row?.count ?? '0', 10) || 0;
}
