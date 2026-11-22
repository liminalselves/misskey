/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { alert, promiseDialog } from '@/os.js';

const CHAT_ERROR_MESSAGES: Record<string, string> = {
	PERMISSION_DENIED: '你没有执行此操作的权限',
	ROLE_PERMISSION_DENIED: '当前账号的聊天功能受限，无法执行此操作',
	ACCESS_DENIED: '你无权访问该群组',
	NO_SUCH_ROOM: '群组不存在或已解散',
	NO_SUCH_USER: '用户不存在',
	NO_SUCH_MESSAGE: '消息不存在或已撤回',
	NO_SUCH_INVITATION: '邀请不存在或已失效',
	NO_SUCH_FILE: '文件不存在',
	NO_SUCH_EMOJI: '表情不存在',
	NOT_A_MEMBER: '该用户不是群组成员',
	ALREADY_MEMBER: '该用户已是群组成员',
	ALREADY_INVITED: '已向该用户发送过邀请',
	NO_INVITATION: '该群组为私有群组，需要受邀才能加入',
	ROOM_ARCHIVED: '该群组已归档，无法执行此操作',
	ROOM_IS_FULL: '群组成员已满',
	BANNED_FROM_ROOM: '你已被该群组拉黑，无法加入',
	USER_BANNED: '该用户已被群组拉黑，无法邀请',
	BLOCKED: '你与该用户存在屏蔽关系，无法执行此操作',
	YOU_HAVE_BEEN_BLOCKED: '你已被对方屏蔽',
	CANNOT_KICK_OWNER: '不能踢出群主',
	CANNOT_SUSPEND_OWNER: '不能禁言群主',
	CANNOT_SET_OWNER_ROLE: '不能修改群主的身份',
	CANNOT_TRANSFER_TO_SELF: '不能转让给自己',
	CANNOT_INVITE_YOURSELF: '不能邀请自己',
	OWNER_CANNOT_LEAVE: '群主不能退出群组，请先转让群主',
	RECALL_TIME_EXPIRED: '已超过可撤回时间',
	ALREADY_RECALLED: '该消息已被撤回',
	TOO_MANY_REACTIONS: '该消息的回应数量已达上限',
	INVALID_NAME: '群组名称无效',
	INVALID_ICON_URL: '群组头像地址无效',
	INVALID_EMOJI: '无效的表情',
	INVALID_REPLY_TARGET: '无法回复该消息',
	CONTENT_REQUIRED: '消息内容不能为空',
};

export function formatChatSuspension(info: { remainingMs?: number | null; isPermanent?: boolean } | null | undefined): string {
	const remainingMs = info?.remainingMs;
	if (info?.isPermanent || typeof remainingMs !== 'number' || remainingMs <= 0) {
		return '你已在该群组被永久禁言，期间无法发言或执行管理操作';
	}
	return `你已被禁言至 ${new Date(Date.now() + remainingMs).toLocaleString()}，期间无法发言或执行管理操作`;
}

/** 将群组/私信相关 API 错误转换为完整的中文提示 */
export function formatChatError(err: unknown): string {
	const e = err as Partial<Misskey.api.APIError> | null | undefined;
	if (e?.code === 'ROOM_SUSPENDED') return formatChatSuspension(e.info as { remainingMs?: number | null; isPermanent?: boolean } | undefined);
	if (e?.code != null && CHAT_ERROR_MESSAGES[e.code] != null) return CHAT_ERROR_MESSAGES[e.code];
	return formatApiError(err);
}

/** apiWithDialog 的群组版本：失败时给出完整中文提示 */
export function chatApiWithDialog<T = unknown>(endpoint: string, data: Record<string, unknown>): Promise<T> {
	const promise = (misskeyApi as unknown as (ep: string, d: Record<string, unknown>) => Promise<T>)(endpoint, data);
	promiseDialog(promise, null, (err) => {
		void alert({ type: 'error', text: formatChatError(err) });
	});
	return promise;
}
