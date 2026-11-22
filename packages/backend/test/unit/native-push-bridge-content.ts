/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import {
	buildNativePushFromChatMessage,
	buildNativePushFromNotification,
} from '@/misc/native-push-bridge-content.js';

describe('native-push-bridge-content (chat)', () => {
	test('routes room chat messages to /chat/room/:roomId even when fromUserId is present', () => {
		const res = buildNativePushFromChatMessage({
			id: 'msg1',
			createdAt: '2026-11-21T00:00:00.000Z',
			fromUserId: 'user1',
			fromUser: { id: 'user1', name: 'Alice', username: 'alice' } as any,
			toRoomId: 'room1',
			toUserId: null,
			text: 'Hello room',
			reactions: [],
		} as any, 'zh-CN');

		expect(res.openPath).toBe('/chat/room/room1');
		expect(res.title).toBe('Alice');
		expect(res.body).toBe('Hello room');
	});

	test('routes 1-on-1 chat messages to /chat/user/:fromUserId when toRoomId is absent', () => {
		const res = buildNativePushFromChatMessage({
			id: 'msg2',
			createdAt: '2026-11-21T00:00:00.000Z',
			fromUserId: 'user2',
			fromUser: { id: 'user2', name: 'Bob', username: 'bob' } as any,
			toRoomId: null,
			toUserId: 'me1',
			text: 'DM text',
			reactions: [],
		} as any, 'en-US');

		expect(res.openPath).toBe('/chat/user/user2');
		expect(res.title).toBe('Bob');
		expect(res.body).toBe('DM text');
	});

	test('builds meaningful notification text and openPath for chat room events', () => {
		const room = { id: 'room1', name: 'General' };
		const user = { id: 'user1', name: 'Alice', username: 'alice' };

		const joined = buildNativePushFromNotification({
			id: 'n1',
			createdAt: '2026-11-21T00:00:00.000Z',
			type: 'chatRoomMemberJoined',
			userId: 'user1',
			user,
			chatRoom: room,
		} as any, 'zh-CN');
		expect(joined.title).toBe('General');
		expect(joined.body).toContain('Alice');
		expect(joined.openPath).toBe('/chat/room/room1');

		const kicked = buildNativePushFromNotification({
			id: 'n2',
			createdAt: '2026-11-21T00:00:00.000Z',
			type: 'chatRoomKicked',
			userId: 'user1',
			user,
			chatRoom: room,
		} as any, 'en-US');
		expect(kicked.title).toBe('General');
		expect(kicked.body).toBe('You were removed from the room');
		expect(kicked.openPath).toBe('/chat');

		const suspended = buildNativePushFromNotification({
			id: 'n3',
			createdAt: '2026-11-21T00:00:00.000Z',
			type: 'chatRoomSuspended',
			userId: 'user1',
			user,
			chatRoom: room,
		} as any, 'ja-JP');
		expect(suspended.title).toBe('General');
		expect(suspended.body).toBe('グループチャットで発言が制限されました');
		expect(suspended.openPath).toBe('/chat/room/room1');

		const unsuspended = buildNativePushFromNotification({
			id: 'n4',
			createdAt: '2026-11-21T00:00:00.000Z',
			type: 'chatRoomUnsuspended',
			userId: 'user1',
			user,
			chatRoom: room,
		} as any, 'zh-CN');
		expect(unsuspended.title).toBe('General');
		expect(unsuspended.body).toBe('您在该群组中的禁言已解除');
		expect(unsuspended.openPath).toBe('/chat/room/room1');

		const mention = buildNativePushFromNotification({
			id: 'n5',
			createdAt: '2026-11-21T00:00:00.000Z',
			type: 'chatRoomMention',
			userId: 'user1',
			user,
			chatRoomId: 'room1',
			chatRoom: room,
			messageId: 'm1',
		} as any, 'zh-CN');
		expect(mention.title).toBe('General');
		expect(mention.body).toBe('Alice 在群组中提到了你');
		expect(mention.openPath).toBe('/chat/room/room1');
	});
});
