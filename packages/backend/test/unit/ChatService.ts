/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { ChatMessageAccessError, ChatService, validateRoomIconUrl } from '@/core/ChatService.js';

function createQueryBuilderMock(options?: {
	getManyResult?: any[];
	getCountResult?: number;
	getRawManyResult?: any[];
	executeResult?: { affected?: number };
}) {
	const qb: any = {
		alias: 'm',
		select: () => qb,
		addSelect: () => qb,
		where: () => qb,
		andWhere: () => qb,
		orWhere: () => qb,
		innerJoin: () => qb,
		innerJoinAndSelect: () => qb,
		leftJoinAndSelect: () => qb,
		groupBy: () => qb,
		orderBy: () => qb,
		limit: () => qb,
		take: () => qb,
		setParameter: () => qb,
		setParameters: () => qb,
		update: () => qb,
		set: () => qb,
		insert: () => qb,
		values: () => qb,
		orIgnore: () => qb,
		getMany: vi.fn(async () => options?.getManyResult ?? []),
		getCount: vi.fn(async () => options?.getCountResult ?? 0),
		getRawMany: vi.fn(async () => options?.getRawManyResult ?? []),
		execute: vi.fn(async () => options?.executeResult ?? { affected: 1 }),
	};
	return qb;
}

function createChatServiceHarness(overrides?: {
	rooms?: any[];
	memberships?: any[];
	invitations?: any[];
	bans?: any[];
	messages?: any[];
	users?: any[];
	isModerator?: boolean;
	blockedPairs?: [string, string][];
	unreadCountAfter?: number;
	msgUpdateAffected?: number;
	historyRaw?: any[];
	timelineMessages?: any[];
	mutings?: any[];
	queryMessagesImpl?: (sql: string, params: any[]) => any[];
}) {
	const rooms = overrides?.rooms ?? [];
	const memberships = overrides?.memberships ?? [];
	const invitations = overrides?.invitations ?? [];
	const bans = overrides?.bans ?? [];
	const messages = overrides?.messages ?? [];
	const users = overrides?.users ?? [];
	const blockedPairs = new Set((overrides?.blockedPairs ?? []).map(([a, b]) => `${a}:${b}`));

	let idSeq = 1;
	const idService = {
		gen: vi.fn(() => `id_${String(idSeq++).padStart(4, '0')}`),
		parse: vi.fn(() => ({ date: new Date('2026-11-21T00:00:00.000Z') })),
	};

	const pipelineOps: any[] = [];
	const makePipeline = () => {
		const p: any = {
			set: (...args: any[]) => { pipelineOps.push(['set', ...args]); return p; },
			incr: (...args: any[]) => { pipelineOps.push(['incr', ...args]); return p; },
			sadd: (...args: any[]) => { pipelineOps.push(['sadd', ...args]); return p; },
			del: (...args: any[]) => { pipelineOps.push(['del', ...args]); return p; },
			srem: (...args: any[]) => { pipelineOps.push(['srem', ...args]); return p; },
			get: (...args: any[]) => { pipelineOps.push(['get', ...args]); return p; },
			exec: vi.fn(async () => []),
		};
		return p;
	};
	const redisClient = {
		multi: makePipeline,
		pipeline: makePipeline,
		smembers: vi.fn(async () => ['room:r1', 'user:u2']),
		scard: vi.fn(async () => overrides?.unreadCountAfter ?? 0),
		get: vi.fn(async () => null),
		mget: vi.fn(async () => [null, null, null]),
	};

	const matchWhere = (row: any, where: any) =>
		Object.entries(where).every(([k, v]) => row[k] === v);

	const chatRoomsRepository: any = {
		findOne: vi.fn(async ({ where }: any) => rooms.find(r => matchWhere(r, where)) ?? null),
		findOneOrFail: vi.fn(async ({ where }: any) => {
			const r = rooms.find(x => matchWhere(x, where));
			if (!r) throw new Error('EntityNotFound');
			return r;
		}),
		findOneBy: vi.fn(async (where: any) => rooms.find(r => matchWhere(r, where)) ?? null),
		findOneByOrFail: vi.fn(async (where: any) => {
			const r = rooms.find(x => matchWhere(x, where));
			if (!r) throw new Error('EntityNotFound');
			return r;
		}),
		find: vi.fn(async ({ where }: any) => {
			if (!where) return rooms;
			return rooms.filter(r => matchWhere(r, where));
		}),
		findBy: vi.fn(async (where: any) => rooms.filter(r => matchWhere(r, where))),
		insertOne: vi.fn(async (doc: any) => { rooms.push(doc); return doc; }),
		insert: vi.fn(async (doc: any) => { rooms.push(doc); }),
		update: vi.fn(async (id: string, patch: any) => {
			const r = rooms.find(x => x.id === id);
			if (r) Object.assign(r, patch);
		}),
		delete: vi.fn(async (id: string) => {
			const idx = rooms.findIndex(x => x.id === id);
			if (idx >= 0) rooms.splice(idx, 1);
		}),
		createQueryBuilder: vi.fn(() => createQueryBuilderMock()),
	};

	const chatRoomMembershipsRepository: any = {
		findOne: vi.fn(async ({ where }: any) => memberships.find(m => matchWhere(m, where)) ?? null),
		findOneBy: vi.fn(async (where: any) => memberships.find(m => matchWhere(m, where)) ?? null),
		findBy: vi.fn(async (where: any) => memberships.filter(m => matchWhere(m, where))),
		insertOne: vi.fn(async (doc: any) => { memberships.push(doc); return doc; }),
		insert: vi.fn(async (doc: any) => { memberships.push(doc); }),
		update: vi.fn(async (id: string, patch: any) => {
			const m = memberships.find(x => x.id === id);
			if (m) Object.assign(m, patch);
		}),
		delete: vi.fn(async (idOrWhere: any) => {
			const id = typeof idOrWhere === 'string' ? idOrWhere : idOrWhere.id;
			const idx = memberships.findIndex(x => x.id === id);
			if (idx >= 0) memberships.splice(idx, 1);
		}),
		createQueryBuilder: vi.fn(() => createQueryBuilderMock({
			getCountResult: memberships.length,
			getManyResult: memberships,
		})),
	};

	const chatRoomInvitationsRepository: any = {
		findOne: vi.fn(async ({ where }: any) => invitations.find(i => matchWhere(i, where)) ?? null),
		findOneBy: vi.fn(async (where: any) => invitations.find(i => matchWhere(i, where)) ?? null),
		findOneByOrFail: vi.fn(async (where: any) => invitations.find(i => matchWhere(i, where))!),
		insert: vi.fn(async (doc: any) => { invitations.push(doc); }),
		update: vi.fn(async (id: string, patch: any) => {
			const inv = invitations.find(x => x.id === id);
			if (inv) Object.assign(inv, patch);
		}),
		delete: vi.fn(async (whereOrId: any) => {
			if (typeof whereOrId === 'string') {
				const idx = invitations.findIndex(x => x.id === whereOrId);
				if (idx >= 0) invitations.splice(idx, 1);
			} else {
				for (let i = invitations.length - 1; i >= 0; i--) {
					if (matchWhere(invitations[i], whereOrId)) invitations.splice(i, 1);
				}
			}
		}),
	};

	const chatRoomBansRepository: any = {
		findOneBy: vi.fn(async (where: any) => bans.find(b => matchWhere(b, where)) ?? null),
		findOneByOrFail: vi.fn(async (where: any) => bans.find(b => matchWhere(b, where))!),
		insert: vi.fn(async (doc: any) => { bans.push(doc); }),
		delete: vi.fn(async (id: string) => {
			const idx = bans.findIndex(x => x.id === id);
			if (idx >= 0) bans.splice(idx, 1);
		}),
		createQueryBuilder: vi.fn(() => createQueryBuilderMock({ getManyResult: bans })),
	};

	const chatMessagesRepository: any = {
		findOne: vi.fn(async ({ where }: any) => messages.find(m => matchWhere(m, where)) ?? null),
		findOneBy: vi.fn(async (where: any) => messages.find(m => matchWhere(m, where)) ?? null),
		insertOne: vi.fn(async (doc: any) => {
			const saved = { reactions: [], reads: [], ...doc };
			messages.push(saved);
			return saved;
		}),
		update: vi.fn(async (id: string, patch: any) => {
			const m = messages.find(x => x.id === id);
			if (m) Object.assign(m, patch);
		}),
		delete: vi.fn(async (id: string) => {
			const idx = messages.findIndex(x => x.id === id);
			if (idx >= 0) messages.splice(idx, 1);
		}),
		createQueryBuilder: vi.fn(() => createQueryBuilderMock({
			getManyResult: overrides?.timelineMessages ?? messages,
			getRawManyResult: overrides?.historyRaw ?? [],
			executeResult: { affected: overrides?.msgUpdateAffected ?? 1 },
		})),
		query: vi.fn(async (sql: string, params: any[]) => overrides?.queryMessagesImpl?.(sql, params) ?? []),
	};

	const usersRepository: any = {
		findOneBy: vi.fn(async (where: any) => users.find(u => matchWhere(u, where)) ?? null),
		createQueryBuilder: vi.fn(() => ({
			select: () => ({
				where: (_sql1: string, p1: { ids: string[] }) => ({
					andWhere: () => ({
						andWhere: (_sql2: string, p2: { usernames: string[] }) => ({
							getMany: async () => users.filter(u => p1.ids.includes(u.id) && p2.usernames.includes(u.usernameLower)),
						}),
					}),
				}),
			}),
		})),
	};

	chatRoomsRepository.manager = {
		transaction: async (fn: (manager: any) => Promise<any>) => fn({
			getRepository: (entity: any) => {
				if (entity === 'MiChatRoom' || entity?.name === 'MiChatRoom') return chatRoomsRepository;
				if (entity === 'MiChatRoomMembership' || entity?.name === 'MiChatRoomMembership') return chatRoomMembershipsRepository;
				if (entity === 'MiChatRoomInvitation' || entity?.name === 'MiChatRoomInvitation') return chatRoomInvitationsRepository;
				if (entity === 'MiChatRoomBan' || entity?.name === 'MiChatRoomBan') return chatRoomBansRepository;
				return chatRoomsRepository;
			},
		}),
	};

	const globalEventService = {
		publishMainStream: vi.fn(),
		publishChatRoomStream: vi.fn(),
		publishChatUserStream: vi.fn(),
	};

	const notificationService = {
		createNotification: vi.fn(),
	};

	const userBlockingService = {
		checkBlocked: vi.fn(async (blockerId: string, blockeeId: string) => blockedPairs.has(`${blockerId}:${blockeeId}`)),
	};

	const roleService = {
		isModerator: vi.fn(async () => overrides?.isModerator ?? false),
		getUserPolicies: vi.fn(async () => ({ chatAvailability: 'available' })),
	};

	const chatEntityService = {
		packMessageLiteForRoom: vi.fn(async (m: any) => ({ id: m.id, text: m.text, toRoomId: m.toRoomId, editedAt: m.editedAt?.toISOString() ?? null })),
		packMessageLiteFor1on1: vi.fn(async (m: any) => ({ id: m.id, text: m.text, toUserId: m.toUserId, editedAt: m.editedAt?.toISOString() ?? null })),
		packMessageDetailed: vi.fn(async (m: any) => ({ id: m.id, text: m.text })),
		packRoom: vi.fn(async (r: any) => ({ id: r.id, name: r.name, ownerId: r.ownerId, pinnedMessageId: r.pinnedMessageId ?? null })),
		packRoomMembership: vi.fn(async () => ({ id: 'mem1' })),
	};

	const userEntityService = {
		isLocalUser: vi.fn(() => true),
		isRemoteUser: vi.fn(() => false),
		pack: vi.fn(async (u: any) => ({ id: typeof u === 'string' ? u : u.id, username: 'u' })),
	};

	const queryService = {
		makePaginationQuery: vi.fn((qb: any) => qb),
	};

	const service = new ChatService(
		{ host: 'example.com' } as any,
		redisClient as any,
		usersRepository,
		chatMessagesRepository,
		{ createQueryBuilder: () => createQueryBuilderMock() } as any,
		chatRoomsRepository,
		chatRoomBansRepository,
		chatRoomInvitationsRepository,
		chatRoomMembershipsRepository,
		{ find: vi.fn(async () => overrides?.mutings ?? []) } as any,
		userEntityService as any,
		chatEntityService as any,
		idService as any,
		globalEventService as any,
		{} as any,
		{} as any,
		{ pushNotification: vi.fn() } as any,
		notificationService as any,
		userBlockingService as any,
		queryService as any,
		roleService as any,
		{ isFollowing: vi.fn(async () => true), isMutual: vi.fn(async () => true) } as any,
		{ localEmojisCache: { fetch: vi.fn(async () => new Map([['blobcat', {}]])) } } as any,
		{ log: vi.fn() } as any,
	);

	return {
		service,
		rooms,
		memberships,
		invitations,
		bans,
		messages,
		pipelineOps,
		globalEventService,
		notificationService,
		chatMessagesRepository,
		chatRoomMembershipsRepository,
	};
}

describe('validateRoomIconUrl', () => {
	test('allows null/empty, https/http URLs, and safe /files/ paths; rejects dangerous schemes and traversal', () => {
		expect(validateRoomIconUrl(null)).toBeNull();
		expect(validateRoomIconUrl('  ')).toBeNull();
		expect(validateRoomIconUrl('https://cdn.example.com/icon.png')).toBe('https://cdn.example.com/icon.png');
		expect(validateRoomIconUrl('/files/abc.webp')).toBe('/files/abc.webp');

		expect(() => validateRoomIconUrl('javascript:alert(1)')).toThrow('invalid iconUrl');
		expect(() => validateRoomIconUrl('data:image/png;base64,xxx')).toThrow('invalid iconUrl');
		expect(() => validateRoomIconUrl('/files/../secret')).toThrow('invalid iconUrl');
		expect(() => validateRoomIconUrl('//evil.example/a.png')).toThrow('invalid iconUrl');
	});
});

describe('ChatService messaging, reply validation, archive & mentions', () => {
	test('rejects blank text without file and cross-conversation replyId in rooms', async () => {
		const room = { id: 'r1', ownerId: 'owner1', isArchived: false };
		const otherRoomMsg = { id: 'other_msg', toRoomId: 'r_other', toUserId: null, fromUserId: 'u9' };
		const { service } = createChatServiceHarness({
			rooms: [room],
			messages: [otherRoomMsg],
		});

		await expect(service.createMessageToRoom({ id: 'owner1', host: null }, room as any, { text: '   ' }))
			.rejects.toThrow('content required');

		await expect(service.createMessageToRoom({ id: 'owner1', host: null }, room as any, { text: 'hi', replyId: 'other_msg' }))
			.rejects.toThrow('invalid replyId');

		await expect(service.createMessageToRoom({ id: 'owner1', host: null }, room as any, { text: 'hi', replyId: 'missing' }))
			.rejects.toThrow('invalid replyId');
	});

	test('blocks posting in archived room and reports permanent suspension accurately', async () => {
		const archivedRoom = { id: 'r_arch', ownerId: 'owner1', isArchived: true };
		const activeRoom = { id: 'r_act', ownerId: 'owner1', isArchived: false };
		const { service } = createChatServiceHarness({
			rooms: [archivedRoom, activeRoom],
			memberships: [
				{ id: 'm1', roomId: 'r_act', userId: 'u2', isMuted: false, suspendedUntil: new Date(9999, 0, 1), role: 'member' },
			],
		});

		await expect(service.createMessageToRoom({ id: 'owner1', host: null }, archivedRoom as any, { text: 'hi' }))
			.rejects.toThrow('room is archived');

		try {
			await service.createMessageToRoom({ id: 'u2', host: null }, activeRoom as any, { text: 'hi' });
			expect.unreachable();
		} catch (e: any) {
			expect(e.message).toBe('user has been suspended from this room');
			expect(e.info).toEqual({ remainingMs: null, isPermanent: true });
		}
	});

	test('dispatches chatRoomMention to active non-muted members excluding sender and blockers', async () => {
		const room = { id: 'r1', ownerId: 'owner1', isArchived: false };
		const { service, notificationService } = createChatServiceHarness({
			rooms: [room],
			memberships: [
				{ id: 'm2', roomId: 'r1', userId: 'u2', isMuted: false, suspendedUntil: null, role: 'member' },
				{ id: 'm3', roomId: 'r1', userId: 'u3', isMuted: true, suspendedUntil: null, role: 'member' },
				{ id: 'm4', roomId: 'r1', userId: 'u4', isMuted: false, suspendedUntil: null, role: 'member' },
			],
			users: [
				{ id: 'owner1', usernameLower: 'owner' },
				{ id: 'u2', usernameLower: 'alice' },
				{ id: 'u3', usernameLower: 'muteduser' },
				{ id: 'u4', usernameLower: 'blocker' },
			],
			blockedPairs: [['u4', 'owner1']],
		});

		await service.createMessageToRoom(
			{ id: 'owner1', host: null },
			room as any,
			{ text: 'Hello @alice @alice @muteduser @blocker @owner' },
		);

		expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
		expect(notificationService.createNotification).toHaveBeenCalledWith(
			'u2',
			'chatRoomMention',
			expect.objectContaining({ chatRoomId: 'r1' }),
			'owner1',
		);
	});

	test('editMessage updates text/editedAt and publishes edited event', async () => {
		const room = { id: 'r1', ownerId: 'owner1', isArchived: false };
		const msg = { id: 'msg1', fromUserId: 'u2', toRoomId: 'r1', toUserId: null, text: 'old', editedAt: null };
		const { service, globalEventService } = createChatServiceHarness({
			rooms: [room],
			memberships: [{ id: 'm2', roomId: 'r1', userId: 'u2', isMuted: false, suspendedUntil: null, role: 'member' }],
			messages: [msg],
		});

		const updated = await service.editMessage('u2', 'msg1', '  new text  ');
		expect(updated.text).toBe('new text');
		expect(updated.editedAt).toBeInstanceOf(Date);
		expect(globalEventService.publishChatRoomStream).toHaveBeenCalledWith('r1', 'edited', expect.objectContaining({
			id: 'msg1',
			text: 'new text',
		}));
	});
});

describe('ChatService owner mute, unread events, reactions & moderation', () => {
	test('muteRoom clears unread + emits chatRead; owner cannot leaveRoom', async () => {
		const room = { id: 'r1', ownerId: 'owner1', isArchived: false };
		const { service, memberships, pipelineOps, globalEventService } = createChatServiceHarness({
			rooms: [room],
		});

		await service.muteRoom('owner1', 'r1', false);
		expect(memberships).toHaveLength(0);

		await service.muteRoom('owner1', 'r1', true);
		expect(memberships).toHaveLength(1);
		expect(pipelineOps.some(op => op[0] === 'del' && op[1] === 'newRoomChatMessageExists:owner1:r1')).toBe(true);
		expect(globalEventService.publishMainStream).toHaveBeenCalledWith('owner1', 'chatRead', { hasUnreadChatMessages: false });

		await expect(service.leaveRoom('owner1', 'r1')).rejects.toThrow('owner cannot leave');
	});

	test('react blocks suspended members and deduplicates reactions; unreact skips missing reaction', async () => {
		const room = { id: 'r1', ownerId: 'owner1', isArchived: false };
		const msg = { id: 'msg1', fromUserId: 'owner1', toRoomId: 'r1', toUserId: null, reactions: ['u3/👍'] };
		const { service, globalEventService, chatMessagesRepository } = createChatServiceHarness({
			rooms: [room],
			memberships: [
				{ id: 'm2', roomId: 'r1', userId: 'u2', suspendedUntil: new Date(Date.now() + 60000), role: 'member' },
				{ id: 'm3', roomId: 'r1', userId: 'u3', suspendedUntil: null, role: 'member' },
			],
			messages: [msg],
		});

		await expect(service.react('msg1', 'u2', '👍')).rejects.toThrow('user has been suspended from this room');

		await service.react('msg1', 'u3', '👍');
		expect(chatMessagesRepository.createQueryBuilder).not.toHaveBeenCalled();

		await service.unreact('msg1', 'u3', '❤️');
		expect(globalEventService.publishChatRoomStream).not.toHaveBeenCalled();

		await service.unreact('msg1', 'u3', '👍');
		expect(globalEventService.publishChatRoomStream).toHaveBeenCalledWith('r1', 'unreact', expect.objectContaining({
			messageId: 'msg1',
			reaction: '👍',
		}));

		await expect(service.react('msg1', 'outsider', '👍')).rejects.toBeInstanceOf(ChatMessageAccessError);
	});

	test('banUserFromRoom blocks joinToRoom and createRoomInvitation', async () => {
		const room = { id: 'r1', ownerId: 'owner1', isPublic: true, isArchived: false, allowMemberInvite: false };
		const { service, memberships, bans, globalEventService } = createChatServiceHarness({
			rooms: [room],
			memberships: [{ id: 'm2', roomId: 'r1', userId: 'u2', isMuted: false, suspendedUntil: null, role: 'member' }],
			users: [{ id: 'u2', usernameLower: 'u2' }],
		});

		await service.banUserFromRoom({ id: 'owner1' } as any, 'r1', 'u2', 'spam');
		expect(memberships).toHaveLength(0);
		expect(bans).toHaveLength(1);
		expect(globalEventService.publishChatRoomStream).toHaveBeenCalledWith('r1', 'memberBanned', {
			roomId: 'r1',
			userId: 'u2',
			reason: 'spam',
		});

		await expect(service.joinToRoom('u2', 'r1')).rejects.toThrow('banned');
		await expect(service.createRoomInvitation('owner1', 'r1', 'u2')).rejects.toThrow('banned');
	});

	test('transferRoomOwnership preserves old owner mute and cleans non-muted new owner membership', async () => {
		const room = { id: 'r1', name: 'Room', ownerId: 'owner1', isArchived: false };
		const { service, rooms, memberships, globalEventService } = createChatServiceHarness({
			rooms: [room],
			memberships: [
				{ id: 'm_owner', roomId: 'r1', userId: 'owner1', isMuted: true, suspendedUntil: null, role: 'member' },
				{ id: 'm_new', roomId: 'r1', userId: 'u2', isMuted: false, suspendedUntil: null, role: 'admin' },
			],
		});

		await service.transferRoomOwnership({ id: 'owner1' } as any, 'r1', 'u2');

		expect(rooms[0].ownerId).toBe('u2');
		expect(memberships).toEqual([
			expect.objectContaining({ userId: 'owner1', isMuted: true, role: 'member' }),
		]);
		expect(globalEventService.publishChatRoomStream).toHaveBeenCalledWith('r1', 'ownerTransferred', expect.objectContaining({
			roomId: 'r1',
			oldOwnerId: 'owner1',
			newOwnerId: 'u2',
		}));
		expect(globalEventService.publishChatRoomStream).toHaveBeenCalledWith('r1', 'roomUpdated', expect.any(Object));
	});

	test('roomTimeline re-sorts DESC with sinceId and roomHistory includes 0-message rooms', async () => {
		const { service } = createChatServiceHarness({
			rooms: [
				{ id: 'r_empty', name: 'Empty', ownerId: 'me1', owner: { id: 'me1' } },
			],
			timelineMessages: [
				{ id: 'a1' },
				{ id: 'a3' },
				{ id: 'a2' },
			],
		});

		const tl = await service.roomTimeline('r1', 10, 'a0', null);
		expect(tl.map(m => m.id)).toEqual(['a3', 'a2', 'a1']);

		const history = await service.roomHistory('me1', 10);
		expect(history).toHaveLength(1);
		expect(history[0]).toMatchObject({
			id: 'r_empty',
			toRoomId: 'r_empty',
			text: null,
		});
	});

	test('userHistory paginates deterministically with untilId (and mutedIds)', async () => {
		const queries: { sql: string; params: any[] }[] = [];
		const allConversations = [
			{ otherId: 'u4', messageId: 'm40' },
			{ otherId: 'u3', messageId: 'm30' },
			{ otherId: 'u2', messageId: 'm20' },
			{ otherId: 'u1', messageId: 'm10' },
		];
		const { service } = createChatServiceHarness({
			mutings: [{ muteeId: 'muted1' }],
			timelineMessages: [
				{ id: 'm10', text: '1' },
				{ id: 'm20', text: '2' },
				{ id: 'm30', text: '3' },
				{ id: 'm40', text: '4' },
			],
			queryMessagesImpl: (sql, params) => {
				queries.push({ sql, params });
				// params: [meId, mutedIds, (untilId?), limit]
				const untilId = params.length === 4 ? params[2] : null;
				const limit = params.at(-1);
				return allConversations
					.filter(c => !untilId || c.messageId < untilId)
					.slice(0, limit);
			},
		});

		const page1 = await service.userHistory('me1', 2);
		expect(page1.map(m => m.id)).toEqual(['m40', 'm30']);
		expect(queries[0].sql).not.toContain('HAVING MAX("messageId") <');
		expect(queries[0].params).toEqual(['me1', ['muted1'], 2]);

		const page2 = await service.userHistory('me1', 2, page1.at(-1)!.id);
		expect(page2.map(m => m.id)).toEqual(['m20', 'm10']);
		expect(queries[1].sql).toContain('GROUP BY "otherId" HAVING MAX("messageId") < $3 ORDER BY "messageId" DESC LIMIT $4');
		expect(queries[1].params).toEqual(['me1', ['muted1'], 'm30', 2]);

		const page3 = await service.userHistory('me1', 2, page2.at(-1)!.id);
		expect(page3).toEqual([]);
	});

	test('roomHistory paginates across non-empty and 0-message rooms with untilId without misclassifying earlier non-empty rooms', async () => {
		const { service } = createChatServiceHarness({
			rooms: [
				{ id: 'r1', name: 'R1', ownerId: 'me1', owner: { id: 'me1' } },
				{ id: 'm20', name: 'EmptyMid', ownerId: 'me1', owner: { id: 'me1' } },
				{ id: 'r2', name: 'R2', ownerId: 'me1', owner: { id: 'me1' } },
				{ id: 'm05', name: 'EmptyOld', ownerId: 'me1', owner: { id: 'me1' } },
			],
			historyRaw: [
				{ roomId: 'r1', messageId: 'm30' },
				{ roomId: 'r2', messageId: 'm10' },
			],
			timelineMessages: [
				{ id: 'm30', toRoomId: 'r1', text: 'latest r1' },
				{ id: 'm10', toRoomId: 'r2', text: 'latest r2' },
			],
		});

		const page1 = await service.roomHistory('me1', 2);
		expect(page1.map(m => m.id)).toEqual(['m30', 'm20']);

		const page2 = await service.roomHistory('me1', 2, page1.at(-1)!.id);
		expect(page2.map(m => m.id)).toEqual(['m10', 'm05']);
		expect(page2.some(m => m.toRoomId === 'r1')).toBe(false);

		const page3 = await service.roomHistory('me1', 2, page2.at(-1)!.id);
		expect(page3).toEqual([]);
	});
});
