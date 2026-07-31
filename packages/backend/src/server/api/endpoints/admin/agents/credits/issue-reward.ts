/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentModelUsageLogsRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { IdService } from '@/core/IdService.js';
import { MetaService } from '@/core/MetaService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { resolveUserIdFromAcctOrId } from '../governance/_utils.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'write:admin',
	limit: { duration: ms('1hour'), max: 60 },
	res: { type: 'object', optional: false, nullable: false, additionalProperties: true },
	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'f3a1b2c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c',
		},
		invalidAmount: {
			message: 'Amount must be a positive finite number.',
			code: 'INVALID_AMOUNT',
			id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', minLength: 1, maxLength: 128 },
		amount: { type: 'number', minimum: 0.01, maximum: 100000 },
		reason: { type: 'string', maxLength: 200, nullable: true },
	},
	required: ['userId', 'amount'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.agentModelUsageLogsRepository)
		private agentModelUsageLogsRepository: AgentModelUsageLogsRepository,

		private agentService: AgentService,
		private idService: IdService,
		private metaService: MetaService,
		private notificationService: NotificationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();

			// 解析目标用户
			const targetUserId = await resolveUserIdFromAcctOrId(this.usersRepository, ps.userId);
			if (!targetUserId) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			// 验证用户确实存在
			const targetUser = await this.usersRepository.findOneBy({ id: targetUserId });
			if (!targetUser) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			// 校验金额
			const amount = Math.round(ps.amount * 100) / 100;
			if (!Number.isFinite(amount) || amount <= 0) {
				throw new ApiError(meta.errors.invalidAmount);
			}

			const now = new Date();
			const reason = ps.reason?.trim() || null;

			// 余额入账
			await this.userProfilesRepository.increment({ userId: targetUserId }, 'agentCreditBalance', amount);

			// 写入消费日志（usageKind='admin_reward'，cost 为负数表示收入）
			await this.agentModelUsageLogsRepository.insertOne({
				id: this.idService.gen(),
				requestedAt: now,
				completedAt: now,
				durationMs: 0,
				userId: targetUserId,
				sessionId: null,
				characterId: null,
				dialogueStyleId: null,
				modelId: null,
				modelApiName: null,
				usageKind: 'admin_reward',
				status: 'success',
				errorCode: reason,
				cost: -amount,
				promptTokens: null,
				completionTokens: null,
			});

			// 发送通知（使用实例图标作为通知头像）
			const instance = await this.metaService.fetch(true);
			this.notificationService.createNotification(targetUserId, 'app', {
				appAccessTokenId: null,
				customBody: reason
					? `你收到了 ${amount.toFixed(2)} 额度奖励：${reason}`
					: `你收到了 ${amount.toFixed(2)} 额度奖励`,
				customHeader: '奖励入账',
				customIcon: instance.iconUrl ?? instance.logoImageUrl ?? null,
			});

			// 查询新余额
			const profile = await this.userProfilesRepository.findOneBy({ userId: targetUserId });
			const newBalance = profile?.agentCreditBalance ?? amount;

			return { userId: targetUserId, amount, newBalance };
		});
	}
}
