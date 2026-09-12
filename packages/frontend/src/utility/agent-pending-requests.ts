/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { miLocalStorage } from '@/local-storage.js';

/**
 * 跨页面刷新持久化智能体在途请求的 clientRequestId（agentPendingRequests: { [sessionId]: id }）。
 * 服务端按 (sessionId, clientRequestId) 追踪在途生成；请求中刷新后内存里的 ID 会丢失，
 * 恢复它之后中断按钮才能真正终止服务端生成并回滚用户消息。
 */
function readStoredMap(): Record<string, unknown> {
	try {
		const parsed = JSON.parse(miLocalStorage.getItem('agentPendingRequests') ?? '{}') as unknown;
		return (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed as Record<string, unknown> : {};
	} catch {
		// 损坏的存储按空 map 处理：后续写入会整体覆盖，实现自愈
		return {};
	}
}

export function getStoredPendingRequestId(sessionId: string): string | null {
	const id = readStoredMap()[sessionId];
	return typeof id === 'string' && id.length > 0 ? id : null;
}

export function setStoredPendingRequestId(sessionId: string, clientRequestId: string | null): void {
	try {
		const map = readStoredMap();
		if (clientRequestId == null) {
			delete map[sessionId];
		} else {
			map[sessionId] = clientRequestId;
		}
		miLocalStorage.setItem('agentPendingRequests', JSON.stringify(map));
	} catch {
		// 存储不可用时静默降级：仅失去跨刷新中断能力
	}
}
