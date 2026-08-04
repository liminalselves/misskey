/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 与 packages/frontend/src/utility/notification-bridge-content.ts 对齐的文案与 openPath，
 * 供阿里云原生推送等无法跑前端 JS 的场景使用。语言取自 userProfile.lang。
 */

import type { Packed } from '@/misc/json-schema.js';
import { getNoteSummary } from '@/misc/get-note-summary.js';

const INBOX = '/my/notifications';

type Lang = 'ja-JP' | 'zh-CN' | 'en-US';

const MSGS: Record<Lang, Record<string, string>> = {
	'ja-JP': {
		notification: '通知',
		youGotNewFollower: '新しいフォロワーがいます',
		receiveFollowRequest: 'フォローリクエストが届きました',
		followRequestAccepted: 'フォローリクエストが承認されました',
		newNote: '新しいノート',
		pollEnded: 'アンケートが終了しました',
		scheduledNotePosted: '予約投稿が公開されました',
		scheduledNotePostFailed: '予約投稿の公開に失敗しました',
		agentProactiveMessage: 'エージェントからのメッセージ',
		roleAssigned: 'ロールが付与されました',
		achievementEarned: '実績を獲得しました',
		chatRoomInvitationReceived: 'グループチャットに招待されました',
		exportOfXCompleted: '{x} のエクスポートが完了しました',
		login: '新しいログインがあります',
		createToken: 'アクセストークンが作成されました',
		testNotification: 'テスト通知',
		notificationWillBeDisplayedLikeThis: '通知はこのように表示されます',
		reactedBySomeUsers: '{n} 人がリアクションしました',
		likedBySomeUsers: '{n} 人がいいねしました',
		renotedBySomeUsers: '{n} 人がRenoteしました',
		newMessage: '新着メッセージ',
		antennaPrefix: 'アンテナ: ',
		achievementBodyPrefix: '実績: ',
	},
	'zh-CN': {
		notification: '通知',
		youGotNewFollower: '你有新的关注者',
		receiveFollowRequest: '您收到了关注请求',
		followRequestAccepted: '您的关注请求被通过了',
		newNote: '新的帖子',
		pollEnded: '问卷调查结果已生成。',
		scheduledNotePosted: '定时帖子已发布',
		scheduledNotePostFailed: '定时帖子发布失败',
		agentProactiveMessage: '智能体发来消息',
		roleAssigned: '授予的角色',
		achievementEarned: '获得成就',
		chatRoomInvitationReceived: '您已被邀请加入群聊',
		exportOfXCompleted: '已完成 {x} 的导出',
		login: '有新的登录',
		createToken: '访问令牌已创建',
		testNotification: '测试通知',
		notificationWillBeDisplayedLikeThis: '通知将会这样表示',
		reactedBySomeUsers: '{n} 人回应了',
		likedBySomeUsers: '{n}人赞了你的帖子',
		renotedBySomeUsers: '{n} 人转发了',
		newMessage: '新消息',
		antennaPrefix: '天线: ',
		achievementBodyPrefix: '成就: ',
	},
	'en-US': {
		notification: 'Notification',
		youGotNewFollower: 'You have a new follower',
		receiveFollowRequest: 'You received a follow request',
		followRequestAccepted: 'Your follow request was accepted',
		newNote: 'New note',
		pollEnded: 'A poll has ended',
		scheduledNotePosted: 'Scheduled note posted',
		scheduledNotePostFailed: 'Scheduled note failed to post',
		agentProactiveMessage: 'New agent message',
		roleAssigned: 'Role assigned',
		achievementEarned: 'Achievement unlocked',
		chatRoomInvitationReceived: 'You were invited to a group chat',
		exportOfXCompleted: 'Export of {x} completed',
		login: 'New login',
		createToken: 'Access token created',
		testNotification: 'Test notification',
		notificationWillBeDisplayedLikeThis: 'This is how notifications will appear',
		reactedBySomeUsers: '{n} users reacted',
		likedBySomeUsers: '{n} users liked your post',
		renotedBySomeUsers: '{n} users renoted',
		newMessage: 'New message',
		antennaPrefix: 'Antenna: ',
		achievementBodyPrefix: 'Achievement: ',
	},
};

function resolveLang(lang: string | null | undefined): Lang {
	if (!lang) return 'ja-JP';
	const normalized = lang.replace('_', '-');
	if (normalized === 'zh-CN' || normalized === 'zh-TW' || normalized.startsWith('zh')) return 'zh-CN';
	if (normalized === 'en-US' || normalized.startsWith('en')) return 'en-US';
	if (normalized === 'ja-JP' || normalized.startsWith('ja')) return 'ja-JP';
	return 'ja-JP';
}

function t(lang: string | null | undefined, key: keyof typeof MSGS['ja-JP']): string {
	const L = resolveLang(lang);
	return MSGS[L][key] ?? MSGS['ja-JP'][key] ?? key;
}

function tpl(lang: string | null | undefined, key: keyof typeof MSGS['ja-JP'], vars: Record<string, string | number>): string {
	let s = t(lang, key);
	for (const [k, v] of Object.entries(vars)) {
		s = s.replaceAll(`{${k}}`, String(v));
	}
	return s;
}

function openPathForNote(note: { id: string } | null | undefined): string {
	if (note?.id) return `/notes/${note.id}`;
	return INBOX;
}

function openPathForChatRoom(room: { id?: string } | null | undefined): string {
	if (room?.id) return `/chat/room/${room.id}`;
	return '/chat';
}

function userDisplayName(user: { name?: string | null; username?: string | null } | null | undefined, lang: string | null | undefined): string {
	return user?.name ?? user?.username ?? t(lang, 'notification');
}

export function joinInstanceUrl(configUrl: string, openPath: string): string {
	const base = configUrl.replace(/\/+$/, '');
	const path = openPath.startsWith('/') ? openPath : `/${openPath}`;
	return `${base}${path}`;
}

export function buildNativePushFromNotification(
	n: Packed<'Notification'>,
	lang: string | null | undefined,
): { title: string; body: string; openPath: string } {
	const raw = n as Record<string, any>;
	const userName = userDisplayName(raw.user, lang);
	const type = n.type as string;

	switch (type) {
		case 'mention':
		case 'reply':
		case 'quote':
			return { title: userName, body: getNoteSummary(raw.note), openPath: openPathForNote(raw.note) };
		case 'renote':
			return {
				title: userName,
				body: getNoteSummary(raw.note?.renote ?? raw.note),
				openPath: openPathForNote(raw.note),
			};
		case 'reaction':
			return {
				title: userName,
				body: [raw.reaction, getNoteSummary(raw.note)].filter(Boolean).join(' · '),
				openPath: openPathForNote(raw.note),
			};
		case 'reaction:grouped': {
			const reactions = (raw.reactions as { user?: { id: string } }[] | undefined) ?? [];
			const count = new Set(reactions.map((r) => r.user?.id).filter(Boolean)).size;
			const likeOnly = raw.note?.reactionAcceptance === 'likeOnly';
			const titleStr = likeOnly
				? tpl(lang, 'likedBySomeUsers', { n: count })
				: tpl(lang, 'reactedBySomeUsers', { n: count });
			return { title: titleStr, body: getNoteSummary(raw.note), openPath: openPathForNote(raw.note) };
		}
		case 'renote:grouped': {
			const users = (raw.users as unknown[] | undefined) ?? [];
			return {
				title: tpl(lang, 'renotedBySomeUsers', { n: users.length }),
				body: getNoteSummary(raw.note),
				openPath: openPathForNote(raw.note),
			};
		}
		case 'pollEnded':
			return { title: t(lang, 'pollEnded'), body: getNoteSummary(raw.note), openPath: openPathForNote(raw.note) };
		case 'scheduledNotePosted':
			return { title: t(lang, 'scheduledNotePosted'), body: getNoteSummary(raw.note), openPath: openPathForNote(raw.note) };
		case 'scheduledNotePostFailed':
			return { title: t(lang, 'scheduledNotePostFailed'), body: getNoteSummary(raw.note), openPath: openPathForNote(raw.note) };
		case 'agentProactiveMessage':
			return { title: String(raw.sessionName ?? t(lang, 'agentProactiveMessage')), body: String(raw.messageText ?? ''), openPath: `/chat/agent/${String(raw.sessionId ?? '')}` };
		case 'note':
			return { title: t(lang, 'newNote'), body: getNoteSummary(raw.note), openPath: openPathForNote(raw.note) };
		case 'follow':
			return { title: userName, body: t(lang, 'youGotNewFollower'), openPath: INBOX };
		case 'receiveFollowRequest':
			return { title: userName, body: t(lang, 'receiveFollowRequest'), openPath: '/my/follow-requests' };
		case 'followRequestAccepted':
			return { title: userName, body: t(lang, 'followRequestAccepted'), openPath: INBOX };
		case 'roleAssigned':
			return { title: t(lang, 'roleAssigned'), body: raw.role?.name ?? '', openPath: INBOX };
		case 'achievementEarned':
			return {
				title: t(lang, 'achievementEarned'),
				body: `${t(lang, 'achievementBodyPrefix')}${String(raw.achievement ?? '')}`,
				openPath: '/my/achievements',
			};
		case 'chatRoomInvitationReceived': {
			const room = raw.invitation?.room;
			return {
				title: t(lang, 'chatRoomInvitationReceived'),
				body: room?.name ?? '',
				openPath: openPathForChatRoom(room),
			};
		}
		case 'chatRoomMemberJoined':
		case 'chatRoomKicked':
		case 'chatRoomSuspended':
		case 'chatRoomUnsuspended': {
			const room = raw.chatRoom as { id?: string; name?: string } | undefined;
			const roomLabel = room?.name ?? userName;
			return {
				title: roomLabel,
				body: getNoteSummary(raw.note) || roomLabel,
				openPath: openPathForChatRoom(room),
			};
		}
		case 'exportCompleted':
			return {
				title: tpl(lang, 'exportOfXCompleted', { x: String(raw.exportedEntity ?? '') }),
				body: '',
				openPath: raw.fileId ? `/my/drive/file/${raw.fileId}` : INBOX,
			};
		case 'login':
			return { title: t(lang, 'login'), body: '', openPath: INBOX };
		case 'createToken':
			return { title: t(lang, 'createToken'), body: '', openPath: '/settings/apps' };
		case 'test':
			return {
				title: t(lang, 'testNotification'),
				body: t(lang, 'notificationWillBeDisplayedLikeThis'),
				openPath: INBOX,
			};
		case 'app':
			return { title: String(raw.header ?? t(lang, 'notification')), body: String(raw.body ?? ''), openPath: INBOX };
		default: {
			const body = getNoteSummary(raw.note) || String(raw.body ?? '');
			return { title: userName, body, openPath: raw.note?.id ? openPathForNote(raw.note) : INBOX };
		}
	}
}

export function buildNativePushFromChatMessage(
	m: Packed<'ChatMessage'>,
	lang: string | null | undefined,
): { title: string; body: string; openPath: string } {
	const raw = m as Record<string, any>;
	const sender = raw.fromUser?.name ?? raw.fromUser?.username ?? t(lang, 'newMessage');
	const body = String(raw.text ?? '');
	const openPath =
		raw.fromUserId ? `/chat/user/${raw.fromUserId}` :
			raw.toRoomId ? `/chat/room/${raw.toRoomId}` :
			'/chat';
	return { title: sender, body, openPath };
}

/** 智能体消息渠道（与私信 newChatMessage 对等，不走 notification 通知表） */
export function buildNativePushFromAgentMessage(
	payload: { sessionId: string; sessionName: string | null; messageId: string; messageText: string; agentAvatarUrl: string | null },
	lang: string | null | undefined,
): { title: string; body: string; openPath: string } {
	const title = payload.sessionName ?? t(lang, 'agentProactiveMessage');
	return { title, body: String(payload.messageText ?? ''), openPath: `/chat/agent/${payload.sessionId}` };
}

export function buildNativePushFromAntennaNote(
	payload: { antenna: { id: string; name: string }; note: Packed<'Note'> },
	lang: string | null | undefined,
): { title: string; body: string; openPath: string } {
	const title = `${t(lang, 'antennaPrefix')}${payload.antenna.name}`;
	const body = getNoteSummary(payload.note);
	return { title, body, openPath: openPathForNote(payload.note) };
}
