/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { getNoteSummary } from '@/utility/get-note-summary.js';
import { notePage } from '@/filters/note.js';

/** Replace a single `{key}` placeholder in a translation string. */
function tpl(str: string, vars: Record<string, string | number>): string {
	return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

const INBOX = '/my/notifications';

function openPathForNote(note: { id?: string } | null | undefined): string {
	if (note?.id) return notePage({ id: note.id });
	return INBOX;
}

function openPathForChatRoom(room: { id?: string } | null | undefined): string {
	if (room?.id) return `/chat/room/${room.id}`;
	return '/chat';
}

/**
 * Build title, body and in-app path for an App system notification bridge.
 * openPath 为站内路径（以 / 开头），由 Native 与当前实例 origin 拼接为完整 URL。
 */
export function buildNotificationBridgeContent(notification: Misskey.entities.Notification): { title: string; body: string; openPath: string } {
	const n = notification as Record<string, any>;
	const userName: string = n.user?.name ?? n.user?.username ?? i18n.ts.notification;
	const ts = i18n.ts._notification as unknown as Record<string, string>;

	switch (notification.type) {
		// ── user-triggered, note-backed ──────────────────────────────────────
		case 'mention':
		case 'reply':
		case 'quote':
			return { title: userName, body: getNoteSummary(n.note), openPath: openPathForNote(n.note) };

		case 'renote':
			return { title: userName, body: getNoteSummary(n.note?.renote ?? n.note), openPath: openPathForNote(n.note) };

		case 'reaction':
			return {
				title: userName,
				body: [n.reaction, getNoteSummary(n.note)].filter(Boolean).join(' · '),
				openPath: openPathForNote(n.note),
			};

		case 'reaction:grouped': {
			const count = new Set((n.reactions as any[] ?? []).map((r: any) => r.user?.id)).size;
			const acceptanceIsLikeOnly = n.note?.reactionAcceptance === 'likeOnly';
			const titleStr = acceptanceIsLikeOnly
				? tpl(ts.likedBySomeUsers ?? '{n} 人赞了', { n: count })
				: tpl(ts.reactedBySomeUsers ?? '{n} 人回应了', { n: count });
			return { title: titleStr, body: getNoteSummary(n.note), openPath: openPathForNote(n.note) };
		}

		case 'renote:grouped': {
			const count = (n.users as any[] ?? []).length;
			return {
				title: tpl(ts.renotedBySomeUsers ?? '{n} 人转发了', { n: count }),
				body: getNoteSummary(n.note),
				openPath: openPathForNote(n.note),
			};
		}

		case 'pollEnded':
			return { title: ts.pollEnded ?? i18n.ts._notification.pollEnded, body: getNoteSummary(n.note), openPath: openPathForNote(n.note) };

		case 'scheduledNotePosted':
			return { title: ts.scheduledNotePosted ?? '', body: getNoteSummary(n.note), openPath: openPathForNote(n.note) };

		case 'scheduledNotePostFailed':
			return { title: ts.scheduledNotePostFailed ?? '', body: getNoteSummary(n.note), openPath: openPathForNote(n.note) };

		case 'note':
			return { title: i18n.ts._notification.newNote, body: getNoteSummary(n.note), openPath: openPathForNote(n.note) };

		// ── follow ────────────────────────────────────────────────────────────
		case 'follow':
			return { title: userName, body: i18n.ts.youGotNewFollower, openPath: INBOX };

		case 'receiveFollowRequest':
			return { title: userName, body: i18n.ts.receiveFollowRequest, openPath: '/my/follow-requests' };

		case 'followRequestAccepted':
			return { title: userName, body: i18n.ts.followRequestAccepted, openPath: INBOX };

		// ── system ────────────────────────────────────────────────────────────
		case 'roleAssigned':
			return { title: ts.roleAssigned ?? '', body: (n.role as any)?.name ?? '', openPath: INBOX };

		case 'achievementEarned':
			return { title: ts.achievementEarned ?? '', body: (i18n.ts._achievements?._types as any)?.[`_${n.achievement}`]?.title ?? String(n.achievement ?? ''), openPath: '/my/achievements' };

		case 'chatRoomInvitationReceived': {
			const room = n.invitation?.room;
			return { title: ts.chatRoomInvitationReceived ?? '', body: room?.name ?? '', openPath: openPathForChatRoom(room) };
		}

		case 'chatRoomMemberJoined':
		case 'chatRoomKicked':
		case 'chatRoomSuspended':
		case 'chatRoomUnsuspended': {
			const room = n.chatRoom as { id?: string; name?: string } | undefined;
			const roomLabel = room?.name ?? userName;
			return {
				title: roomLabel,
				body: getNoteSummary(n.note) || roomLabel,
				openPath: openPathForChatRoom(room),
			};
		}

		case 'exportCompleted':
			return {
				title: tpl(ts.exportOfXCompleted ?? '导出完成', { x: (n.exportedEntity as string) ?? '' }),
				body: '',
				openPath: n.fileId ? `/my/drive/file/${n.fileId}` : INBOX,
			};

		case 'login':
			return { title: ts.login ?? '有新的登录', body: '', openPath: INBOX };

		case 'createToken':
			return { title: ts.createToken ?? '', body: '', openPath: '/settings/apps' };

		case 'test':
			return { title: ts.testNotification ?? '', body: ts.notificationWillBeDisplayedLikeThis ?? '', openPath: INBOX };

		case 'app':
			return { title: String(n.header ?? ''), body: String(n.body ?? ''), openPath: INBOX };

		default: {
			const fallbackBody = getNoteSummary(n.note) || String(n.body ?? '');
			return { title: userName, body: fallbackBody, openPath: n.note?.id ? openPathForNote(n.note) : INBOX };
		}
	}
}
