/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { reactive } from 'vue';

/**
 * 本页内已处理的群组邀请结果（群组 id → 状态），供通知页、通知小工具、邀请页、群组页共享。
 * 按群组记录：从群组页加入时拿不到邀请 id；只覆盖服务端仍为 pending 的邀请，不影响已撤销等旧记录。
 */
const localInvitationStatuses = reactive(new Map<string, { status: 'accepted' | 'ignored'; at: number }>());

export function markRoomInvitationHandled(roomId: string, status: 'accepted' | 'ignored'): void {
	localInvitationStatuses.set(roomId, { status, at: Date.now() });
}

/** 返回该邀请在本页内的处理结果；只作用于处理之前发出的邀请，之后的新邀请不受影响 */
export function getLocalInvitationStatus(invitation: { createdAt: string; room: { id: string } }): 'accepted' | 'ignored' | null {
	const local = localInvitationStatuses.get(invitation.room.id);
	if (local == null || new Date(invitation.createdAt).getTime() > local.at) return null;
	return local.status;
}
