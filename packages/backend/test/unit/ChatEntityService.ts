/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';

function createEntityServiceHarness(overrides?: {
	chatMessages?: any[];
	memberships?: any[];
	invitations?: any[];
	bans?: any[];
	memberCountRows?: { roomId: string; cnt: string }[];
	redisExecResults?: [null, string | null][];
}) {
	const chatMessagesFind = vi.fn(async () => overrides?.chatMessages ?? []);
	const chatMessagesFindOne = vi.fn(async () => null);
	const chatRoomsFind = vi.fn(async () => []);
	const chatRoomBansFind = vi.fn(async () => overrides?.bans ?? []);
	const chatRoomInvitationsFind = vi.fn(async () => overrides?.invitations ?? []);
	const chatRoomMembershipsFind = vi.fn(async () => overrides?.memberships ?? []);

	const membershipQb = {
		select: () => membershipQb,
		addSelect: () => membershipQb,
		innerJoin: () => membershipQb,
		where: () => membershipQb,
		andWhere: () => membershipQb,
		groupBy: () => membershipQb,
		getCount: async () => overrides?.memberCountRows?.[0] ? Number(overrides.memberCountRows[0].cnt) : 0,
		getRawMany: async () => overrides?.memberCountRows ?? [],
	};

	const pipeline = {
		get: vi.fn(),
		exec: vi.fn(async () => overrides?.redisExecResults ?? []),
	};
	const redisClient = {
		pipeline: () => pipeline,
		mget: vi.fn(async () => [null, null]),
	};

	const userEntityService = {
		pack: vi.fn(async (u: any) => {
			const id = typeof u === 'string' ? u : u.id;
			return { id, username: `user_${id}`, name: `User ${id}` };
		}),
		packMany: vi.fn(async (users: any[]) => {
			const seen = new Set<string>();
			return users
				.map(u => (typeof u === 'string' ? u : u.id))
				.filter(id => {
					if (seen.has(id)) return false;
					seen.add(id);
					return true;
				})
				.map(id => ({ id, username: `user_${id}`, name: `User ${id}` }));
		}),
	};

	const driveFileEntityService = {
		packNullable: vi.fn(async () => null),
		packManyByIdsMap: vi.fn(async () => new Map()),
	};

	const idService = {
		parse: vi.fn(() => ({ date: new Date('2026-11-21T00:00:00.000Z') })),
	};

	const service = new ChatEntityService(
		redisClient as any,
		{ find: chatMessagesFind, findOne: chatMessagesFindOne } as any,
		{ find: chatRoomsFind } as any,
		{ find: chatRoomBansFind, findOneBy: vi.fn(async () => null) } as any,
		{ find: chatRoomInvitationsFind, findOneBy: vi.fn(async () => null) } as any,
		{
			find: chatRoomMembershipsFind,
			findOneBy: vi.fn(async () => null),
			createQueryBuilder: () => membershipQb,
		} as any,
		userEntityService as any,
		driveFileEntityService as any,
		idService as any,
	);

	return {
		service,
		chatMessagesFind,
		chatMessagesFindOne,
		chatRoomInvitationsFind,
		userEntityService,
	};
}

describe('ChatEntityService', () => {
	test('packRooms filters pending invitations and computes memberCount/myRole/ban fields in batch', async () => {
		const { service, chatRoomInvitationsFind } = createEntityServiceHarness({
			memberships: [
				{ id: 'mem1', roomId: 'room2', userId: 'me1', isMuted: true, role: 'admin', suspendedUntil: null },
			],
			invitations: [],
			bans: [
				{ id: 'ban1', roomId: 'room3', userId: 'me1', reason: 'spam' },
			],
			memberCountRows: [
				{ roomId: 'room1', cnt: '2' },
				{ roomId: 'room2', cnt: '4' },
			],
			redisExecResults: [
				[null, 'm1'], [null, '3'],
				[null, null], [null, null],
				[null, null], [null, null],
			],
		});

		const rooms = [
			{ id: 'room1', name: 'Owned', description: '', ownerId: 'me1', isPublic: false, isArchived: false, allowMemberInvite: true, announcement: 'Hi', pinnedMessageId: null },
			{ id: 'room2', name: 'Joined', description: '', ownerId: 'owner2', isPublic: true, isArchived: true, allowMemberInvite: false, announcement: null, pinnedMessageId: null },
			{ id: 'room3', name: 'Banned', description: '', ownerId: 'owner3', isPublic: true, isArchived: false, allowMemberInvite: false, announcement: null, pinnedMessageId: null },
		];

		const packed = await service.packRooms(rooms as any, { id: 'me1' });

		expect(chatRoomInvitationsFind).toHaveBeenCalledWith({
			where: expect.objectContaining({
				userId: 'me1',
				status: 'pending',
			}),
		});
		expect(packed.map(r => r.id)).toEqual(['room1', 'room2', 'room3']);
		expect(packed[0]).toMatchObject({
			myRole: 'owner',
			isMember: true,
			allowMemberInvite: true,
			announcement: 'Hi',
			memberCount: 3,
			unreadCount: 3,
			isBanned: false,
		});
		expect(packed[1]).toMatchObject({
			myRole: 'admin',
			isMember: true,
			isMuted: true,
			isArchived: true,
			memberCount: 5,
			unreadCount: 0,
		});
		expect(packed[2]).toMatchObject({
			myRole: null,
			isMember: false,
			isBanned: true,
			banReason: 'spam',
			memberCount: 1,
		});
	});

	test('packMessagesLiteForRoom batches reply lookups and rejects cross-conversation reply leaks', async () => {
		const replyInSameRoom = {
			id: 'r1',
			toRoomId: 'room1',
			toUserId: null,
			fromUserId: 'u2',
			text: 'valid reply',
			fileId: 'f1',
		};
		const replyInOtherRoom = {
			id: 'r2',
			toRoomId: 'room_secret',
			toUserId: null,
			fromUserId: 'u3',
			text: 'secret text',
			fileId: null,
		};

		const { service, chatMessagesFind, chatMessagesFindOne } = createEntityServiceHarness({
			chatMessages: [replyInSameRoom, replyInOtherRoom],
		});

		const recalledAt = new Date('2026-11-21T01:00:00.000Z');
		const packed = await service.packMessagesLiteForRoom([
			{ id: 'm1', fromUserId: 'u1', toRoomId: 'room1', toUserId: null, text: 'hello', fileId: null, reactions: [], replyId: 'r1', recalledAt: null, recalledById: null },
			{ id: 'm2', fromUserId: 'u1', toRoomId: 'room1', toUserId: null, text: 'cross', fileId: null, reactions: [], replyId: 'r2', recalledAt: null, recalledById: null },
			{ id: 'm3', fromUserId: 'u1', toRoomId: 'room1', toUserId: null, text: 'leaked', fileId: 'f1', reactions: ['u2/👍'], replyId: 'r1', recalledAt, recalledById: 'u2' },
		] as any);

		expect(chatMessagesFind).toHaveBeenCalledTimes(1);
		expect(chatMessagesFindOne).not.toHaveBeenCalled();
		expect(packed[0].recalledAt).toBeNull();
		expect(packed[0].reply).toMatchObject({
			id: 'r1',
			text: 'valid reply',
			fileId: 'f1',
			fromUserId: 'u2',
		});
		expect(packed[1].reply).toBeNull();
		expect(packed[2]).toMatchObject({
			id: 'm3',
			text: null,
			fileId: null,
			file: null,
			reactions: [],
			replyId: null,
			reply: null,
			recalledAt: '2026-11-21T01:00:00.000Z',
			recalledById: 'u2',
		});
	});

	test('packRoomInvitations batches users and rooms without N+1', async () => {
		const { service, userEntityService } = createEntityServiceHarness();
		const invitations = [
			{ id: 'inv1', userId: 'u1', roomId: 'room1', room: { id: 'room1', name: 'R1', description: '', ownerId: 'owner1', isPublic: false, isArchived: false, allowMemberInvite: false, announcement: null, pinnedMessageId: null } },
			{ id: 'inv2', userId: 'u2', roomId: 'room1', room: { id: 'room1', name: 'R1', description: '', ownerId: 'owner1', isPublic: false, isArchived: false, allowMemberInvite: false, announcement: null, pinnedMessageId: null } },
		];

		const packed = await service.packRoomInvitations(invitations as any, { id: 'me1' });
		expect(packed).toHaveLength(2);
		expect(userEntityService.packMany).toHaveBeenCalled();
		expect(userEntityService.pack).not.toHaveBeenCalled();
	});
});
