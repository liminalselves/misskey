/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { MiUser } from '@/models/User.js';

@Injectable()
export class UserWebSocketStatusService {
	private readonly REDIS_KEY_PREFIX = 'userWsOnline:';
	private readonly REDIS_CONN_COUNT_KEY_PREFIX = 'userWsConnCount:';
	// 缩短在线状态过期时间，避免异常断开后长期误判“在线”而阻断离线原生推送
	// ping 周期 60s，keepAlive 每 30s 续期；TTL 必须 > ping 间隔才不误判离线
	// 130s = 2× keepAlive + buffer，确保正常在线时不过期，异常断线 130s 内自动清除
	private readonly TTL_SECONDS = 130;

	constructor(
		@Inject(DI.redis)
		private redis: Redis.Redis,
	) {
	}

	/**
	 * Mark user as online (WebSocket connected)
	 */
	async setUserOnline(userId: MiUser['id']): Promise<void> {
		const onlineKey = `${this.REDIS_KEY_PREFIX}${userId}`;
		const connCountKey = `${this.REDIS_CONN_COUNT_KEY_PREFIX}${userId}`;
		await this.redis
			.multi()
			.incr(connCountKey)
			.expire(connCountKey, this.TTL_SECONDS)
			.setex(onlineKey, this.TTL_SECONDS, '1')
			.exec();
	}

	/**
	 * Mark user as offline (WebSocket disconnected)
	 */
	async setUserOffline(userId: MiUser['id']): Promise<void> {
		const onlineKey = `${this.REDIS_KEY_PREFIX}${userId}`;
		const connCountKey = `${this.REDIS_CONN_COUNT_KEY_PREFIX}${userId}`;
		// decr 与 del/expire 必须整体原子：decr 归零后、del 执行前若有新连接 INCR 计数，
		// 会被随后的 del 误删，导致在线连接被误判为离线
		await this.redis.eval(`
			local v = redis.call('DECR', KEYS[1])
			if v <= 0 then
				redis.call('DEL', KEYS[1])
				redis.call('DEL', KEYS[2])
				return v
			end
			redis.call('EXPIRE', KEYS[1], ARGV[1])
			redis.call('SETEX', KEYS[2], ARGV[1], '1')
			return v
		`, 2, connCountKey, onlineKey, this.TTL_SECONDS);
	}

	/**
	 * Check if user is online via WebSocket
	 */
	async isUserOnline(userId: MiUser['id']): Promise<boolean> {
		const connCount = await this.redis.get(`${this.REDIS_CONN_COUNT_KEY_PREFIX}${userId}`);
		if (connCount != null) {
			return Number(connCount) > 0;
		}
		const onlineFlag = await this.redis.get(`${this.REDIS_KEY_PREFIX}${userId}`);
		return onlineFlag === '1';
	}

	/**
	 * Keep user alive (extend TTL)
	 */
	async keepUserAlive(userId: MiUser['id']): Promise<void> {
		const onlineKey = `${this.REDIS_KEY_PREFIX}${userId}`;
		const connCountKey = `${this.REDIS_CONN_COUNT_KEY_PREFIX}${userId}`;
		await this.redis.expire(
			connCountKey,
			this.TTL_SECONDS
		);
		await this.redis.setex(
			onlineKey,
			this.TTL_SECONDS,
			'1',
		);
	}
}
