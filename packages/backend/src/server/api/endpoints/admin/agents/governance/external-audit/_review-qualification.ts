/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets } from 'typeorm';
import type { SelectQueryBuilder } from 'typeorm';
import type { AgentExternalAuditLogsRepository } from '@/models/_.js';
import type { MiAgentReviewTriggerRule } from '@/models/Meta.js';
import { reviewRuleScope } from '@/misc/agent-review-trigger-rules.js';

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
 * 一条规则的达标键。
 * 按会话：只返回自身达标的会话组；按用户：返回达标用户，其名下全部未审阅会话组都进入复审。
 * 窗口峰值在任一历史时刻达到阈值即保留，不随时间流逝消失。
 */
function qualifiedKeysQuery(
	repository: AgentExternalAuditLogsRepository,
	rule: MiAgentReviewTriggerRule,
	filterUserId: string | null,
	index: number,
) {
	const scope = reviewRuleScope(rule);
	// 各规则的子查询共享外层参数表，参数名必须按规则区分
	const windowParam = `rule${index}WindowMinutes`;
	const thresholdParam = `rule${index}BlockThreshold`;
	const userParam = `rule${index}FilterUserId`;
	const windows = repository
		.createQueryBuilder('log')
		.select('log.userId', 'userId')
		.addSelect('log.sessionId', 'sessionId')
		.addSelect(`COUNT(*) OVER (PARTITION BY ${scope === 'session' ? '"log"."userId", "log"."sessionId"' : '"log"."userId"'} ORDER BY "log"."createdAt"
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

	// 按会话：只有达标的组留下。按用户：一行代表整个用户，sessionId 不参与匹配
	const query = repository.manager.createQueryBuilder()
		.select('"peaks"."userId"', 'userId')
		.addSelect(scope === 'session' ? '"peaks"."sessionId"' : 'NULL', 'sessionId')
		.from(`(${peaks.getQuery()})`, 'peaks')
		.setParameters(peaks.getParameters())
		.where(`"peaks"."blockCount" >= :${thresholdParam}`, { [thresholdParam]: rule.blockThreshold });
	return scope === 'session' ? query : query.distinct(true);
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
	const keyQueries = rules.map((rule, index) => ({ rule, keys: qualifiedKeysQuery(repository, rule, filterUserId, index) }));
	const match = new Brackets(qb => {
		for (const { rule, keys } of keyQueries) {
			qb.orWhere(
				reviewRuleScope(rule) === 'session'
					? '("log"."userId", "log"."sessionId") IN (' + keys.getQuery() + ')'
					: '"log"."userId" IN (' + keys.getQuery() + ')',
			);
		}
	});
	const result = evidence.andWhere(match);
	for (const { keys } of keyQueries) result.setParameters(keys.getParameters());
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
