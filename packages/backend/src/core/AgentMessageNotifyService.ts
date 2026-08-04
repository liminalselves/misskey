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
			redisPipeline.srem(`newAgentMessagesExists:${userId}`, sessionId);
			await redisPipeline.exec();
		} else {
			// 全部既読：逐会话标记无法廉价枚举，仅清汇总集合（与 chat/read-all 对齐）
			const sessionIds = await this.redisClient.smembers(`newAgentMessagesExists:${userId}`);
			redisPipeline.del(`newAgentMessagesExists:${userId}`);
			for (const id of sessionIds) {
				redisPipeline.del(`newAgentMessageExists:${userId}:${id}`);
			}
			await redisPipeline.exec();
		}
	}

	@bindThis
	public async hasUnreadAgentMessages(userId: string): Promise<boolean> {
		const card = await this.redisClient.scard(`newAgentMessagesExists:${userId}`);
		return card > 0;
	}

	/** 返回当前存在未读智能体消息的会话 ID 集合（供会话列表标记未读） */
	@bindThis
	public async unreadSessionIds(userId: string): Promise<Set<string>> {
		const ids = await this.redisClient.smembers(`newAgentMessagesExists:${userId}`);
		return new Set(ids);
	}
}
