/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type {
	ChatMessagesRepository,
	ChatRoomBansRepository,
	ChatRoomInvitationsRepository,
	ChatRoomMembershipsRepository,
	ChatRoomsRepository,
	MiChatMessage,
	MiChatRoom,
	MiChatRoomBan,
	MiChatRoomInvitation,
	MiChatRoomMembership,
	MiUser,
} from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from './UserEntityService.js';
import { DriveFileEntityService } from './DriveFileEntityService.js';

type PackedReplySummary = {
	id: string;
	text: string | null;
	fileId: string | null;
	fromUserId: string;
	fromUser: Packed<'UserLite'>;
};

@Injectable()
export class ChatEntityService {
	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.chatMessagesRepository)
		private chatMessagesRepository: ChatMessagesRepository,

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		@Inject(DI.chatRoomBansRepository)
		private chatRoomBansRepository: ChatRoomBansRepository,

		@Inject(DI.chatRoomInvitationsRepository)
		private chatRoomInvitationsRepository: ChatRoomInvitationsRepository,

		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private idService: IdService,
	) {
	}

	@bindThis
	private async packMessageFile(
		message: Pick<MiChatMessage, 'fileId' | 'file'>,
		packedFiles?: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>,
	): Promise<Packed<'DriveFile'> | null> {
		if (message.fileId == null) return null;
		if (packedFiles?.has(message.fileId)) return packedFiles.get(message.fileId) ?? null;
		return await this.driveFileEntityService.packNullable(message.file ?? message.fileId, { withDeleted: true });
	}

	private isReplyInSameConversation(message: MiChatMessage, replyMessage: MiChatMessage): boolean {
		if (message.toRoomId != null) {
			return replyMessage.toRoomId === message.toRoomId;
		}
		if (replyMessage.toRoomId != null) return false;
		return (
			(replyMessage.fromUserId === message.fromUserId && replyMessage.toUserId === message.toUserId) ||
			(replyMessage.fromUserId === message.toUserId && replyMessage.toUserId === message.fromUserId)
		);
	}

	@bindThis
	private async packMessageReply(
		message: MiChatMessage,
		options?: {
			replyMap?: Map<MiChatMessage['id'], MiChatMessage>;
			packedUsers?: Map<MiUser['id'], Packed<'UserLite'>>;
		},
	): Promise<PackedReplySummary | null> {
		if (!message.replyId) return null;

		const replyMessage = message.reply
			?? options?.replyMap?.get(message.replyId)
			?? await this.chatMessagesRepository.findOne({
				where: { id: message.replyId },
				relations: { fromUser: true },
			});

		if (!replyMessage || !this.isReplyInSameConversation(message, replyMessage)) {
			return null;
		}

		const fromUser = options?.packedUsers?.get(replyMessage.fromUserId)
			?? await this.userEntityService.pack(replyMessage.fromUser ?? replyMessage.fromUserId).catch(() => null);
		if (!fromUser) return null;

		return {
			id: replyMessage.id,
			text: replyMessage.text ? (replyMessage.text.length > 50 ? replyMessage.text.slice(0, 50) + '...' : replyMessage.text) : null,
			fileId: replyMessage.fileId ?? null,
			fromUserId: replyMessage.fromUserId,
			fromUser,
		};
	}

	private async batchRepliesAndUsers(
		messages: MiChatMessage[],
		seedUsers: (MiUser | string)[],
		me?: { id: MiUser['id'] },
	): Promise<{
		replyMap: Map<MiChatMessage['id'], MiChatMessage>;
		packedUsers: Map<MiUser['id'], Packed<'UserLite'>>;
	}> {
		const replyIds = [...new Set(
			messages
				.filter(m => m.replyId != null && m.reply == null)
				.map(m => m.replyId!),
		)];

		const replyMessages = replyIds.length > 0
			? await this.chatMessagesRepository.find({
				where: { id: In(replyIds) },
				relations: { fromUser: true },
			})
			: [];

		const replyMap = new Map<MiChatMessage['id'], MiChatMessage>(
			replyMessages.map(r => [r.id, r]),
		);
		for (const m of messages) {
			if (m.reply) {
				replyMap.set(m.reply.id, m.reply);
			}
		}

		const users: (MiUser | string)[] = [...seedUsers];
		const seenUserIds = new Set(users.map(u => typeof u === 'string' ? u : u.id));
		for (const r of replyMap.values()) {
			const uid = r.fromUser ? r.fromUser.id : r.fromUserId;
			if (!seenUserIds.has(uid)) {
				seenUserIds.add(uid);
				users.push(r.fromUser ?? r.fromUserId);
			}
		}

		const packedUsersList = users.length > 0
			? await this.userEntityService.packMany(users, me)
			: [];

		return {
			replyMap,
			packedUsers: new Map(packedUsersList.map(u => [u.id, u])),
		};
	}

	@bindThis
	public async packMessageDetailed(
		src: MiChatMessage['id'] | MiChatMessage,
		me?: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedFiles?: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
				packedUsers?: Map<MiUser['id'], Packed<'UserLite'>>;
				packedRooms?: Map<MiChatMessage['toRoomId'], Packed<'ChatRoom'> | null>;
				replyMap?: Map<MiChatMessage['id'], MiChatMessage>;
				skipToRoom?: boolean;
			};
		},
	): Promise<Packed<'ChatMessage'>> {
		const packedUsers = options?._hint_?.packedUsers;
		const packedFiles = options?._hint_?.packedFiles;
		const packedRooms = options?._hint_?.packedRooms;
		const skipToRoom = options?._hint_?.skipToRoom ?? false;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });

		// userは削除されている可能性があるのでnull許容
		const reactions: { user: Packed<'UserLite'> | null; reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [userId, reaction] = record.split('/');
			reactions.push({
				user: packedUsers?.get(userId) ?? (await this.userEntityService.pack(userId).catch(() => null)),
				reaction,
			});
		}

		const [fromUser, toUser, toRoom, file, reply] = await Promise.all([
			packedUsers?.get(message.fromUserId) ?? this.userEntityService.pack(message.fromUser ?? message.fromUserId, me),
			message.toUserId ? (packedUsers?.get(message.toUserId) ?? this.userEntityService.pack(message.toUser ?? message.toUserId, me)) : Promise.resolve(undefined),
			(!skipToRoom && message.toRoomId) ? (packedRooms?.get(message.toRoomId) ?? this.packRoom(message.toRoom ?? message.toRoomId, me)) : Promise.resolve(undefined),
			this.packMessageFile(message, packedFiles),
			this.packMessageReply(message, { replyMap: options?._hint_?.replyMap, packedUsers }),
		]);

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			editedAt: message.editedAt ? message.editedAt.toISOString() : null,
			text: message.text,
			fromUserId: message.fromUserId,
			fromUser,
			toUserId: message.toUserId,
			toUser,
			toRoomId: message.toRoomId,
			toRoom,
			fileId: message.fileId,
			file,
			replyId: message.replyId ?? null,
			reply,
			reactions: reactions.filter((r): r is { user: Packed<'UserLite'>; reaction: string; } => r.user != null),
		};
	}

	@bindThis
	public async packMessagesDetailed(
		messages: MiChatMessage[],
		me?: { id: MiUser['id'] },
		options?: { skipToRoom?: boolean },
	): Promise<Packed<'ChatMessage'>[]> {
		if (messages.length === 0) return [];

		const excludeMe = (x: MiUser | string) => {
			if (!me) return true;
			if (typeof x === 'string') {
				return x !== me.id;
			} else {
				return x.id !== me.id;
			}
		};

		const users: (MiUser | string)[] = [
			...messages.map((m) => m.fromUser ?? m.fromUserId).filter(excludeMe),
			...messages.map((m) => m.toUser ?? m.toUserId).filter((x): x is MiUser | string => x != null).filter(excludeMe),
		];

		const reactedUserIds = messages.flatMap(x => x.reactions.map(r => r.split('/')[0]));

		for (const reactedUserId of reactedUserIds) {
			if (!users.some(x => typeof x === 'string' ? x === reactedUserId : x.id === reactedUserId)) {
				users.push(reactedUserId);
			}
		}

		const roomTargets = options?.skipToRoom
			? []
			: messages.map(m => m.toRoom ?? m.toRoomId).filter((x): x is MiChatRoom | string => x != null);

		const [{ replyMap, packedUsers }, packedFiles, packedRooms] = await Promise.all([
			this.batchRepliesAndUsers(messages, users, me),
			this.driveFileEntityService.packManyByIdsMap(messages.map(m => m.fileId).filter((id): id is string => id != null), { withDeleted: true }),
			roomTargets.length > 0 && me
				? this.packRooms(roomTargets, me).then(rooms => new Map(rooms.map(r => [r.id, r])))
				: Promise.resolve(new Map<string, Packed<'ChatRoom'> | null>()),
		]);

		return Promise.all(messages.map(message => this.packMessageDetailed(message, me, {
			_hint_: { packedUsers, packedFiles, packedRooms, replyMap, skipToRoom: options?.skipToRoom },
		})));
	}

	@bindThis
	public async packMessageLiteFor1on1(
		src: MiChatMessage['id'] | MiChatMessage,
		options?: {
			_hint_?: {
				packedFiles?: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
				packedUsers?: Map<MiUser['id'], Packed<'UserLite'>>;
				replyMap?: Map<MiChatMessage['id'], MiChatMessage>;
			};
		},
	): Promise<Packed<'ChatMessageLiteFor1on1'>> {
		const packedFiles = options?._hint_?.packedFiles;
		const packedUsers = options?._hint_?.packedUsers;
		const replyMap = options?._hint_?.replyMap;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });

		const reactions: { reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [, reaction] = record.split('/');
			reactions.push({
				reaction,
			});
		}

		const [file, reply] = await Promise.all([
			this.packMessageFile(message, packedFiles),
			this.packMessageReply(message, { replyMap, packedUsers }),
		]);

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			editedAt: message.editedAt ? message.editedAt.toISOString() : null,
			text: message.text,
			fromUserId: message.fromUserId,
			toUserId: message.toUserId!,
			fileId: message.fileId,
			file,
			reactions,
			replyId: message.replyId,
			reply,
		};
	}

	@bindThis
	public async packMessagesLiteFor1on1(
		messages: MiChatMessage[],
	) {
		if (messages.length === 0) return [];

		const [packedFiles, { replyMap, packedUsers }] = await Promise.all([
			this.driveFileEntityService.packManyByIdsMap(messages.map(m => m.fileId).filter((id): id is string => id != null), { withDeleted: true }),
			this.batchRepliesAndUsers(messages, []),
		]);

		return Promise.all(messages.map(message => this.packMessageLiteFor1on1(message, { _hint_: { packedFiles, packedUsers, replyMap } })));
	}

	@bindThis
	public async packMessageLiteForRoom(
		src: MiChatMessage['id'] | MiChatMessage,
		options?: {
			_hint_?: {
				packedFiles?: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
				packedUsers?: Map<MiUser['id'], Packed<'UserLite'>>;
				replyMap?: Map<MiChatMessage['id'], MiChatMessage>;
			};
		},
	): Promise<Packed<'ChatMessageLiteForRoom'>> {
		const packedFiles = options?._hint_?.packedFiles;
		const packedUsers = options?._hint_?.packedUsers;
		const replyMap = options?._hint_?.replyMap;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });

		// userは削除されている可能性があるのでnull許容
		const reactions: { user: Packed<'UserLite'> | null; reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [userId, reaction] = record.split('/');
			reactions.push({
				user: packedUsers?.get(userId) ?? (await this.userEntityService.pack(userId).catch(() => null)),
				reaction,
			});
		}

		const [fromUser, file, reply] = await Promise.all([
			packedUsers?.get(message.fromUserId) ?? this.userEntityService.pack(message.fromUser ?? message.fromUserId),
			this.packMessageFile(message, packedFiles),
			this.packMessageReply(message, { replyMap, packedUsers }),
		]);

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			editedAt: message.editedAt ? message.editedAt.toISOString() : null,
			text: message.text,
			fromUserId: message.fromUserId,
			fromUser,
			toRoomId: message.toRoomId!,
			fileId: message.fileId,
			file,
			reactions: reactions.filter((r): r is { user: Packed<'UserLite'>; reaction: string; } => r.user != null),
			replyId: message.replyId,
			reply,
		};
	}

	@bindThis
	public async packMessagesLiteForRoom(
		messages: MiChatMessage[],
	) {
		if (messages.length === 0) return [];

		const users: (MiUser | string)[] = messages.map(x => x.fromUser ?? x.fromUserId);
		const reactedUserIds = messages.flatMap(x => x.reactions.map(r => r.split('/')[0]));

		for (const reactedUserId of reactedUserIds) {
			if (!users.some(x => typeof x === 'string' ? x === reactedUserId : x.id === reactedUserId)) {
				users.push(reactedUserId);
			}
		}

		const [{ replyMap, packedUsers }, packedFiles] = await Promise.all([
			this.batchRepliesAndUsers(messages, users),
			this.driveFileEntityService.packManyByIdsMap(messages.map(m => m.fileId).filter((id): id is string => id != null), { withDeleted: true }),
		]);

		return Promise.all(messages.map(message => this.packMessageLiteForRoom(message, { _hint_: { packedFiles, packedUsers, replyMap } })));
	}

	@bindThis
	public async packRoom(
		src: MiChatRoom['id'] | MiChatRoom,
		me?: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedOwners: Map<MiUser['id'], Packed<'UserLite'>>;
				myMemberships?: Map<MiChatRoom['id'], MiChatRoomMembership | null | undefined>;
				myInvitations?: Map<MiChatRoom['id'], MiChatRoomInvitation | null | undefined>;
				myBans?: Map<MiChatRoom['id'], MiChatRoomBan | null | undefined>;
				memberCounts?: Map<MiChatRoom['id'], number>;
				unreadCounts?: Map<MiChatRoom['id'], number>;
				packedPinnedMessages?: Map<MiChatMessage['id'], Packed<'ChatMessage'>>;
			};
		},
	): Promise<Packed<'ChatRoom'>> {
		const room = typeof src === 'object' ? src : await this.chatRoomsRepository.findOneByOrFail({ id: src });

		const membership = me ? (options?._hint_?.myMemberships
			? (options._hint_.myMemberships.get(room.id) ?? null)
			: await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId: me.id })) : null;
		const invitation = me && me.id !== room.ownerId ? (options?._hint_?.myInvitations
			? (options._hint_.myInvitations.get(room.id) ?? null)
			: await this.chatRoomInvitationsRepository.findOneBy({ roomId: room.id, userId: me.id, ignored: false })) : null;
		const ban = me && me.id !== room.ownerId ? (options?._hint_?.myBans
			? (options._hint_.myBans.get(room.id) ?? null)
			: await this.chatRoomBansRepository.findOneBy({ roomId: room.id, userId: me.id })) : null;

		const isMember = Boolean(me && (me.id === room.ownerId || membership != null));

		const myRole: 'owner' | 'admin' | 'member' | null = me
			? (me.id === room.ownerId ? 'owner' : membership ? (membership.role ?? 'member') : null)
			: null;

		const memberCount = options?._hint_?.memberCounts?.get(room.id) ?? await (async () => {
			const count = await this.chatRoomMembershipsRepository.createQueryBuilder('m')
				.where('m.roomId = :roomId', { roomId: room.id })
				.andWhere('m.userId <> :ownerId', { ownerId: room.ownerId })
				.getCount();
			return count + 1;
		})();

		const unreadCount = isMember && me
			? (options?._hint_?.unreadCounts?.get(room.id) ?? await (async () => {
				const [marker, count] = await this.redisClient.mget(
					`newRoomChatMessageExists:${me.id}:${room.id}`,
					`unreadRoomChatMessagesCount:${me.id}:${room.id}`,
				);
				if (marker == null) return 0;
				const parsed = count != null ? parseInt(count, 10) : NaN;
				return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
			})())
			: 0;

		const pinnedMessage = room.pinnedMessageId
			? (options?._hint_?.packedPinnedMessages?.get(room.pinnedMessageId) ?? await this.packMessageDetailed(
				room.pinnedMessage ?? room.pinnedMessageId,
				me,
				{ _hint_: { skipToRoom: true } },
			).catch(() => null))
			: null;

		return {
			id: room.id,
			createdAt: this.idService.parse(room.id).date.toISOString(),
			name: room.name,
			description: room.description,
			iconUrl: room.iconUrl ?? null,
			ownerId: room.ownerId,
			owner: options?._hint_?.packedOwners.get(room.ownerId) ?? await this.userEntityService.pack(room.owner ?? room.ownerId, me),
			isPublic: room.isPublic,
			isMember,
			isMuted: membership != null ? membership.isMuted : false,
			invitationExists: !isMember && invitation != null,
			allowMemberInvite: room.allowMemberInvite ?? false,
			announcement: room.announcement ?? null,
			pinnedMessageId: room.pinnedMessageId ?? null,
			pinnedMessage,
			isArchived: room.isArchived ?? false,
			myRole,
			isBanned: ban != null,
			banReason: ban?.reason ?? null,
			memberCount,
			unreadCount,
		};
	}

	@bindThis
	public async packRooms(
		rooms: (MiChatRoom | MiChatRoom['id'])[],
		me: { id: MiUser['id'] },
	): Promise<Packed<'ChatRoom'>[]> {
		if (rooms.length === 0) return [];

		const roomById = new Map<string, MiChatRoom>();
		const missingIds: string[] = [];
		for (const room of rooms) {
			if (typeof room === 'string') {
				if (!roomById.has(room)) missingIds.push(room);
			} else {
				roomById.set(room.id, room);
			}
		}

		if (missingIds.length > 0) {
			const loaded = await this.chatRoomsRepository.find({
				where: { id: In(missingIds) },
				relations: { owner: true },
			});
			for (const room of loaded) {
				roomById.set(room.id, room);
			}
		}

		const orderedRooms = rooms
			.map(r => typeof r === 'string' ? roomById.get(r) : r)
			.filter((r): r is MiChatRoom => r != null);

		if (orderedRooms.length === 0) return [];

		const roomIds = [...new Set(orderedRooms.map(x => x.id))];
		const owners = orderedRooms.map(x => x.owner ?? x.ownerId);
		const pinnedIds = [...new Set(orderedRooms.map(x => x.pinnedMessageId).filter((id): id is string => id != null))];

		const [
			packedOwners,
			myMemberships,
			myInvitations,
			myBans,
			memberCounts,
			unreadCounts,
			packedPinnedMessages,
		] = await Promise.all([
			this.userEntityService.packMany(owners, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.chatRoomMembershipsRepository.find({
				where: {
					roomId: In(roomIds),
					userId: me.id,
				},
			}).then(memberships => new Map(orderedRooms.map(r => [r.id, memberships.find(m => m.roomId === r.id)]))),
			this.chatRoomInvitationsRepository.find({
				where: {
					roomId: In(roomIds),
					userId: me.id,
					ignored: false,
				},
			}).then(invitations => new Map(orderedRooms.map(r => [r.id, invitations.find(i => i.roomId === r.id)]))),
			this.chatRoomBansRepository.find({
				where: {
					roomId: In(roomIds),
					userId: me.id,
				},
			}).then(bans => new Map(orderedRooms.map(r => [r.id, bans.find(b => b.roomId === r.id)]))),
			this.chatRoomMembershipsRepository.createQueryBuilder('m')
				.select('m.roomId', 'roomId')
				.addSelect('COUNT(*)', 'cnt')
				.innerJoin('m.room', 'r')
				.where('m.roomId IN (:...roomIds)', { roomIds })
				.andWhere('m.userId <> r.ownerId')
				.groupBy('m.roomId')
				.getRawMany<{ roomId: string; cnt: string }>()
				.then(rows => new Map(roomIds.map(id => {
					const row = rows.find(r => r.roomId === id);
					return [id, Number(row?.cnt ?? 0) + 1];
				}))),
			(async () => {
				const pipeline = this.redisClient.pipeline();
				for (const id of roomIds) {
					pipeline.get(`newRoomChatMessageExists:${me.id}:${id}`);
					pipeline.get(`unreadRoomChatMessagesCount:${me.id}:${id}`);
				}
				const results = await pipeline.exec();
				const map = new Map<string, number>();
				if (results) {
					for (let i = 0; i < roomIds.length; i++) {
						const marker = results[i * 2]?.[1] as string | null;
						const count = results[i * 2 + 1]?.[1] as string | null;
						if (marker == null) {
							map.set(roomIds[i], 0);
						} else {
							const parsed = count != null ? parseInt(count, 10) : NaN;
							map.set(roomIds[i], Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
						}
					}
				}
				return map;
			})(),
			pinnedIds.length > 0
				? this.chatMessagesRepository.find({
					where: { id: In(pinnedIds) },
					relations: { fromUser: true, file: true },
				}).then(msgs => this.packMessagesDetailed(msgs, me, { skipToRoom: true }))
					.then(packed => new Map(packed.map(p => [p.id, p])))
				: Promise.resolve(new Map<string, Packed<'ChatMessage'>>()),
		]);

		return Promise.all(orderedRooms.map(room => this.packRoom(room, me, {
			_hint_: {
				packedOwners,
				myMemberships,
				myInvitations,
				myBans,
				memberCounts,
				unreadCounts,
				packedPinnedMessages,
			},
		})));
	}

	@bindThis
	public async packRoomInvitation(
		src: MiChatRoomInvitation['id'] | MiChatRoomInvitation,
		me: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedRooms: Map<MiChatRoomInvitation['roomId'], Packed<'ChatRoom'>>;
				packedUsers: Map<MiUser['id'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomInvitation'>> {
		const invitation = typeof src === 'object' ? src : await this.chatRoomInvitationsRepository.findOneByOrFail({ id: src });

		return {
			id: invitation.id,
			createdAt: this.idService.parse(invitation.id).date.toISOString(),
			roomId: invitation.roomId,
			room: options?._hint_?.packedRooms.get(invitation.roomId) ?? (await this.packRoom(invitation.room ?? invitation.roomId, me)),
			userId: invitation.userId,
			user: options?._hint_?.packedUsers.get(invitation.userId) ?? (await this.userEntityService.pack(invitation.user ?? invitation.userId, me)),
		};
	}

	@bindThis
	public async packRoomInvitations(
		invitations: MiChatRoomInvitation[],
		me: { id: MiUser['id'] },
	) {
		if (invitations.length === 0) return [];

		const users = invitations.map(x => x.user ?? x.userId);
		const rooms = invitations.map(x => x.room ?? x.roomId);

		const [packedUsers, packedRooms] = await Promise.all([
			this.userEntityService.packMany(users, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.packRooms(rooms, me)
				.then(rooms => new Map(rooms.map(r => [r.id, r]))),
		]);

		return Promise.all(invitations.map(invitation => this.packRoomInvitation(invitation, me, {
			_hint_: { packedRooms, packedUsers },
		})));
	}

	@bindThis
	public async packRoomMembership(
		src: MiChatRoomMembership['id'] | MiChatRoomMembership,
		me: { id: MiUser['id'] },
		options?: {
			populateUser?: boolean;
			populateRoom?: boolean;
			_hint_?: {
				packedRooms: Map<MiChatRoomMembership['roomId'], Packed<'ChatRoom'>>;
				packedUsers: Map<MiUser['id'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomMembership'>> {
		const membership = typeof src === 'object' ? src : await this.chatRoomMembershipsRepository.findOneByOrFail({ id: src });

		return {
			id: membership.id,
			createdAt: this.idService.parse(membership.id).date.toISOString(),
			userId: membership.userId,
			user: options?.populateUser ? (options._hint_?.packedUsers.get(membership.userId) ?? (await this.userEntityService.pack(membership.user ?? membership.userId, me))) : undefined,
			roomId: membership.roomId,
			room: options?.populateRoom ? (options._hint_?.packedRooms.get(membership.roomId) ?? await this.packRoom(membership.room ?? membership.roomId, me)) : undefined,
			suspendedUntil: membership.suspendedUntil ? membership.suspendedUntil.toISOString() : null,
			role: membership.role ?? 'member',
		};
	}

	@bindThis
	public async packRoomMemberships(
		memberships: MiChatRoomMembership[],
		me: { id: MiUser['id'] },
		options: {
			populateUser?: boolean;
			populateRoom?: boolean;
		} = {},
	) {
		if (memberships.length === 0) return [];

		const users = options.populateUser ? memberships.map(x => x.user ?? x.userId) : [];
		const rooms = options.populateRoom ? memberships.map(x => x.room ?? x.roomId) : [];

		const [packedUsers, packedRooms] = await Promise.all([
			users.length > 0
				? this.userEntityService.packMany(users, me).then(users => new Map(users.map(u => [u.id, u])))
				: Promise.resolve(new Map<string, Packed<'UserLite'>>()),
			rooms.length > 0
				? this.packRooms(rooms, me).then(rooms => new Map(rooms.map(r => [r.id, r])))
				: Promise.resolve(new Map<string, Packed<'ChatRoom'>>()),
		]);

		return Promise.all(memberships.map(membership => this.packRoomMembership(membership, me, { ...options, _hint_: { packedUsers, packedRooms } })));
	}

	@bindThis
	public async packRoomBan(
		src: MiChatRoomBan['id'] | MiChatRoomBan,
		me: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedUsers: Map<MiUser['id'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomBan'>> {
		const ban = typeof src === 'object' ? src : await this.chatRoomBansRepository.findOneByOrFail({ id: src });

		const packedUsers = options?._hint_?.packedUsers;

		const [user, bannedBy] = await Promise.all([
			packedUsers?.get(ban.userId) ?? this.userEntityService.pack(ban.user ?? ban.userId, me),
			ban.bannedById
				? (packedUsers?.get(ban.bannedById) ?? this.userEntityService.pack(ban.bannedBy ?? ban.bannedById, me).catch(() => null))
				: Promise.resolve(null),
		]);

		return {
			id: ban.id,
			createdAt: ban.createdAt.toISOString(),
			roomId: ban.roomId,
			userId: ban.userId,
			user,
			bannedById: ban.bannedById,
			bannedBy,
			reason: ban.reason,
		};
	}

	@bindThis
	public async packRoomBans(
		bans: MiChatRoomBan[],
		me: { id: MiUser['id'] },
	): Promise<Packed<'ChatRoomBan'>[]> {
		if (bans.length === 0) return [];

		const users: (MiUser | string)[] = [];
		const seen = new Set<string>();
		for (const ban of bans) {
			const u = ban.user ?? ban.userId;
			const uid = typeof u === 'string' ? u : u.id;
			if (!seen.has(uid)) {
				seen.add(uid);
				users.push(u);
			}
			if (ban.bannedById) {
				const b = ban.bannedBy ?? ban.bannedById;
				const bid = typeof b === 'string' ? b : b.id;
				if (!seen.has(bid)) {
					seen.add(bid);
					users.push(b);
				}
			}
		}

		const packedUsers = await this.userEntityService.packMany(users, me)
			.then(list => new Map(list.map(u => [u.id, u])));

		return Promise.all(bans.map(ban => this.packRoomBan(ban, me, { _hint_: { packedUsers } })));
	}
}
