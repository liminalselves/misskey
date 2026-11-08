/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { AgentExternalAuditLogsRepository, UsersRepository, AgentSessionsRepository, UserProfilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { MetaService } from '@/core/MetaService.js';
import { resolveUserIdFromAcctOrId } from '../_utils.js';
import { computeReviewRuleCounts, enabledReviewRules, qualifiedReviewUserIds } from './_review-qualification.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: { type: 'array', optional: false, nullable: false, items: { type: 'object', additionalProperties: true } },
} as const;

const REVIEW_LOG_LIMIT = 50;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', minLength: 1, maxLength: 256, nullable: true },
		limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
		offset: { type: 'integer', minimum: 0, default: 0 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentExternalAuditLogsRepository)
		private agentExternalAuditLogsRepository: AgentExternalAuditLogsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private agentService: AgentService,
		private userEntityService: UserEntityService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const metaEntity = await this.metaService.fetch();
			const rules = enabledReviewRules(metaEntity.agentReviewTriggerRules);
			if (rules.length === 0) return [];

			const filterUserId = await resolveUserIdFromAcctOrId(this.usersRepository, ps.userId);

			const ruleCounts = await computeReviewRuleCounts(this.agentExternalAuditLogsRepository, rules, filterUserId);
			const ruleCountFor = (rule: typeof rules[number], userId: string): number => ruleCounts.get(rule)?.get(userId) ?? 0;

			// 满足任一复审规则阈值即进入候选（先取全量候选集，再做资格过滤与分页，保证分页不因过滤而缩水跳页）
			const qualifiedUserIds = qualifiedReviewUserIds(rules, ruleCounts);
			if (qualifiedUserIds.size === 0) return [];

			// Only an explicit review action resolves evidence; bans alone must not hide pending reviews.
			const pageQb = this.agentExternalAuditLogsRepository
				.createQueryBuilder('log')
				.select('log.userId', 'userId')
				.addSelect('log.sessionId', 'sessionId')
				.addSelect('COUNT(*)', 'blockCount')
				.addSelect('MAX(log.createdAt)', 'latestBlockAt')
				// Upper bound of the counted evidence; ignore uses it so later arrivals stay pending.
				.addSelect('MAX(log.id)', 'reviewUntilId')
				.where('log.status = :status', { status: 'block' })
				.andWhere('log.userId IS NOT NULL')
				.andWhere('log.reviewIgnoredAt IS NULL')
				.andWhere('log.userId IN (:...qualifiedUserIds)', { qualifiedUserIds: [...qualifiedUserIds] })
				// 复审以「用户 + 会话」为一组；资格仍按用户判定，组内只统计该会话的证据
				.groupBy('log.userId')
				.addGroupBy('log.sessionId')
				.orderBy('"blockCount"', 'DESC')
				.addOrderBy('"latestBlockAt"', 'DESC')
				.addOrderBy('"userId"', 'ASC')
				.addOrderBy('"sessionId"', 'ASC', 'NULLS LAST')
				.offset(ps.offset ?? 0)
				.limit(ps.limit ?? 20);

			const userStats = await pageQb.getRawMany<{ userId: string; sessionId: string | null; blockCount: string; latestBlockAt: Date | string; reviewUntilId: string }>();
			if (userStats.length === 0) return [];

			// 仅对当前页用户取明细，去掉旧的全局 take(500)（跨用户截断会让靠后的用户被静默丢弃）
			const pageUserIds = [...new Set(userStats.map(s => s.userId))];
			const pageSessionIds = [...new Set(userStats.map(s => s.sessionId).filter((id): id is string => id != null))];
			const hasNullSession = userStats.some(s => s.sessionId == null);
			const sessionCondition = [
				...(pageSessionIds.length > 0 ? ['"l"."sessionId" IN (:...pageSessionIds)'] : []),
				...(hasNullSession ? ['"l"."sessionId" IS NULL'] : []),
			].join(' OR ');
			// 同时处置用户时清的是该用户全部会话的证据，需要用户级上界（组级上界只覆盖本会话）
			const userBounds = await this.agentExternalAuditLogsRepository
				.createQueryBuilder('log')
				.select('log.userId', 'userId')
				.addSelect('MAX(log.id)', 'userReviewUntilId')
				.where('log.status = :status', { status: 'block' })
				.andWhere('log.reviewIgnoredAt IS NULL')
				.andWhere('log.userId IN (:...pageUserIds)', { pageUserIds })
				.groupBy('log.userId')
				.getRawMany<{ userId: string; userReviewUntilId: string }>();
			const userBoundById = new Map(userBounds.map(b => [b.userId, b.userReviewUntilId]));

			const users = await this.usersRepository.findBy({ id: In(pageUserIds) });
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));

			const profiles = await this.userProfilesRepository.findBy({ userId: In(pageUserIds) });
			const profileById = new Map(profiles.map(p => [p.userId, p]));

			// Evidence no longer expires, so cap the text-heavy detail rows per user+session group in one scan; blockCount keeps the total.
			const allLogs = await this.agentExternalAuditLogsRepository
				.createQueryBuilder('log')
				.leftJoinAndSelect('log.session', 'session')
				.leftJoinAndSelect('log.character', 'character')
				.where(`log.id IN (
					SELECT "ranked"."id" FROM (
						SELECT "l"."id", ROW_NUMBER() OVER (PARTITION BY "l"."userId", "l"."sessionId" ORDER BY "l"."createdAt" DESC, "l"."id" DESC) AS "rank"
						FROM "agent_external_audit_log" "l"
						WHERE "l"."status" = :status AND "l"."reviewIgnoredAt" IS NULL AND "l"."userId" IN (:...pageUserIds) AND (${sessionCondition})
					) "ranked"
					WHERE "ranked"."rank" <= :reviewLogLimit
				)`, { status: 'block', pageUserIds, pageSessionIds, reviewLogLimit: REVIEW_LOG_LIMIT })
				.orderBy('log.createdAt', 'DESC')
				.addOrderBy('log.id', 'DESC')
				.getMany();

			const groupKey = (userId: string, sessionId: string | null): string => `${userId}:${sessionId ?? ''}`;
			const logsByGroup = new Map<string, typeof allLogs>();
			for (const log of allLogs) {
				if (!log.userId) continue;
				const key = groupKey(log.userId, log.sessionId);
				const existing = logsByGroup.get(key) ?? [];
				existing.push(log);
				logsByGroup.set(key, existing);
			}

			// 获取涉及的会话的封禁状态
			const sessionIds = [...new Set(allLogs.map(l => l.sessionId).filter((id): id is string => id != null))];
			const sessions = sessionIds.length > 0
				? await this.agentSessionsRepository.findBy({ id: In(sessionIds) })
				: [];
			const sessionBanMap = new Map(sessions.map(s => [s.id, s.moderationBanned]));

			return userStats.map(stat => {
				const userId = stat.userId;
				const user = users.find(u => u.id === userId);
				const profile = profileById.get(userId);
				const userLogs = logsByGroup.get(groupKey(userId, stat.sessionId)) ?? [];
				const sessionName = userLogs.find(l => l.session?.name)?.session?.name ?? null;
				const matchedRules = rules.filter(rule => ruleCountFor(rule, userId) >= rule.blockThreshold);

				return {
					userId,
					sessionId: stat.sessionId,
					sessionName,
					sessionModerationBanned: stat.sessionId ? sessionBanMap.get(stat.sessionId) ?? false : false,
					user: userById.get(userId) ?? null,
					isSuspended: user?.isSuspended ?? false,
					suspendedUntil: user?.suspendedUntil?.toISOString() ?? null,
					moderationNote: profile?.moderationNote ?? null,
					blockCount: parseInt(stat.blockCount, 10),
					latestBlockAt: (stat.latestBlockAt as Date)?.toISOString?.() ?? null,
					reviewUntilId: stat.reviewUntilId,
					userReviewUntilId: userBoundById.get(userId) ?? stat.reviewUntilId,
					triggeredRules: matchedRules.map(r => ({
						id: r.id,
						timeWindowMinutes: r.timeWindowMinutes,
						blockThreshold: r.blockThreshold,
					})),
					logs: userLogs.map(l => ({
						id: l.id,
						createdAt: l.createdAt.toISOString(),
						sessionId: l.sessionId,
						sessionName: l.session?.name ?? null,
						sessionModerationBanned: l.sessionId ? sessionBanMap.get(l.sessionId) ?? false : false,
						characterName: l.character?.name ?? '',
						blockCode: l.blockCode,
						category: l.category,
						reason: l.reason,
						userText: l.userText,
						assistantText: l.assistantText,
					})),
				};
			});
		});
	}
}
