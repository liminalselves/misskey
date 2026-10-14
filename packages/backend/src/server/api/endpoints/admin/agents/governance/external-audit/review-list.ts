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

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: { type: 'array', optional: false, nullable: false, items: { type: 'object', additionalProperties: true } },
} as const;

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
			const rules = (metaEntity.agentReviewTriggerRules ?? []).filter(r => r.enabled);
			if (rules.length === 0) return [];

			const filterUserId = await resolveUserIdFromAcctOrId(this.usersRepository, ps.userId);
			const maxWindow = Math.max(...rules.map(r => r.timeWindowMinutes));
			const windowStart = new Date(Date.now() - maxWindow * 60 * 1000);

			// 每条规则按自己的时间窗独立计数（聚合用最大窗口仅用于排序分页，不能套用到小窗口规则上）
			const ruleCounts = new Map<string, Map<string, number>>();
			for (const rule of rules) {
				const ruleStart = new Date(Date.now() - rule.timeWindowMinutes * 60 * 1000);
				const qb = this.agentExternalAuditLogsRepository
					.createQueryBuilder('log')
					.select('log.userId', 'userId')
					.addSelect('COUNT(*)', 'blockCount')
					.where('log.status = :status', { status: 'block' })
					.andWhere('log.createdAt > :ruleStart', { ruleStart })
					.andWhere('log.userId IS NOT NULL')
					.andWhere('log.reviewIgnoredAt IS NULL')
					.groupBy('log.userId');
				if (filterUserId) qb.andWhere('log.userId = :filterUserId', { filterUserId });
				const rows = await qb.getRawMany<{ userId: string; blockCount: string }>();
				ruleCounts.set(rule.id, new Map(rows.map(r => [r.userId, parseInt(r.blockCount, 10) || 0])));
			}
			const ruleCountFor = (ruleId: string, userId: string): number => ruleCounts.get(ruleId)?.get(userId) ?? 0;

			// 满足任一复审规则阈值即进入候选（先取全量候选集，再做资格过滤与分页，保证分页不因过滤而缩水跳页）
			const qualifiedUserIds = new Set<string>();
			for (const rule of rules) {
				const counts = ruleCounts.get(rule.id);
				if (counts == null) continue;
				for (const [userId, count] of counts) {
					if (count >= rule.blockThreshold) qualifiedUserIds.add(userId);
				}
			}
			if (qualifiedUserIds.size === 0) return [];

			// 资格条件（未封禁、仍有未处理完的涉事会话）下推到 SQL，再按 blockCount / latestBlockAt / userId 排序分页
			const pageQb = this.agentExternalAuditLogsRepository
				.createQueryBuilder('log')
				.select('log.userId', 'userId')
				.addSelect('COUNT(*)', 'blockCount')
				.addSelect('MAX(log.createdAt)', 'latestBlockAt')
				.where('log.status = :status', { status: 'block' })
				.andWhere('log.createdAt > :windowStart', { windowStart })
				.andWhere('log.userId IS NOT NULL')
				.andWhere('log.reviewIgnoredAt IS NULL')
				.andWhere('log.userId IN (:...qualifiedUserIds)', { qualifiedUserIds: [...qualifiedUserIds] })
				// 已封禁用户无需再处置
				.andWhere('NOT EXISTS (SELECT 1 FROM "user" "su" WHERE "su"."id" = "log"."userId" AND "su"."isSuspended" = true)')
				// 所有涉事会话均已被封禁的用户视为已处理完毕，不再显示
				.andWhere(`EXISTS (
					SELECT 1 FROM "agent_external_audit_log" "l2"
					LEFT JOIN "agent_session" "s2" ON "s2"."id" = "l2"."sessionId"
					WHERE "l2"."userId" = "log"."userId"
						AND "l2"."status" = :status
						AND "l2"."createdAt" > :windowStart
						AND "l2"."reviewIgnoredAt" IS NULL
						AND COALESCE("s2"."moderationBanned", false) = false
				)`)
				.groupBy('log.userId')
				.orderBy('"blockCount"', 'DESC')
				.addOrderBy('"latestBlockAt"', 'DESC')
				.addOrderBy('"userId"', 'ASC')
				.offset(ps.offset ?? 0)
				.limit(ps.limit ?? 20);

			const userStats = await pageQb.getRawMany<{ userId: string; blockCount: string; latestBlockAt: Date | string }>();
			if (userStats.length === 0) return [];

			// 仅对当前页用户取明细，去掉旧的全局 take(500)（跨用户截断会让靠后的用户被静默丢弃）
			const pageUserIds = userStats.map(s => s.userId);
			const users = await this.usersRepository.findBy({ id: In(pageUserIds) });
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));

			const profiles = await this.userProfilesRepository.findBy({ userId: In(pageUserIds) });
			const profileById = new Map(profiles.map(p => [p.userId, p]));

			const allLogs = await this.agentExternalAuditLogsRepository
				.createQueryBuilder('log')
				.leftJoinAndSelect('log.session', 'session')
				.leftJoinAndSelect('log.character', 'character')
				.where('log.status = :status', { status: 'block' })
				.andWhere('log.createdAt > :windowStart', { windowStart })
				.andWhere('log.userId IN (:...pageUserIds)', { pageUserIds })
				.andWhere('log.reviewIgnoredAt IS NULL')
				.orderBy('log.createdAt', 'DESC')
				.addOrderBy('log.id', 'DESC')
				.getMany();

			// 按用户分组
			const logsByUser = new Map<string, typeof allLogs>();
			for (const log of allLogs) {
				if (!log.userId) continue;
				const existing = logsByUser.get(log.userId) ?? [];
				existing.push(log);
				logsByUser.set(log.userId, existing);
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
				const userLogs = logsByUser.get(userId) ?? [];
				const matchedRules = rules.filter(rule => ruleCountFor(rule.id, userId) >= rule.blockThreshold);

				return {
					userId,
					user: userById.get(userId) ?? null,
					isSuspended: user?.isSuspended ?? false,
					suspendedUntil: user?.suspendedUntil?.toISOString() ?? null,
					moderationNote: profile?.moderationNote ?? null,
					blockCount: parseInt(stat.blockCount, 10),
					latestBlockAt: (stat.latestBlockAt as Date)?.toISOString?.() ?? null,
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
