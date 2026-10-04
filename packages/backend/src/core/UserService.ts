/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { FollowingsRepository, UsersRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

@Injectable()
export class UserService {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,
		private systemWebhookService: SystemWebhookService,
		private userEntityService: UserEntityService,
		@Inject(DI.redis)
		private redisClient: Redis.Redis,
	) {
	}

	@bindThis
	public async updateLastActiveDate(user: MiUser): Promise<void> {
		const key = `user:last-active-write:${user.id}`;
		const token = randomUUID();
		// Share the write window across tabs and worker processes without throttling online heartbeats.
		if (await this.redisClient.set(key, token, 'PX', 30_000, 'NX') !== 'OK') return;

		try {
			if (user.isHibernated) {
				const result = await this.usersRepository.createQueryBuilder().update()
					.set({ lastActiveDate: new Date() })
					.where('id = :id', { id: user.id })
					.returning(['isHibernated'])
					.execute();
				if (result.raw[0]?.isHibernated) {
					await this.usersRepository.update(user.id, { isHibernated: false });
					await this.followingsRepository.update({ followerId: user.id }, { isFollowerHibernated: false });
				}
			} else {
				await this.usersRepository.update(user.id, { lastActiveDate: new Date() });
			}
		} catch (error) {
			// A failed write must not suppress a retry or remove a newer worker's claim.
			await this.redisClient.eval(`
				if redis.call('get', KEYS[1]) == ARGV[1] then
					return redis.call('del', KEYS[1])
				end
				return 0
			`, 1, key, token);
			throw error;
		}
	}

	/**
	 * SystemWebhookを用いてユーザに関する操作内容を管理者各位に通知する.
	 * ここではJobQueueへのエンキューのみを行うため、即時実行されない.
	 *
	 * @see SystemWebhookService.enqueueSystemWebhook
	 */
	@bindThis
	public async notifySystemWebhook(user: MiUser, type: 'userCreated') {
		const packedUser = await this.userEntityService.pack(user, null, { schema: 'UserLite' });
		return this.systemWebhookService.enqueueSystemWebhook(type, packedUser);
	}
}
