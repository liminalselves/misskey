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

			// 按用户聚合：统计每个用户在时间窗口内的 block 记录数和最新记录（排除已忽略的）
			const userStatsQb = this.agentExternalAuditLogsRepository
				.createQueryBuilder('log')
				.select('log.userId', 'userId')
				.addSelect('COUNT(*)', 'blockCount')
				.addSelect('MAX(log.createdAt)', 'latestBlockAt')
				.where('log.status = :status', { status: 'block' })
				.andWhere('log.createdAt > :windowStart', { windowStart })
				.andWhere('log.userId IS NOT NULL')
				.andWhere('log.reviewIgnoredAt IS NULL')
				.groupBy('log.userId')
				.orderBy('"blockCount"', 'DESC')
				.addOrderBy('"latestBlockAt"', 'DESC');

			if (filterUserId) userStatsQb.andWhere('log.userId = :filterUserId', { filterUserId });

			const userStats = await userStatsQb
				.offset(ps.offset ?? 0)
				.limit(ps.limit ?? 20)
				.getRawMany();

			if (userStats.length === 0) return [];

			// 过滤出满足任一复审规则的用户
			const qualifiedUserIds = userStats
				.filter(stat => rules.some(rule => parseInt(stat.blockCount, 10) >= rule.blockThreshold))
				.map(stat => stat.userId as string);

			if (qualifiedUserIds.length === 0) return [];

			// 获取用户信息
			const users = await this.usersRepository.findBy({ id: In(qualifiedUserIds) });
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));

			// 过滤掉已被封禁的用户
			const activeUserIds = qualifiedUserIds.filter(id => {
				const user = users.find(u => u.id === id);
				return user && !user.isSuspended;
			});
			if (activeUserIds.length === 0) return [];

			// 获取用户封禁状态和管理笔记
			const profiles = await this.userProfilesRepository.findBy({ userId: In(qualifiedUserIds) });
			const profileById = new Map(profiles.map(p => [p.userId, p]));

			// 获取每个用户的违规记录详情（时间窗口内所有未忽略的 block 记录）
			const allLogs = await this.agentExternalAuditLogsRepository
				.createQueryBuilder('log')
				.leftJoinAndSelect('log.session', 'session')
				.leftJoinAndSelect('log.character', 'character')
				.where('log.status = :status', { status: 'block' })
				.andWhere('log.createdAt > :windowStart', { windowStart })
				.andWhere('log.userId IN (:...activeUserIds)', { activeUserIds })
				.andWhere('log.reviewIgnoredAt IS NULL')
				.orderBy('log.createdAt', 'DESC')
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

			// 过滤掉所有会话均已被封禁的用户（已处理完毕的不再显示）
			const pendingUserIds = activeUserIds.filter(userId => {
				const userLogs = logsByUser.get(userId) ?? [];
				// 没有任何未忽略的日志则不显示
				return userLogs.length > 0;
			});

			return pendingUserIds.map(userId => {
				const stat = userStats.find(s => s.userId === userId)!;
				const user = users.find(u => u.id === userId);
				const profile = profileById.get(userId);
				const userLogs = logsByUser.get(userId) ?? [];
				const matchedRules = rules.filter(rule => parseInt(stat.blockCount, 10) >= rule.blockThreshold);

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
