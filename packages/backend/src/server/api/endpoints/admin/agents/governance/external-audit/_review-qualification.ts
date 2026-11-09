/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { AgentExternalAuditLogsRepository } from '@/models/_.js';
import type { MiAgentReviewTriggerRule } from '@/models/Meta.js';

export type ReviewRuleCounts = Map<MiAgentReviewTriggerRule, Map<string, number>>;

/**
 * Peak unreviewed block count per user inside each rule's sliding window.
 * A review stays pending once any historical window reaches its threshold.
 */
export async function computeReviewRuleCounts(
	repository: AgentExternalAuditLogsRepository,
	rules: MiAgentReviewTriggerRule[],
	filterUserId: string | null,
): Promise<ReviewRuleCounts> {
	const ruleCounts: ReviewRuleCounts = new Map();
	for (const rule of rules) {
		const windows = repository
			.createQueryBuilder('log')
			.select('log.userId', 'userId')
			.addSelect(`COUNT(*) OVER (PARTITION BY "log"."userId" ORDER BY "log"."createdAt"
				RANGE BETWEEN (:timeWindowMinutes * INTERVAL '1 minute') PRECEDING AND CURRENT ROW)`, 'blockCount')
			.where('log.status = :status', { status: 'block' })
			.andWhere('log.userId IS NOT NULL')
			.andWhere('log.reviewIgnoredAt IS NULL')
			.setParameter('timeWindowMinutes', rule.timeWindowMinutes);
		if (filterUserId) windows.andWhere('log.userId = :filterUserId', { filterUserId });
		const rows = await repository.manager.createQueryBuilder()
			.select('"windows"."userId"', 'userId')
			.addSelect('MAX("windows"."blockCount")', 'blockCount')
			.from(`(${windows.getQuery()})`, 'windows')
			.setParameters(windows.getParameters())
			.groupBy('"windows"."userId"')
			.getRawMany<{ userId: string; blockCount: string }>();
		ruleCounts.set(rule, new Map(rows.map(r => [r.userId, parseInt(r.blockCount, 10) || 0])));
	}
	return ruleCounts;
}

/** Users meeting at least one rule threshold. */
export function qualifiedReviewUserIds(rules: MiAgentReviewTriggerRule[], ruleCounts: ReviewRuleCounts): Set<string> {
	const qualified = new Set<string>();
	for (const rule of rules) {
		const counts = ruleCounts.get(rule);
		if (counts == null) continue;
		for (const [userId, count] of counts) {
			if (count >= rule.blockThreshold) qualified.add(userId);
		}
	}
	return qualified;
}

export function enabledReviewRules(rules: MiAgentReviewTriggerRule[] | null | undefined): MiAgentReviewTriggerRule[] {
	return (rules ?? []).filter(r => r.enabled !== false);
}

/** Number of user+session groups currently awaiting an external-audit review (qualification is per user). */
export async function countPendingReviewSessions(
	repository: AgentExternalAuditLogsRepository,
	rules: MiAgentReviewTriggerRule[] | null | undefined,
): Promise<number> {
	const enabled = enabledReviewRules(rules);
	if (enabled.length === 0) return 0;
	const ruleCounts = await computeReviewRuleCounts(repository, enabled, null);
	const qualified = [...qualifiedReviewUserIds(enabled, ruleCounts)];
	if (qualified.length === 0) return 0;
	const row = await repository.manager.createQueryBuilder()
		.select('COUNT(*)', 'count')
		.from(qb => qb
			.select('log.userId', 'userId')
			.addSelect('log.sessionId', 'sessionId')
			.from(repository.target, 'log')
			.where('log.status = :status', { status: 'block' })
			.andWhere('log.reviewIgnoredAt IS NULL')
			.andWhere('log.userId IN (:...qualified)', { qualified })
			.groupBy('log.userId')
			.addGroupBy('log.sessionId'), 'groups')
		.getRawOne<{ count: string }>();
	return parseInt(row?.count ?? '0', 10) || 0;
}
