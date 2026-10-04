/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { PushNotificationService } from '@/core/PushNotificationService.js';
import { bindThis } from '@/decorators.js';
import type { MainEventTypes } from '@/core/GlobalEventService.js';

export type AgentMessageNotifyPayload = MainEventTypes['newAgentMessage'];

/**
 * 智能体消息通知渠道：与私信（ChatService）的 newChatMessage 渠道完全对等。
 * 不落 notification 通知表，而是使用 Redis 未读标记 + 延迟事件发布：
 * 消息产生时写入未读标记，3 秒后若仍未被阅读，则通过 main stream 与推送通知用户。
 */
@Injectable()
export class AgentMessageNotifyService {
	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private globalEventService: GlobalEventService,
		private pushNotificationService: PushNotificationService,
	) {}

	@bindThis
	public async notifyAgentMessage(userId: string, payload: AgentMessageNotifyPayload): Promise<void> {
		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.set(`newAgentMessageExists:${userId}:${payload.sessionId}`, payload.messageId);
		// 首条未读 id：仅在上一批未读被清空后（键不存在）写入，已读时随标记一起删除
		redisPipeline.set(`firstUnreadAgentMessage:${userId}:${payload.sessionId}`, payload.messageId, 'NX');
		redisPipeline.incr(`unreadAgentMessagesCount:${userId}:${payload.sessionId}`);
		redisPipeline.sadd(`newAgentMessagesExists:${userId}`, payload.sessionId);
		await redisPipeline.exec();

		// 3秒経っても既読にならなかったらイベント発行（私信渠道同款逻辑）
		setTimeout(async () => {
			const marker = await this.redisClient.get(`newAgentMessageExists:${userId}:${payload.sessionId}`);

			if (marker == null) return; // 既読

			this.globalEventService.publishMainStream(userId, 'newAgentMessage', payload);
			this.pushNotificationService.pushNotification(userId, 'newAgentMessage', payload);
		}, 3000);
	}

	@bindThis
	public async readAgentMessages(userId: string, sessionId?: string): Promise<void> {
		const redisPipeline = this.redisClient.pipeline();
		if (sessionId) {
			redisPipeline.del(`newAgentMessageExists:${userId}:${sessionId}`);
			redisPipeline.del(`firstUnreadAgentMessage:${userId}:${sessionId}`);
			redisPipeline.del(`unreadAgentMessagesCount:${userId}:${sessionId}`);
			redisPipeline.srem(`newAgentMessagesExists:${userId}`, sessionId);
			await redisPipeline.exec();
		} else {
			const sessionIds = await this.redisClient.smembers(`newAgentMessagesExists:${userId}`);
			redisPipeline.del(`newAgentMessagesExists:${userId}`);
			for (const id of sessionIds) {
				redisPipeline.del(`newAgentMessageExists:${userId}:${id}`);
				redisPipeline.del(`firstUnreadAgentMessage:${userId}:${id}`);
				redisPipeline.del(`unreadAgentMessagesCount:${userId}:${id}`);
			}
			await redisPipeline.exec();
		}
	}

	@bindThis
	public async hasUnreadAgentMessages(userId: string): Promise<boolean> {
		const card = await this.redisClient.scard(`newAgentMessagesExists:${userId}`);
		return card > 0;
	}

	/**
	 * 单个会话的未读详情。count 为 null 表示有未读但条数未知
	 * （未读标记早于计数键引入，存量数据没有计数，已读后自愈）。
	 */
	@bindThis
	public async getUnreadInfo(userId: string, sessionId: string): Promise<{ count: number | null; firstUnreadId: string | null }> {
		const [marker, count, firstUnreadId] = await this.redisClient.mget(
			`newAgentMessageExists:${userId}:${sessionId}`,
			`unreadAgentMessagesCount:${userId}:${sessionId}`,
			`firstUnreadAgentMessage:${userId}:${sessionId}`,
		);
		if (marker == null) return { count: 0, firstUnreadId: null };
		return {
			count: count == null ? null : parseInt(count, 10),
			firstUnreadId,
		};
	}

	/** 会话列表用：返回所有未读会话的 id → 条数映射（条数未知为 null，见 getUnreadInfo） */
	@bindThis
	public async unreadCountMap(userId: string): Promise<Map<string, number | null>> {
		const map = new Map<string, number | null>();
		const sessionIds = await this.redisClient.smembers(`newAgentMessagesExists:${userId}`);
		if (sessionIds.length === 0) return map;

		const redisPipeline = this.redisClient.pipeline();
		for (const id of sessionIds) {
			redisPipeline.get(`unreadAgentMessagesCount:${userId}:${id}`);
		}
		const counts = await redisPipeline.exec();
		if (counts == null) throw new Error('redis error');

		for (let i = 0; i < sessionIds.length; i++) {
			const raw = counts[i][1] as string | null;
			map.set(sessionIds[i], raw == null ? null : parseInt(raw, 10));
		}
		return map;
	}
}
