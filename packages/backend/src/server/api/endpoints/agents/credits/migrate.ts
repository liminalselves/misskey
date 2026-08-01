/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import crypto from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AgentCreditMigrationsRepository, AgentModelUsageLogsRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { MiAgentCreditMigration } from '@/models/AgentCreditMigration.js';
import { MiAgentModelUsageLog } from '@/models/AgentModelUsageLog.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { IdService } from '@/core/IdService.js';
import { MetaService } from '@/core/MetaService.js';
import { NotificationService } from '@/core/NotificationService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:meta',
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			migrationId: { type: 'string' },
			targetUserId: { type: 'string' },
			amount: { type: 'number' },
			newBalance: { type: 'number' },
		},
	},
	errors: {
		invalidKey: {
			message: 'Invalid or missing system authorization key.',
			code: 'INVALID_SYSTEM_KEY',
			id: 'c4d5e6f7-a8b9-4c0d-ae1f-2b3c4d5e6f7a',
			httpStatusCode: 403,
		},
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'd5e6f7a8-b9c0-4d1e-af2b-3c4d5e6f7a8b',
		},
		invalidAmount: {
			message: 'Amount must be a positive finite number.',
			code: 'INVALID_AMOUNT',
			id: 'e6f7a8b9-c0d1-4e2f-a03b-4c5d6e7f8a9b',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		amount: { type: 'number', minimum: 0.01, maximum: 100000 },
		targetUserId: { type: 'string', format: 'misskey:id' },
		systemKey: { type: 'string', minLength: 1, maxLength: 256 },
		requestId: { type: 'string', maxLength: 128, nullable: true },
		sourceInfo: { type: 'string', maxLength: 512, nullable: true },
	},
	required: ['amount', 'targetUserId', 'systemKey'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.agentModelUsageLogsRepository)
		private agentModelUsageLogsRepository: AgentModelUsageLogsRepository,

		@Inject(DI.agentCreditMigrationsRepository)
		private agentCreditMigrationsRepository: AgentCreditMigrationsRepository,

		private agentService: AgentService,
		private idService: IdService,
		private metaService: MetaService,
		private notificationService: NotificationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();

			// 1. 校验系统授权 Key
			const instanceMeta = await this.metaService.fetch(true);
			const storedHash = instanceMeta.agentMigrationKeyHash;
			if (!storedHash) {
				throw new ApiError(meta.errors.invalidKey);
			}
			const providedHash = crypto.createHash('sha256').update(ps.systemKey).digest('hex');
			if (providedHash !== storedHash) {
				throw new ApiError(meta.errors.invalidKey);
			}

			// 2. 幂等校验
			if (ps.requestId) {
				const existing = await this.agentCreditMigrationsRepository.findOneBy({ requestId: ps.requestId });
				if (existing) {
					const profile = await this.userProfilesRepository.findOneBy({ userId: existing.targetUserId });
					return {
						migrationId: existing.id,
						targetUserId: existing.targetUserId,
						amount: existing.amount,
						newBalance: profile?.agentCreditBalance ?? 0,
					};
				}
			}

			// 3. 校验目标用户
			const targetUser = await this.usersRepository.findOneBy({ id: ps.targetUserId });
			if (!targetUser) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			// 4. 校验金额
			const amount = Math.round(ps.amount * 100) / 100;
			if (!Number.isFinite(amount) || amount <= 0) {
				throw new ApiError(meta.errors.invalidAmount);
			}

			const now = new Date();
			const migrationId = this.idService.gen();
			const usageLogId = this.idService.gen();

			// 5–7. 事务内执行：先插入迁移日志（唯一索引作幂等占位），再余额入账 + usage log
			try {
				await this.db.transaction(async transactionalEntityManager => {
					// 先插入迁移日志，requestId 唯一索引冲突即回滚
					await transactionalEntityManager.insert(MiAgentCreditMigration, {
						id: migrationId,
						createdAt: now,
						targetUserId: ps.targetUserId,
						amount,
						requestId: ps.requestId ?? null,
						sourceInfo: ps.sourceInfo ?? null,
						operatorId: me.id,
						status: 'success',
						failReason: null,
					});

					// 余额入账
					await transactionalEntityManager.increment(MiUserProfile, { userId: ps.targetUserId }, 'agentCreditBalance', amount);

					// 写入 usage log
					await transactionalEntityManager.insert(MiAgentModelUsageLog, {
						id: usageLogId,
						requestedAt: now,
						completedAt: now,
						durationMs: 0,
						userId: ps.targetUserId,
						sessionId: null,
						characterId: null,
						dialogueStyleId: null,
						modelId: null,
						modelApiName: null,
						usageKind: 'credit_migration',
						status: 'success',
						errorCode: ps.sourceInfo ?? null,
						cost: -amount,
						promptTokens: null,
						completionTokens: null,
					});
				});
			} catch (err: any) {
				// 唯一索引冲突 → 幂等返回
				if (err?.code === '23505' && ps.requestId) {
					const existing = await this.agentCreditMigrationsRepository.findOneBy({ requestId: ps.requestId });
					if (existing) {
						const profile = await this.userProfilesRepository.findOneBy({ userId: existing.targetUserId });
						return {
							migrationId: existing.id,
							targetUserId: existing.targetUserId,
							amount: existing.amount,
							newBalance: profile?.agentCreditBalance ?? 0,
						};
					}
				}
				throw err;
			}

			// 8. 发送通知
			const instance = await this.metaService.fetch(true);
			this.notificationService.createNotification(ps.targetUserId, 'app', {
				appAccessTokenId: null,
				customBody: ps.sourceInfo
					? `你收到了 ${amount.toFixed(2)} 额度迁移入账：${ps.sourceInfo}`
					: `你收到了 ${amount.toFixed(2)} 额度迁移入账`,
				customHeader: '额度迁移',
				customIcon: instance.iconUrl ?? instance.logoImageUrl ?? null,
			});

			// 9. 查询新余额
			const profile = await this.userProfilesRepository.findOneBy({ userId: ps.targetUserId });
			const newBalance = profile?.agentCreditBalance ?? amount;

			return { migrationId, targetUserId: ps.targetUserId, amount, newBalance };
		});
	}
}
