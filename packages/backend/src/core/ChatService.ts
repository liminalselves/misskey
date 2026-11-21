/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import * as Redis from 'ioredis';
import * as mfm from 'mfm-js';
import { Brackets, EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { QueueService } from '@/core/QueueService.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { PushNotificationService } from '@/core/PushNotificationService.js';
import { bindThis } from '@/decorators.js';
import type {
	ChatApprovalsRepository,
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
	MiDriveFile,
	MiUser,
	MutingsRepository,
	UsersRepository,
} from '@/models/_.js';
import type { ChatRoomMembershipRole } from '@/models/ChatRoomMembership.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { QueryService } from '@/core/QueryService.js';
import { RoleService } from '@/core/RoleService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { Packed } from '@/misc/json-schema.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { emojiRegex } from '@/misc/emoji-regex.js';
import { extractMentions } from '@/misc/extract-mentions.js';
import { NotificationService } from '@/core/NotificationService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { reconcileUnread } from '@/misc/reconcile-unread.js';

export class ChatMessageAccessError extends Error {}

const MAX_ROOM_MEMBERS = 50;
const MAX_REACTIONS_PER_MESSAGE = 100;
const isCustomEmojiRegexp = /^:([\w+-]+)(?:@\.)?:$/;

// TODO: ReactionServiceのやつと共通化
function normalizeEmojiString(x: string) {
	const match = emojiRegex.exec(x);
	if (match) {
		// 合字を含む1つの絵文字
		const unicode = match[0];

		// 異体字セレクタ除去
		return unicode.match('\u200d') ? unicode : unicode.replace(/\ufe0f/g, '');
	} else {
		throw new Error('invalid emoji');
	}
}

export function validateRoomIconUrl(url: string | null | undefined): string | null {
	if (url == null) return null;
	const trimmed = url.trim();
	if (trimmed === '') return null;

	if (trimmed.startsWith('/files/')) {
		if (/[\r\n\0\\]/.test(trimmed) || trimmed.startsWith('//') || trimmed.includes('..')) {
			throw new Error('invalid iconUrl');
		}
		return trimmed;
	}

	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			throw new Error('invalid iconUrl');
		}
		if (!parsed.hostname) {
			throw new Error('invalid iconUrl');
		}
		return trimmed;
	} catch {
		throw new Error('invalid iconUrl');
	}
}

function isMembershipSuspended(membership: { suspendedUntil: Date | null } | null | undefined): boolean {
	return Boolean(membership?.suspendedUntil && new Date() < membership.suspendedUntil);
}

function buildSuspendedError(suspendedUntil: Date): Error {
	const remainingMs = suspendedUntil.getTime() - Date.now();
	const isPermanent = !Number.isFinite(remainingMs) || suspendedUntil.getUTCFullYear() >= 9999;

	const error: any = new Error('user has been suspended from this room');
	error.info = {
		remainingMs: isPermanent ? null : Math.max(0, remainingMs),
		isPermanent,
	};
	return error;
}

@Injectable()
export class ChatService {
	private readonly logger = new Logger(ChatService.name);

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.chatMessagesRepository)
		private chatMessagesRepository: ChatMessagesRepository,

		@Inject(DI.chatApprovalsRepository)
		private chatApprovalsRepository: ChatApprovalsRepository,

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		@Inject(DI.chatRoomBansRepository)
		private chatRoomBansRepository: ChatRoomBansRepository,

		@Inject(DI.chatRoomInvitationsRepository)
		private chatRoomInvitationsRepository: ChatRoomInvitationsRepository,

		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		private userEntityService: UserEntityService,
		private chatEntityService: ChatEntityService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
		private apRendererService: ApRendererService,
		private queueService: QueueService,
		private pushNotificationService: PushNotificationService,
		private notificationService: NotificationService,
		private userBlockingService: UserBlockingService,
		private queryService: QueryService,
		private roleService: RoleService,
		private userFollowingService: UserFollowingService,
		private customEmojiService: CustomEmojiService,
		private moderationLogService: ModerationLogService,
	) {
	}

	private async runInTransaction<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
		if (this.chatRoomsRepository.manager?.transaction) {
			return this.chatRoomsRepository.manager.transaction(fn);
		}
		return fn({
			getRepository: (entity: any) => {
				if (entity.name === 'MiChatRoom') return this.chatRoomsRepository;
				if (entity.name === 'MiChatRoomMembership') return this.chatRoomMembershipsRepository;
				if (entity.name === 'MiChatRoomInvitation') return this.chatRoomInvitationsRepository;
				if (entity.name === 'MiChatRoomBan') return this.chatRoomBansRepository;
				if (entity.name === 'MiChatMessage') return this.chatMessagesRepository;
				return this.chatRoomsRepository;
			},
		} as unknown as EntityManager);
	}

	private async emitChatRead(userId: MiUser['id']): Promise<void> {
		const hasUnread = await this.hasUnreadMessages(userId);
		this.globalEventService.publishMainStream(userId, 'chatRead', {
			hasUnreadChatMessages: hasUnread,
		});
	}

	private async clearRoomUnreadForUsers(userIds: string[], roomId: MiChatRoom['id']): Promise<void> {
		if (userIds.length === 0) return;
		const redisPipeline = this.redisClient.pipeline();
		for (const userId of userIds) {
			redisPipeline.del(`newRoomChatMessageExists:${userId}:${roomId}`);
			redisPipeline.del(`firstUnreadRoomChatMessage:${userId}:${roomId}`);
			redisPipeline.del(`unreadRoomChatMessagesCount:${userId}:${roomId}`);
			redisPipeline.srem(`newChatMessagesExists:${userId}`, `room:${roomId}`);
		}
		await redisPipeline.exec();
		await Promise.all(userIds.map(userId => this.emitChatRead(userId)));
	}

	private async countNonOwnerMemberships(
		room: MiChatRoom,
		repo: Pick<ChatRoomMembershipsRepository, 'createQueryBuilder'> = this.chatRoomMembershipsRepository,
	): Promise<number> {
		return repo.createQueryBuilder('membership')
			.where('membership.roomId = :roomId', { roomId: room.id })
			.andWhere('membership.userId <> :ownerId', { ownerId: room.ownerId })
			.getCount();
	}

	private async assertRoomModerationPermission(
		initiator: { id: MiUser['id'] },
		room: MiChatRoom,
	): Promise<{ isOwner: boolean; isSiteModerator: boolean }> {
		if (room.ownerId === initiator.id) {
			return { isOwner: true, isSiteModerator: false };
		}
		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId: initiator.id });
		if (membership && membership.role === 'admin' && !isMembershipSuspended(membership)) {
			return { isOwner: false, isSiteModerator: false };
		}
		const isSiteModerator = await this.roleService.isModerator({ id: initiator.id });
		if (isSiteModerator) {
			return { isOwner: false, isSiteModerator: true };
		}
		throw new Error('permission denied');
	}

	@bindThis
	public async getChatAvailability(userId: MiUser['id']): Promise<{ read: boolean; write: boolean; }> {
		const policies = await this.roleService.getUserPolicies(userId);

		switch (policies.chatAvailability) {
			case 'available':
				return {
					read: true,
					write: true,
				};
			case 'readonly':
				return {
					read: true,
					write: false,
				};
			case 'unavailable':
				return {
					read: false,
					write: false,
				};
			default:
				throw new Error('invalid chat availability (unreachable)');
		}
	}

	/** getChatAvailabilityの糖衣。主にAPI呼び出し時に走らせて、権限的に問題ない場合はそのまま続行する */
	@bindThis
	public async checkChatAvailability(userId: MiUser['id'], permission: 'read' | 'write') {
		const policy = await this.getChatAvailability(userId);
		if (policy[permission] === false) {
			throw new Error('ROLE_PERMISSION_DENIED');
		}
	}

	@bindThis
	public async createMessageToUser(fromUser: { id: MiUser['id']; host: MiUser['host']; }, toUser: MiUser, params: {
		text?: string | null;
		file?: MiDriveFile | null;
		uri?: string | null;
		replyId?: string | null;
	}): Promise<Packed<'ChatMessageLiteFor1on1'>> {
		if (fromUser.id === toUser.id) {
			throw new Error('yourself');
		}

		const normalizedText = params.text != null ? params.text.trim() || null : null;
		if (normalizedText == null && params.file == null) {
			throw new Error('content required');
		}

		if (params.replyId != null) {
			const replyTarget = await this.chatMessagesRepository.findOneBy({ id: params.replyId });
			const sameConversation = replyTarget != null
				&& replyTarget.toRoomId == null
				&& (
					(replyTarget.fromUserId === fromUser.id && replyTarget.toUserId === toUser.id) ||
					(replyTarget.fromUserId === toUser.id && replyTarget.toUserId === fromUser.id)
				);
			if (!sameConversation) {
				throw new Error('invalid replyId');
			}
		}

		const approvals = await this.chatApprovalsRepository.createQueryBuilder('approval')
			.where(new Brackets(qb => { // 自分が相手を許可しているか
				qb.where('approval.userId = :fromUserId', { fromUserId: fromUser.id })
					.andWhere('approval.otherId = :toUserId', { toUserId: toUser.id });
			}))
			.orWhere(new Brackets(qb => { // 相手が自分を許可しているか
				qb.where('approval.userId = :toUserId', { toUserId: toUser.id })
					.andWhere('approval.otherId = :fromUserId', { fromUserId: fromUser.id });
			}))
			.take(2)
			.getMany();

		const otherApprovedMe = approvals.some(approval => approval.userId === toUser.id);
		const iApprovedOther = approvals.some(approval => approval.userId === fromUser.id);

		if (!otherApprovedMe) {
			if (toUser.chatScope === 'none') {
				throw new Error('recipient is cannot chat (none)');
			} else if (toUser.chatScope === 'followers') {
				const isFollower = await this.userFollowingService.isFollowing(fromUser.id, toUser.id);
				if (!isFollower) {
					throw new Error('recipient is cannot chat (followers)');
				}
			} else if (toUser.chatScope === 'following') {
				const isFollowing = await this.userFollowingService.isFollowing(toUser.id, fromUser.id);
				if (!isFollowing) {
					throw new Error('recipient is cannot chat (following)');
				}
			} else if (toUser.chatScope === 'mutual') {
				const isMutual = await this.userFollowingService.isMutual(fromUser.id, toUser.id);
				if (!isMutual) {
					throw new Error('recipient is cannot chat (mutual)');
				}
			}
		}

		if (!(await this.getChatAvailability(toUser.id)).write) {
			throw new Error('recipient is cannot chat (policy)');
		}

		const blocked = await this.userBlockingService.checkBlocked(toUser.id, fromUser.id);
		if (blocked) {
			throw new Error('blocked');
		}

		const message = {
			id: this.idService.gen(),
			fromUserId: fromUser.id,
			toUserId: toUser.id,
			text: normalizedText,
			fileId: params.file ? params.file.id : null,
			reads: [],
			uri: params.uri ?? null,
			replyId: params.replyId ?? null,
		} satisfies Partial<MiChatMessage>;

		const inserted = await this.chatMessagesRepository.insertOne(message);

		// 相手を許可しておく
		if (!iApprovedOther) {
			await this.chatApprovalsRepository.createQueryBuilder().insert().values({
				id: this.idService.gen(),
				userId: fromUser.id,
				otherId: toUser.id,
			}).orIgnore().execute();
		}

		const packedMessage = await this.chatEntityService.packMessageLiteFor1on1(inserted);

		if (this.userEntityService.isLocalUser(toUser)) {
			const redisPipeline = this.redisClient.multi();
			redisPipeline.set(`newUserChatMessageExists:${toUser.id}:${fromUser.id}`, message.id);
			// 首条未读 id：仅在上一批未读被清空后（键不存在）写入，已读时随标记一起删除
			redisPipeline.set(`firstUnreadUserChatMessage:${toUser.id}:${fromUser.id}`, message.id, 'NX');
			redisPipeline.incr(`unreadUserChatMessagesCount:${toUser.id}:${fromUser.id}`);
			redisPipeline.sadd(`newChatMessagesExists:${toUser.id}`, `user:${fromUser.id}`);
			await redisPipeline.exec();
		}

		if (this.userEntityService.isLocalUser(fromUser)) {
			// 自分のストリーム
			this.globalEventService.publishChatUserStream(fromUser.id, toUser.id, 'message', packedMessage);
		}

		if (this.userEntityService.isLocalUser(toUser)) {
			// 相手のストリーム
			this.globalEventService.publishChatUserStream(toUser.id, fromUser.id, 'message', packedMessage);
		}

		// 3秒経っても既読にならなかったらイベント発行
		if (this.userEntityService.isLocalUser(toUser)) {
			setTimeout(() => {
				void (async () => {
					const marker = await this.redisClient.get(`newUserChatMessageExists:${toUser.id}:${fromUser.id}`);
					if (marker !== message.id) return;
					const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted, toUser);
					this.globalEventService.publishMainStream(toUser.id, 'newChatMessage', packedMessageForTo);
					await this.pushNotificationService.pushNotification(toUser.id, 'newChatMessage', packedMessageForTo);
				})().catch(error => this.logger.error('Delayed direct message notification failed', error));
			}, 3000);
		}

		return packedMessage;
	}

	@bindThis
	public async createMessageToRoom(fromUser: { id: MiUser['id']; host: MiUser['host']; }, toRoom: MiChatRoom, params: {
		text?: string | null;
		file?: MiDriveFile | null;
		uri?: string | null;
		replyId?: string | null;
	}): Promise<Packed<'ChatMessageLiteForRoom'>> {
		if (toRoom.isArchived) {
			throw new Error('room is archived');
		}

		const normalizedText = params.text != null ? params.text.trim() || null : null;
		if (normalizedText == null && params.file == null) {
			throw new Error('content required');
		}

		const membershipByUserId = new Map<MiUser['id'], { userId: MiUser['id']; isMuted: boolean; suspendedUntil: Date | null }>();
		for (const m of await this.chatRoomMembershipsRepository.findBy({ roomId: toRoom.id })) {
			membershipByUserId.set(m.userId, {
				userId: m.userId,
				isMuted: m.isMuted,
				suspendedUntil: m.suspendedUntil,
			});
		}
		if (!membershipByUserId.has(toRoom.ownerId)) {
			// ownerは通常 membership レコードを持たないが、ミュート等で作成された場合は上のループに含まれる
			membershipByUserId.set(toRoom.ownerId, {
				userId: toRoom.ownerId,
				isMuted: false,
				suspendedUntil: null,
			});
		}
		const memberships = [...membershipByUserId.values()];

		const me = memberships.find(member => member.userId === fromUser.id);
		if (!me) {
			throw new Error('you are not a member of the room');
		}

		if (fromUser.id !== toRoom.ownerId && isMembershipSuspended(me)) {
			throw buildSuspendedError(me.suspendedUntil!);
		}

		if (params.replyId != null) {
			const replyTarget = await this.chatMessagesRepository.findOneBy({ id: params.replyId });
			if (!replyTarget || replyTarget.toRoomId !== toRoom.id) {
				throw new Error('invalid replyId');
			}
		}

		const membershipsOtherThanMe = memberships.filter(member => member.userId !== fromUser.id);

		const message = {
			id: this.idService.gen(),
			fromUserId: fromUser.id,
			toRoomId: toRoom.id,
			text: normalizedText,
			fileId: params.file ? params.file.id : null,
			reads: [],
			uri: params.uri ?? null,
			replyId: params.replyId ?? null,
		} satisfies Partial<MiChatMessage>;

		const inserted = await this.chatMessagesRepository.insertOne(message);

		const packedMessage = await this.chatEntityService.packMessageLiteForRoom(inserted);

		const redisPipeline = this.redisClient.multi();
		for (const membership of membershipsOtherThanMe) {
			if (membership.isMuted) continue;

			redisPipeline.set(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`, message.id);
			redisPipeline.set(`firstUnreadRoomChatMessage:${membership.userId}:${toRoom.id}`, message.id, 'NX');
			redisPipeline.incr(`unreadRoomChatMessagesCount:${membership.userId}:${toRoom.id}`);
			redisPipeline.sadd(`newChatMessagesExists:${membership.userId}`, `room:${toRoom.id}`);
		}
		await redisPipeline.exec();

		this.globalEventService.publishChatRoomStream(toRoom.id, 'message', packedMessage);

		// @mention 通知（活跃且未静音的群成员，含群主）
		if (normalizedText) {
			await this.sendRoomMentionNotifications(fromUser.id, toRoom, inserted.id, normalizedText, membershipsOtherThanMe);
		}

		// 3秒経っても既読にならなかったらイベント発行
		setTimeout(() => {
			void (async () => {
				const redisPipeline = this.redisClient.pipeline();
				for (const membership of membershipsOtherThanMe) {
					redisPipeline.get(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`);
				}
				const markers = await redisPipeline.exec();
				if (markers == null) throw new Error('redis error');
				if (markers.every(marker => marker[1] !== message.id)) return;
				const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted);
				await Promise.all(membershipsOtherThanMe.map(async (membership, i) => {
					if (markers[i][1] !== message.id) return;
					this.globalEventService.publishMainStream(membership.userId, 'newChatMessage', packedMessageForTo);
					await this.pushNotificationService.pushNotification(membership.userId, 'newChatMessage', packedMessageForTo);
				}));
			})().catch(error => this.logger.error('Delayed room message notification failed', error));
		}, 3000);

		return packedMessage;
	}

	private async sendRoomMentionNotifications(
		senderId: MiUser['id'],
		room: MiChatRoom,
		messageId: MiChatMessage['id'],
		text: string,
		membershipsOtherThanMe: { userId: MiUser['id']; isMuted: boolean }[],
	): Promise<void> {
		try {
			const nodes = mfm.parse(text);
			const mentions = extractMentions(nodes);
			if (mentions.length === 0) return;

			const localHost = this.config.host?.toLowerCase();
			const targetUsernames = new Set<string>();
			for (const mention of mentions) {
				if (mention.host != null && localHost && mention.host.toLowerCase() !== localHost) continue;
				if (mention.host != null && !localHost) continue;
				targetUsernames.add(mention.username.toLowerCase());
			}
			if (targetUsernames.size === 0) return;

			const activeCandidateIds = membershipsOtherThanMe
				.filter(m => !m.isMuted && m.userId !== senderId)
				.map(m => m.userId);
			if (activeCandidateIds.length === 0) return;

			const memberUsers = await this.usersRepository.createQueryBuilder('user')
				.select(['user.id', 'user.usernameLower'])
				.where('user.id IN (:...ids)', { ids: activeCandidateIds })
				.andWhere('user.host IS NULL')
				.andWhere('user.usernameLower IN (:...usernames)', { usernames: [...targetUsernames] })
				.getMany();

			for (const target of memberUsers) {
				const blocked = await this.userBlockingService.checkBlocked(target.id, senderId);
				if (blocked) continue;
				this.notificationService.createNotification(target.id, 'chatRoomMention', {
					chatRoomId: room.id,
					messageId,
				}, senderId);
			}
		} catch (err) {
			this.logger.warn(`Failed to dispatch room mention notifications: ${String(err)}`);
		}
	}

	@bindThis
	public async readUserChatMessage(
		readerId: MiUser['id'],
		senderId: MiUser['id'],
	): Promise<void> {
		const redisPipeline = this.redisClient.multi();
		redisPipeline.del(`newUserChatMessageExists:${readerId}:${senderId}`);
		redisPipeline.del(`firstUnreadUserChatMessage:${readerId}:${senderId}`);
		redisPipeline.del(`unreadUserChatMessagesCount:${readerId}:${senderId}`);
		redisPipeline.srem(`newChatMessagesExists:${readerId}`, `user:${senderId}`);
		await redisPipeline.exec();
		await this.emitChatRead(readerId);
	}

	@bindThis
	public async readRoomChatMessage(
		readerId: MiUser['id'],
		roomId: MiChatRoom['id'],
	): Promise<void> {
		const redisPipeline = this.redisClient.multi();
		redisPipeline.del(`newRoomChatMessageExists:${readerId}:${roomId}`);
		redisPipeline.del(`firstUnreadRoomChatMessage:${readerId}:${roomId}`);
		redisPipeline.del(`unreadRoomChatMessagesCount:${readerId}:${roomId}`);
		redisPipeline.srem(`newChatMessagesExists:${readerId}`, `room:${roomId}`);
		await redisPipeline.exec();
		await this.emitChatRead(readerId);
	}

	@bindThis
	public async readAllChatMessages(
		readerId: MiUser['id'],
	): Promise<void> {
		// 汇总集合的成员即各会话标记，逐一清除（含未读计数/首条未读），避免 history 仍显示未读
		const members = await this.redisClient.smembers(`newChatMessagesExists:${readerId}`);
		if (members.length > 0) {
			const redisPipeline = this.redisClient.multi();
			for (const member of members) {
				redisPipeline.srem(`newChatMessagesExists:${readerId}`, member);
				const sep = member.indexOf(':');
				const kind = member.slice(0, sep);
				const id = member.slice(sep + 1);
				if (kind === 'user') {
					redisPipeline.del(`newUserChatMessageExists:${readerId}:${id}`);
					redisPipeline.del(`firstUnreadUserChatMessage:${readerId}:${id}`);
					redisPipeline.del(`unreadUserChatMessagesCount:${readerId}:${id}`);
				} else if (kind === 'room') {
					redisPipeline.del(`newRoomChatMessageExists:${readerId}:${id}`);
					redisPipeline.del(`firstUnreadRoomChatMessage:${readerId}:${id}`);
					redisPipeline.del(`unreadRoomChatMessagesCount:${readerId}:${id}`);
				}
			}
			await redisPipeline.exec();
		}
		await this.emitChatRead(readerId);
	}

	@bindThis
	public findMessageById(messageId: MiChatMessage['id']) {
		return this.chatMessagesRepository.findOneBy({ id: messageId });
	}

	@bindThis
	public findMyMessageById(userId: MiUser['id'], messageId: MiChatMessage['id']) {
		return this.chatMessagesRepository.findOneBy({ id: messageId, fromUserId: userId });
	}

	/**
	 * 群主/群管理员/全站版主查找群组中的消息用于删除
	 */
	@bindThis
	public async findRoomMessageByIdForOwner(userId: MiUser['id'], messageId: MiChatMessage['id']) {
		const message = await this.chatMessagesRepository.findOne({
			where: { id: messageId },
		});

		if (!message || !message.toRoomId) return null;

		const room = await this.chatRoomsRepository.findOneBy({ id: message.toRoomId });
		if (!room) return null;

		if (room.ownerId === userId) return message;

		if (await this.roleService.isModerator({ id: userId })) return message;

		// 群管理员可删除普通成员的消息，但不能删除群主或其他管理员的消息
		const actorMembership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId });
		if (actorMembership?.role === 'admin' && !isMembershipSuspended(actorMembership)) {
			if (message.fromUserId === room.ownerId) return null;
			const senderMembership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId: message.fromUserId });
			if (senderMembership?.role === 'admin') return null;
			return message;
		}

		return null;
	}

	@bindThis
	public async hasPermissionToViewRoomTimeline(meId: MiUser['id'], room: MiChatRoom) {
		if (await this.isRoomMember(room, meId)) {
			return true;
		} else {
			const iAmModerator = await this.roleService.isModerator({ id: meId });
			if (iAmModerator) {
				return true;
			}

			return false;
		}
	}

	@bindThis
	public async editMessage(userId: MiUser['id'], messageId: MiChatMessage['id'], rawText: string): Promise<MiChatMessage> {
		const text = rawText.trim();
		if (!text) {
			throw new Error('content required');
		}

		const message = await this.chatMessagesRepository.findOneBy({ id: messageId });
		if (!message || message.fromUserId !== userId) {
			throw new Error('no such message');
		}

		if (message.toRoomId) {
			const room = await this.chatRoomsRepository.findOneBy({ id: message.toRoomId });
			if (!room) {
				throw new Error('no such room');
			}
			if (room.isArchived) {
				throw new Error('room is archived');
			}
			if (room.ownerId !== userId) {
				const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId });
				if (!membership) {
					throw new Error('you are not a member of the room');
				}
				if (isMembershipSuspended(membership)) {
					throw buildSuspendedError(membership.suspendedUntil!);
				}
			}
		}

		const editedAt = new Date();
		await this.chatMessagesRepository.update(message.id, { text, editedAt });
		const updated = await this.chatMessagesRepository.findOne({
			where: { id: message.id },
			relations: { fromUser: true, toUser: true, toRoom: true, file: true },
		}) ?? { ...message, text, editedAt };

		if (message.toRoomId) {
			const packedLite = await this.chatEntityService.packMessageLiteForRoom(updated);
			this.globalEventService.publishChatRoomStream(message.toRoomId, 'edited', packedLite);
		} else if (message.toUserId) {
			const [fromUser, toUser] = await Promise.all([
				this.usersRepository.findOneBy({ id: message.fromUserId }),
				this.usersRepository.findOneBy({ id: message.toUserId }),
			]);
			const packedLite = await this.chatEntityService.packMessageLiteFor1on1(updated);
			if (fromUser && this.userEntityService.isLocalUser(fromUser)) {
				this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId, 'edited', packedLite);
			}
			if (toUser && this.userEntityService.isLocalUser(toUser)) {
				this.globalEventService.publishChatUserStream(message.toUserId, message.fromUserId, 'edited', packedLite);
			}
		}

		return updated;
	}

	@bindThis
	public async deleteMessage(message: MiChatMessage) {
		let wasPinned = false;
		if (message.toRoomId) {
			const roomBefore = await this.chatRoomsRepository.findOneBy({ id: message.toRoomId });
			wasPinned = roomBefore?.pinnedMessageId === message.id;
		}

		await this.chatMessagesRepository.delete(message.id);

		if (message.toUserId) {
			const [fromUser, toUser] = await Promise.all([
				this.usersRepository.findOneByOrFail({ id: message.fromUserId }),
				this.usersRepository.findOneByOrFail({ id: message.toUserId }),
			]);

			if (this.userEntityService.isLocalUser(fromUser)) this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId, 'deleted', message.id);
			if (this.userEntityService.isLocalUser(toUser)) {
				await this.reconcileUnreadMessages(message.toUserId, 'user', message.fromUserId);
				this.globalEventService.publishChatUserStream(message.toUserId, message.fromUserId, 'deleted', message.id);
			}

			if (this.userEntityService.isLocalUser(fromUser) && this.userEntityService.isRemoteUser(toUser)) {
				//const activity = this.apRendererService.addContext(this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${message.id}`), fromUser));
				//this.queueService.deliver(fromUser, activity, toUser.inbox);
			}
		} else if (message.toRoomId) {
			const [room, memberships] = await Promise.all([
				this.chatRoomsRepository.findOneBy({ id: message.toRoomId }),
				this.chatRoomMembershipsRepository.findBy({ roomId: message.toRoomId }),
			]);
			const readers = new Set(memberships.map(m => m.userId));
			if (room) readers.add(room.ownerId);
			await Promise.all([...readers].map(readerId => this.reconcileUnreadMessages(readerId, 'room', message.toRoomId!)));
			this.globalEventService.publishChatRoomStream(message.toRoomId, 'deleted', message.id);
			if (wasPinned && room) {
				this.globalEventService.publishChatRoomStream(message.toRoomId, 'pinnedMessageUpdated', {
					roomId: message.toRoomId,
					pinnedMessageId: null,
					pinnedMessage: null,
				});
			}
		}
	}

	private async reconcileUnreadMessages(readerId: string, kind: 'user' | 'room', conversationId: string): Promise<void> {
		const prefix = kind === 'user' ? 'User' : 'Room';
		await reconcileUnread(this.redisClient, [
			`new${prefix}ChatMessageExists:${readerId}:${conversationId}`,
			`firstUnread${prefix}ChatMessage:${readerId}:${conversationId}`,
			`unread${prefix}ChatMessagesCount:${readerId}:${conversationId}`,
			`newChatMessagesExists:${readerId}`,
		], `${kind}:${conversationId}`, async (first, last) => {
			const query = this.chatMessagesRepository.createQueryBuilder('message')
				.select('COUNT(*)', 'count').addSelect('MIN(message.id)', 'first').addSelect('MAX(message.id)', 'last')
				.where('message.id >= :first AND message.id <= :last', { first, last });
			if (kind === 'user') {
				query.andWhere('message.toUserId = :readerId AND message.fromUserId = :conversationId', { readerId, conversationId });
			} else {
				query.andWhere('message.toRoomId = :conversationId AND message.fromUserId <> :readerId', { readerId, conversationId });
			}
			const result = await query.getRawOne<{ count: string; first: string | null; last: string | null }>();
			return { count: Number(result?.count ?? 0), first: result?.first ?? null, last: result?.last ?? null };
		});
		await this.emitChatRead(readerId);
	}

	@bindThis
	public async userTimeline(meId: MiUser['id'], otherId: MiUser['id'], limit: number, sinceId?: MiChatMessage['id'] | null, untilId?: MiChatMessage['id'] | null) {
		// Use two separate queries instead of OR - each uses index (fromUserId, toUserId, id DESC) directly.
		// OR causes PostgreSQL to prefer PK scan on large tables (4M+ rows), leading to statement timeout.
		const q1 = this.queryService.makePaginationQuery(
			this.chatMessagesRepository.createQueryBuilder('message')
				.where('message.fromUserId = :meId', { meId })
				.andWhere('message.toUserId = :otherId', { otherId }),
			sinceId, untilId,
		);
		const q2 = this.queryService.makePaginationQuery(
			this.chatMessagesRepository.createQueryBuilder('message')
				.where('message.fromUserId = :otherId', { otherId })
				.andWhere('message.toUserId = :meId', { meId }),
			sinceId, untilId,
		);

		const [messages1, messages2] = await Promise.all([
			q1.take(limit).getMany(),
			q2.take(limit).getMany(),
		]);

		const merged = [...messages1, ...messages2]
			.sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0))
			.slice(0, limit);

		return merged;
	}

	@bindThis
	public async roomTimeline(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatMessage['id'] | null, untilId?: MiChatMessage['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatMessagesRepository.createQueryBuilder('message'), sinceId, untilId)
			.andWhere('message.toRoomId = :roomId', { roomId })
			.leftJoinAndSelect('message.file', 'file')
			.leftJoinAndSelect('message.fromUser', 'fromUser');

		const messages = await query.limit(limit).getMany();

		if (sinceId && !untilId) {
			messages.sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));
		}

		return messages;
	}

	@bindThis
	public async userHistory(meId: MiUser['id'], limit: number): Promise<MiChatMessage[]> {
		// Optimization: pre-load muted user IDs once to avoid repeated correlated subqueries.
		const mutedIds = await this.mutingsRepository.find({
			where: { muterId: meId },
			select: { muteeId: true },
		}).then(xs => xs.map(x => x.muteeId));

		// Optimization: use UNION ALL instead of OR so each branch can leverage its
		// covering partial index (IDX_chat_message_1on1_from / _to, migration/1784200000000):
		// (fromUserId|toUserId, otherId, id DESC) WHERE toRoomId IS NULL.
		// Each branch scans only one side (sent / received) index-only, GROUP BY needs no heap fetch.
		const hasMuting = mutedIds.length > 0;
		// When muting exists: $1=meId, $2=mutedIds(varchar[]), $3=limit
		// Otherwise:          $1=meId, $2=limit
		const limitParam = hasMuting ? '$3' : '$2';
		const muteClauseSent = hasMuting ? ' AND "toUserId" <> ALL($2::varchar[])' : '';
		const muteClauseRecv = hasMuting ? ' AND "fromUserId" <> ALL($2::varchar[])' : '';

		// Branch 1: messages I sent → conversation partner is toUserId
		const sentSql = `SELECT "toUserId" AS "otherId", MAX("id") AS "messageId"`
			+ ` FROM "chat_message"`
			+ ` WHERE "fromUserId" = $1 AND "toRoomId" IS NULL${muteClauseSent}`
			+ ` GROUP BY "toUserId"`;

		// Branch 2: messages I received → conversation partner is fromUserId
		const recvSql = `SELECT "fromUserId" AS "otherId", MAX("id") AS "messageId"`
			+ ` FROM "chat_message"`
			+ ` WHERE "toUserId" = $1 AND "toRoomId" IS NULL${muteClauseRecv}`
			+ ` GROUP BY "fromUserId"`;

		const sql = `SELECT "otherId", MAX("messageId") AS "messageId"`
			+ ` FROM (${sentSql} UNION ALL ${recvSql}) AS combined`
			+ ` GROUP BY "otherId" ORDER BY "messageId" DESC LIMIT ${limitParam}`;

		const params = hasMuting ? [meId, mutedIds, limit] : [meId, limit];
		const rows = await this.chatMessagesRepository.query(sql, params) as { otherId: string; messageId: string }[];

		return this.findMessagesPreservingOrder(rows.map(row => row.messageId));
	}

	@bindThis
	public async roomHistory(meId: MiUser['id'], limit: number): Promise<MiChatMessage[]> {
		const [memberRoomIds, ownedRooms] = await Promise.all([
			this.chatRoomMembershipsRepository.findBy({
				userId: meId,
			}).then(xs => xs.map(x => x.roomId)),
			this.chatRoomsRepository.find({
				where: { ownerId: meId },
				relations: { owner: true },
			}),
		]);

		const ownedById = new Map(ownedRooms.map(r => [r.id, r]));
		const roomIds = [...new Set(memberRoomIds.concat(ownedRooms.map(r => r.id)))];

		if (roomIds.length === 0) {
			return [];
		}

		const rows = await this.chatMessagesRepository.createQueryBuilder('message')
			.select('message.toRoomId', 'roomId')
			.addSelect('MAX("message"."id")', 'messageId')
			.where('message.toRoomId IN (:...roomIds)', { roomIds })
			.groupBy('message.toRoomId')
			.orderBy('"messageId"', 'DESC')
			.limit(limit)
			.getRawMany<{ roomId: MiChatRoom['id']; messageId: MiChatMessage['id'] }>();

		const roomsWithMessages = new Set(rows.map(r => r.roomId));
		const emptyRoomIds = roomIds.filter(id => !roomsWithMessages.has(id));

		const [messages, missingEmptyRooms] = await Promise.all([
			this.findMessagesPreservingOrder(rows.map(row => row.messageId)),
			emptyRoomIds.filter(id => !ownedById.has(id)).length > 0
				? this.chatRoomsRepository.createQueryBuilder('room')
					.leftJoinAndSelect('room.owner', 'owner')
					.where('room.id IN (:...ids)', { ids: emptyRoomIds.filter(id => !ownedById.has(id)) })
					.getMany()
				: Promise.resolve([] as MiChatRoom[]),
		]);

		const emptyRoomMap = new Map<string, MiChatRoom>();
		for (const r of ownedRooms) {
			if (!roomsWithMessages.has(r.id)) emptyRoomMap.set(r.id, r);
		}
		for (const r of missingEmptyRooms) {
			emptyRoomMap.set(r.id, r);
		}

		// 对于尚无消息的已加入/拥有群聊，合成占位条目使 chat/history 能返回该群聊
		const syntheticEntries: MiChatMessage[] = [];
		for (const room of emptyRoomMap.values()) {
			syntheticEntries.push({
				id: room.id,
				fromUserId: room.ownerId,
				fromUser: room.owner,
				toUserId: null,
				toUser: null,
				toRoomId: room.id,
				toRoom: room,
				text: null,
				uri: null,
				reads: [],
				fileId: null,
				file: null,
				reactions: [],
				replyId: null,
				reply: null,
				editedAt: null,
			});
		}

		return [...messages, ...syntheticEntries]
			.sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0))
			.slice(0, limit);
	}

	private async findMessagesPreservingOrder(messageIds: MiChatMessage['id'][]): Promise<MiChatMessage[]> {
		if (messageIds.length === 0) return [];
		const messages = await this.chatMessagesRepository.createQueryBuilder('message')
			.where('message.id IN (:...messageIds)', { messageIds })
			.getMany();
		const map = new Map(messages.map(message => [message.id, message]));
		return messageIds
			.map(id => map.get(id))
			.filter((message): message is MiChatMessage => message != null);
	}

	@bindThis
	public async getUserReadStateMap(userId: MiUser['id'], otherIds: MiUser['id'][]) {
		const readStateMap: Record<MiUser['id'], boolean> = {};
		if (otherIds.length === 0) return readStateMap;

		const redisPipeline = this.redisClient.pipeline();

		for (const otherId of otherIds) {
			redisPipeline.get(`newUserChatMessageExists:${userId}:${otherId}`);
		}

		const markers = await redisPipeline.exec();
		if (markers == null) throw new Error('redis error');

		for (let i = 0; i < otherIds.length; i++) {
			const marker = markers[i][1];
			readStateMap[otherIds[i]] = marker == null;
		}

		return readStateMap;
	}

	@bindThis
	public async getRoomReadStateMap(userId: MiUser['id'], roomIds: MiChatRoom['id'][]) {
		const readStateMap: Record<MiChatRoom['id'], boolean> = {};
		if (roomIds.length === 0) return readStateMap;

		const redisPipeline = this.redisClient.pipeline();

		for (const roomId of roomIds) {
			redisPipeline.get(`newRoomChatMessageExists:${userId}:${roomId}`);
		}

		const markers = await redisPipeline.exec();
		if (markers == null) throw new Error('redis error');

		for (let i = 0; i < roomIds.length; i++) {
			const marker = markers[i][1];
			readStateMap[roomIds[i]] = marker == null;
		}

		return readStateMap;
	}

	@bindThis
	public async hasUnreadMessages(userId: MiUser['id']) {
		const card = await this.redisClient.scard(`newChatMessagesExists:${userId}`);
		return card > 0;
	}

	/**
	 * 单个 1on1 会话的未读详情。count 为 null 表示有未读但条数未知
	 * （未读标记早于计数键引入，存量数据没有计数，已读后自愈）。
	 */
	@bindThis
	public async getUserChatUnreadInfo(userId: MiUser['id'], otherId: MiUser['id']): Promise<{ count: number | null; firstUnreadId: MiChatMessage['id'] | null }> {
		const [marker, count, firstUnreadId] = await this.redisClient.mget(
			`newUserChatMessageExists:${userId}:${otherId}`,
			`unreadUserChatMessagesCount:${userId}:${otherId}`,
			`firstUnreadUserChatMessage:${userId}:${otherId}`,
		);
		if (marker == null) return { count: 0, firstUnreadId: null };
		return {
			count: count == null ? null : parseInt(count, 10),
			firstUnreadId,
		};
	}

	/** 单个群聊会话的未读详情（语义同 getUserChatUnreadInfo） */
	@bindThis
	public async getRoomChatUnreadInfo(userId: MiUser['id'], roomId: MiChatRoom['id']): Promise<{ count: number | null; firstUnreadId: MiChatMessage['id'] | null }> {
		const [marker, count, firstUnreadId] = await this.redisClient.mget(
			`newRoomChatMessageExists:${userId}:${roomId}`,
			`unreadRoomChatMessagesCount:${userId}:${roomId}`,
			`firstUnreadRoomChatMessage:${userId}:${roomId}`,
		);
		if (marker == null) return { count: 0, firstUnreadId: null };
		return {
			count: count == null ? null : parseInt(count, 10),
			firstUnreadId,
		};
	}

	/** history 用：批量取未读条数。仅在有未读标记时会话才有意义（无标记时计数键已被删除，返回 null） */
	@bindThis
	public async getUserUnreadCountMap(userId: MiUser['id'], otherIds: MiUser['id'][]): Promise<Record<MiUser['id'], number | null>> {
		const countMap: Record<MiUser['id'], number | null> = {};
		if (otherIds.length === 0) return countMap;

		const redisPipeline = this.redisClient.pipeline();
		for (const otherId of otherIds) {
			redisPipeline.get(`unreadUserChatMessagesCount:${userId}:${otherId}`);
		}
		const counts = await redisPipeline.exec();
		if (counts == null) throw new Error('redis error');

		for (let i = 0; i < otherIds.length; i++) {
			const raw = counts[i][1] as string | null;
			countMap[otherIds[i]] = raw == null ? null : parseInt(raw, 10);
		}
		return countMap;
	}

	/** history 用：批量取群聊未读条数（语义同 getUserUnreadCountMap） */
	@bindThis
	public async getRoomUnreadCountMap(userId: MiUser['id'], roomIds: MiChatRoom['id'][]): Promise<Record<MiChatRoom['id'], number | null>> {
		const countMap: Record<MiChatRoom['id'], number | null> = {};
		if (roomIds.length === 0) return countMap;

		const redisPipeline = this.redisClient.pipeline();
		for (const roomId of roomIds) {
			redisPipeline.get(`unreadRoomChatMessagesCount:${userId}:${roomId}`);
		}
		const counts = await redisPipeline.exec();
		if (counts == null) throw new Error('redis error');

		for (let i = 0; i < roomIds.length; i++) {
			const raw = counts[i][1] as string | null;
			countMap[roomIds[i]] = raw == null ? null : parseInt(raw, 10);
		}
		return countMap;
	}

	@bindThis
	public async createRoom(owner: MiUser, params: {
		name: string;
		description?: string;
		isPublic?: boolean;
		iconUrl?: string | null;
		allowMemberInvite?: boolean;
		announcement?: string | null;
	}) {
		const name = params.name.trim();
		if (!name) {
			throw new Error('invalid name');
		}
		const iconUrl = validateRoomIconUrl(params.iconUrl);
		const announcement = params.announcement != null ? params.announcement.trim() || null : null;

		const room = {
			id: this.idService.gen(),
			name,
			description: params.description ?? '',
			ownerId: owner.id,
			isPublic: params.isPublic ?? false,
			iconUrl,
			allowMemberInvite: params.allowMemberInvite ?? false,
			announcement,
		} satisfies Partial<MiChatRoom>;

		const created = await this.chatRoomsRepository.insertOne(room);

		return created;
	}

	@bindThis
	public async hasPermissionToDeleteRoom(meId: MiUser['id'], room: MiChatRoom) {
		if (room.ownerId === meId) {
			return true;
		}

		const iAmModerator = await this.roleService.isModerator({ id: meId });
		if (iAmModerator) {
			return true;
		}

		return false;
	}

	@bindThis
	public async deleteRoom(room: MiChatRoom, deleter?: MiUser) {
		const membershipUserIds = new Set(
			(await this.chatRoomMembershipsRepository.findBy({ roomId: room.id })).map(m => m.userId),
		);
		membershipUserIds.add(room.ownerId); // ownerは通常レコードがないが、ミュート等で作成された場合は Set で重複しない
		const userIds = [...membershipUserIds];

		await this.clearRoomUnreadForUsers(userIds, room.id);

		await this.chatRoomsRepository.delete(room.id);

		this.globalEventService.publishChatRoomStream(room.id, 'roomDeleted', {
			roomId: room.id,
		});

		if (deleter) {
			const deleterIsModerator = await this.roleService.isModerator(deleter);

			if (deleterIsModerator) {
				this.moderationLogService.log(deleter, 'deleteChatRoom', {
					roomId: room.id,
					room: room,
				});
			}
		}
	}

	@bindThis
	public async cleanupOwnedRoomsOnAccountDelete(ownerId: MiUser['id']): Promise<void> {
		const ownedRooms = await this.chatRoomsRepository.findBy({ ownerId });
		for (const room of ownedRooms) {
			await this.deleteRoom(room);
		}
	}

	@bindThis
	public async findMyRoomById(ownerId: MiUser['id'], roomId: MiChatRoom['id']) {
		return this.chatRoomsRepository.findOneBy({ id: roomId, ownerId: ownerId });
	}

	@bindThis
	public async findRoomById(roomId: MiChatRoom['id']) {
		return this.chatRoomsRepository.findOne({
			where: { id: roomId },
			relations: { owner: true },
		});
	}

	@bindThis
	public async isRoomMember(room: MiChatRoom, userId: MiUser['id']) {
		if (room.ownerId === userId) return true;
		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId });
		return membership != null;
	}

	@bindThis
	public async canManageRoom(userId: MiUser['id'], room: MiChatRoom, options?: { allowMemberInvite?: boolean }): Promise<boolean> {
		if (room.ownerId === userId) return true;
		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId });
		if (membership && !isMembershipSuspended(membership)) {
			if (membership.role === 'admin') return true;
			if (options?.allowMemberInvite && room.allowMemberInvite) return true;
		}
		if (await this.roleService.isModerator({ id: userId })) return true;
		return false;
	}

	@bindThis
	public async canAccessRoom(userId: MiUser['id'], room: MiChatRoom): Promise<boolean> {
		// 群主可以访问
		if (room.ownerId === userId) return true;

		// 成员可以访问
		if (await this.isRoomMember(room, userId)) return true;

		// 全站版主可以访问
		if (await this.roleService.isModerator({ id: userId })) return true;

		// 公开群组可以访问（查看信息，但需要加入才能发消息）
		if (room.isPublic) return true;

		// 有未忽略的邀请可以访问
		const invitation = await this.chatRoomInvitationsRepository.findOneBy({
			roomId: room.id,
			userId: userId,
			ignored: false,
		});
		if (invitation != null) return true;

		return false;
	}

	@bindThis
	public async createRoomInvitation(inviterId: MiUser['id'], roomId: MiChatRoom['id'], inviteeId: MiUser['id']) {
		if (inviterId === inviteeId) {
			throw new Error('yourself');
		}

		const invitee = await this.usersRepository.findOneBy({ id: inviteeId });
		if (!invitee) {
			throw new Error('no such user');
		}

		const [blockedInviter, blockedByInviter] = await Promise.all([
			this.userBlockingService.checkBlocked(inviteeId, inviterId),
			this.userBlockingService.checkBlocked(inviterId, inviteeId),
		]);
		if (blockedInviter || blockedByInviter) {
			throw new Error('blocked');
		}

		const created = await this.runInTransaction(async (manager) => {
			const roomsRepo = manager.getRepository('MiChatRoom') as ChatRoomsRepository;
			const membershipsRepo = manager.getRepository('MiChatRoomMembership') as ChatRoomMembershipsRepository;
			const invitationsRepo = manager.getRepository('MiChatRoomInvitation') as ChatRoomInvitationsRepository;
			const bansRepo = manager.getRepository('MiChatRoomBan') as ChatRoomBansRepository;

			const room = await roomsRepo.findOneBy({ id: roomId });
			if (!room) {
				throw new Error('no such room');
			}
			if (room.isArchived) {
				throw new Error('room is archived');
			}

			if (room.ownerId !== inviterId) {
				const inviterMembership = await membershipsRepo.findOneBy({ roomId, userId: inviterId });
				const allowedByRole = inviterMembership != null
					&& !isMembershipSuspended(inviterMembership)
					&& (inviterMembership.role === 'admin' || room.allowMemberInvite);
				if (!allowedByRole && !(await this.roleService.isModerator({ id: inviterId }))) {
					throw new Error('permission denied');
				}
			}

			const ban = await bansRepo.findOneBy({ roomId, userId: inviteeId });
			if (ban) {
				throw new Error('banned');
			}

			if (room.ownerId === inviteeId || (await membershipsRepo.findOneBy({ roomId, userId: inviteeId })) != null) {
				throw new Error('already member');
			}

			const existingInvitation = await invitationsRepo.findOneBy({ roomId, userId: inviteeId });
			if (existingInvitation) {
				if (existingInvitation.ignored) {
					await invitationsRepo.delete(existingInvitation.id);
				} else {
					throw new Error('already invited');
				}
			}

			const membershipsCount = await this.countNonOwnerMemberships(room, membershipsRepo);
			if (membershipsCount >= MAX_ROOM_MEMBERS) {
				throw new Error('room is full');
			}

			const invitationId = this.idService.gen();
			const invitation = {
				id: invitationId,
				roomId: room.id,
				userId: inviteeId,
			} satisfies Partial<MiChatRoomInvitation>;

			await invitationsRepo.insert(invitation);
			return await invitationsRepo.findOneByOrFail({ id: invitationId });
		});

		this.notificationService.createNotification(inviteeId, 'chatRoomInvitationReceived', {
			invitationId: created.id,
		}, inviterId);

		return created;
	}

	@bindThis
	public async cancelRoomInvitation(
		initiator: { id: MiUser['id'] },
		params: { invitationId?: MiChatRoomInvitation['id']; roomId?: MiChatRoom['id']; userId?: MiUser['id'] },
	): Promise<void> {
		const invitation = params.invitationId
			? await this.chatRoomInvitationsRepository.findOneBy({ id: params.invitationId })
			: (params.roomId && params.userId)
				? await this.chatRoomInvitationsRepository.findOneBy({ roomId: params.roomId, userId: params.userId })
				: null;

		if (!invitation) {
			throw new Error('no such invitation');
		}

		const room = await this.chatRoomsRepository.findOneBy({ id: invitation.roomId });
		if (!room) {
			throw new Error('no such room');
		}

		await this.assertRoomModerationPermission(initiator, room);

		await this.chatRoomInvitationsRepository.delete(invitation.id);
	}

	@bindThis
	public async getSentRoomInvitationsWithPagination(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatRoomInvitation['id'] | null, untilId?: MiChatRoomInvitation['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomInvitationsRepository.createQueryBuilder('invitation'), sinceId, untilId)
			.andWhere('invitation.roomId = :roomId', { roomId });

		const invitations = await query.take(limit).getMany();

		return invitations;
	}

	@bindThis
	public async getOwnedRoomsWithPagination(ownerId: MiUser['id'], limit: number, sinceId?: MiChatRoom['id'] | null, untilId?: MiChatRoom['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomsRepository.createQueryBuilder('room'), sinceId, untilId)
			.andWhere('room.ownerId = :ownerId', { ownerId });

		const rooms = await query.take(limit).getMany();

		return rooms;
	}

	@bindThis
	public async getReceivedRoomInvitationsWithPagination(userId: MiUser['id'], limit: number, sinceId?: MiChatRoomInvitation['id'] | null, untilId?: MiChatRoomInvitation['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomInvitationsRepository.createQueryBuilder('invitation'), sinceId, untilId)
			.andWhere('invitation.userId = :userId', { userId })
			.andWhere('invitation.ignored = FALSE');

		const invitations = await query.take(limit).getMany();

		return invitations;
	}

	@bindThis
	public async joinToRoom(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const { room, membershipId } = await this.runInTransaction(async (manager) => {
			const roomsRepo = manager.getRepository('MiChatRoom') as ChatRoomsRepository;
			const membershipsRepo = manager.getRepository('MiChatRoomMembership') as ChatRoomMembershipsRepository;
			const invitationsRepo = manager.getRepository('MiChatRoomInvitation') as ChatRoomInvitationsRepository;
			const bansRepo = manager.getRepository('MiChatRoomBan') as ChatRoomBansRepository;

			const room = await roomsRepo.findOne({ where: { id: roomId } });
			if (room == null) {
				throw new Error('no such room');
			}
			if (room.isArchived) {
				throw new Error('room is archived');
			}

			const ban = await bansRepo.findOneBy({ roomId, userId });
			if (ban != null) {
				throw new Error('banned');
			}

			if (await this.userBlockingService.checkBlocked(room.ownerId, userId)) {
				throw new Error('blocked');
			}

			// 无论公开还是私有群组，都要先检查是否已经是成员
			if (room.ownerId === userId || (await membershipsRepo.findOneBy({ roomId, userId })) != null) {
				throw new Error('already member');
			}

			// 检查是否有邀请
			const invitation = await invitationsRepo.findOne({ where: { roomId, userId } });

			if (!room.isPublic) {
				// 私有群组需要邀请
				if (invitation == null) {
					throw new Error('no invitation');
				}
			}

			const membershipsCount = await this.countNonOwnerMemberships(room, membershipsRepo);
			if (membershipsCount >= MAX_ROOM_MEMBERS) {
				throw new Error('room is full');
			}

			const membershipId = this.idService.gen();
			const membership = {
				id: membershipId,
				roomId: roomId,
				userId: userId,
				role: 'member' as const,
			} satisfies Partial<MiChatRoomMembership>;

			await membershipsRepo.insert(membership);

			// 如果有邀请，无论公开还是私有群组都删除邀请
			if (invitation != null) {
				await invitationsRepo.delete(invitation.id);
			}

			return { room, membershipId };
		});

		// 通知群主有新成员加入
		if (room.ownerId !== userId) {
			this.notificationService.createNotification(room.ownerId, 'chatRoomMemberJoined', {
				chatRoomId: roomId,
			}, userId);
		}

		const [packedUser, packedMembership] = await Promise.all([
			this.userEntityService.pack(userId),
			this.chatEntityService.packRoomMembership(membershipId, { id: userId }, { populateUser: true, populateRoom: false }).catch(() => undefined),
		]);

		this.globalEventService.publishChatRoomStream(roomId, 'memberJoined', {
			roomId,
			userId,
			user: packedUser,
			membership: packedMembership,
		});
	}

	@bindThis
	public async ignoreRoomInvitation(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const invitation = await this.chatRoomInvitationsRepository.findOneBy({ roomId, userId });
		if (!invitation) {
			throw new Error('no such invitation');
		}
		await this.chatRoomInvitationsRepository.update(invitation.id, { ignored: true });
	}

	@bindThis
	public async leaveRoom(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const room = await this.chatRoomsRepository.findOneBy({ id: roomId });
		if (!room) {
			throw new Error('no such room');
		}
		if (room.ownerId === userId) {
			throw new Error('owner cannot leave');
		}

		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId, userId });
		if (!membership) {
			throw new Error('not a member');
		}

		await this.chatRoomMembershipsRepository.delete(membership.id);

		await this.clearRoomUnreadForUsers([userId], roomId);

		this.globalEventService.publishChatRoomStream(roomId, 'memberLeft', {
			roomId,
			userId,
		});
	}

	@bindThis
	public async muteRoom(userId: MiUser['id'], roomId: MiChatRoom['id'], mute: boolean) {
		const room = await this.chatRoomsRepository.findOneBy({ id: roomId });
		if (room == null) {
			throw new Error('no such room');
		}

		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId, userId });
		if (membership == null) {
			if (room.ownerId !== userId) {
				throw new Error('you are not a member of the room');
			}
			// 群主在解除静音且无行时无需创建冗余行
			if (mute) {
				await this.chatRoomMembershipsRepository.insertOne({
					id: this.idService.gen(),
					roomId,
					userId,
					isMuted: true,
					role: 'member',
				});
			}
		} else {
			await this.chatRoomMembershipsRepository.update(membership.id, { isMuted: mute });
		}

		if (mute) {
			await this.clearRoomUnreadForUsers([userId], roomId);
		}
	}

	@bindThis
	public async kick(initiator: MiUser, roomId: MiChatRoom['id'], userId: MiUser['id']) {
		const room = await this.chatRoomsRepository.findOneBy({ id: roomId });
		if (!room) {
			throw new Error('no such room');
		}

		const { isOwner, isSiteModerator } = await this.assertRoomModerationPermission(initiator, room);

		if (room.ownerId === userId) {
			throw new Error('cannot kick owner');
		}

		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId, userId });
		if (!membership) {
			throw new Error('not a member');
		}

		if (!isOwner && !isSiteModerator && membership.role === 'admin') {
			throw new Error('permission denied');
		}

		await this.chatRoomMembershipsRepository.delete(membership.id);

		await this.clearRoomUnreadForUsers([userId], roomId);

		// 通知被踢出的用户
		this.notificationService.createNotification(userId, 'chatRoomKicked', {
			chatRoomId: roomId,
		}, initiator.id);

		this.globalEventService.publishChatRoomStream(roomId, 'memberKicked', {
			roomId,
			userId,
		});
	}

	@bindThis
	public async banUserFromRoom(initiator: MiUser, roomId: MiChatRoom['id'], userId: MiUser['id'], reason?: string | null): Promise<MiChatRoomBan> {
		if (initiator.id === userId) {
			throw new Error('yourself');
		}

		const targetUser = await this.usersRepository.findOneBy({ id: userId });
		if (!targetUser) {
			throw new Error('no such user');
		}

		const room = await this.chatRoomsRepository.findOneBy({ id: roomId });
		if (!room) {
			throw new Error('no such room');
		}

		const { isOwner, isSiteModerator } = await this.assertRoomModerationPermission(initiator, room);

		if (room.ownerId === userId) {
			throw new Error('cannot ban owner');
		}

		const normalizedReason = reason != null ? reason.trim() || null : null;

		const createdBan = await this.runInTransaction(async (manager) => {
			const membershipsRepo = manager.getRepository('MiChatRoomMembership') as ChatRoomMembershipsRepository;
			const invitationsRepo = manager.getRepository('MiChatRoomInvitation') as ChatRoomInvitationsRepository;
			const bansRepo = manager.getRepository('MiChatRoomBan') as ChatRoomBansRepository;

			const existingMembership = await membershipsRepo.findOneBy({ roomId, userId });
			if (existingMembership) {
				if (!isOwner && !isSiteModerator && existingMembership.role === 'admin') {
					throw new Error('permission denied');
				}
				await membershipsRepo.delete(existingMembership.id);
			}

			const existingBan = await bansRepo.findOneBy({ roomId, userId });
			if (existingBan) {
				throw new Error('already banned');
			}

			await invitationsRepo.delete({ roomId, userId });

			const banId = this.idService.gen();
			await bansRepo.insert({
				id: banId,
				createdAt: new Date(),
				roomId,
				userId,
				bannedById: initiator.id,
				reason: normalizedReason,
			});

			return await bansRepo.findOneByOrFail({ id: banId });
		});

		await this.clearRoomUnreadForUsers([userId], roomId);

		this.globalEventService.publishChatRoomStream(roomId, 'memberBanned', {
			roomId,
			userId,
			reason: createdBan.reason,
		});

		return createdBan;
	}

	@bindThis
	public async unbanUserFromRoom(initiator: MiUser, roomId: MiChatRoom['id'], userId: MiUser['id']): Promise<void> {
		const room = await this.chatRoomsRepository.findOneBy({ id: roomId });
		if (!room) {
			throw new Error('no such room');
		}

		await this.assertRoomModerationPermission(initiator, room);

		const existingBan = await this.chatRoomBansRepository.findOneBy({ roomId, userId });
		if (!existingBan) {
			throw new Error('not banned');
		}

		await this.chatRoomBansRepository.delete(existingBan.id);
	}

	@bindThis
	public async getRoomBansWithPagination(
		initiator: MiUser,
		roomId: MiChatRoom['id'],
		limit: number,
		sinceId?: MiChatRoomBan['id'] | null,
		untilId?: MiChatRoomBan['id'] | null,
	): Promise<MiChatRoomBan[]> {
		const room = await this.chatRoomsRepository.findOneBy({ id: roomId });
		if (!room) {
			throw new Error('no such room');
		}

		await this.assertRoomModerationPermission(initiator, room);

		const query = this.queryService.makePaginationQuery(this.chatRoomBansRepository.createQueryBuilder('ban'), sinceId, untilId)
			.andWhere('ban.roomId = :roomId', { roomId })
			.leftJoinAndSelect('ban.user', 'user')
			.leftJoinAndSelect('ban.bannedBy', 'bannedBy');

		const bans = await query.limit(limit).getMany();

		if (sinceId && !untilId) {
			bans.sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));
		}

		return bans;
	}

	@bindThis
	public async setMemberRole(
		initiator: MiUser,
		roomId: MiChatRoom['id'],
		userId: MiUser['id'],
		role: ChatRoomMembershipRole,
	): Promise<MiChatRoomMembership> {
		const room = await this.chatRoomsRepository.findOneBy({ id: roomId });
		if (!room) {
			throw new Error('no such room');
		}

		if (room.ownerId !== initiator.id) {
			throw new Error('permission denied');
		}

		if (room.ownerId === userId) {
			throw new Error('cannot set owner role');
		}

		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId, userId });
		if (!membership) {
			throw new Error('not a member');
		}

		await this.chatRoomMembershipsRepository.update(membership.id, { role });
		const updated = await this.chatRoomMembershipsRepository.findOne({
			where: { id: membership.id },
			relations: { user: true },
		}) ?? { ...membership, role };

		this.globalEventService.publishChatRoomStream(roomId, 'memberRoleChanged', {
			roomId,
			userId,
			role,
		});

		return updated;
	}

	@bindThis
	public async transferRoomOwnership(
		initiator: MiUser,
		roomId: MiChatRoom['id'],
		newOwnerId: MiUser['id'],
	): Promise<MiChatRoom> {
		if (initiator.id === newOwnerId) {
			throw new Error('yourself');
		}

		await this.runInTransaction(async (manager) => {
			const roomsRepo = manager.getRepository('MiChatRoom') as ChatRoomsRepository;
			const membershipsRepo = manager.getRepository('MiChatRoomMembership') as ChatRoomMembershipsRepository;
			const bansRepo = manager.getRepository('MiChatRoomBan') as ChatRoomBansRepository;

			const room = await roomsRepo.findOneBy({ id: roomId });
			if (!room) {
				throw new Error('no such room');
			}
			if (room.ownerId !== initiator.id) {
				throw new Error('permission denied');
			}

			const ban = await bansRepo.findOneBy({ roomId, userId: newOwnerId });
			if (ban) {
				throw new Error('banned');
			}

			const newOwnerMembership = await membershipsRepo.findOneBy({ roomId, userId: newOwnerId });
			if (!newOwnerMembership) {
				throw new Error('not a member');
			}

			await roomsRepo.update(room.id, { ownerId: newOwnerId });

			const oldOwnerMembership = await membershipsRepo.findOneBy({ roomId, userId: initiator.id });
			if (oldOwnerMembership) {
				await membershipsRepo.update(oldOwnerMembership.id, { role: 'member', suspendedUntil: null });
			} else {
				await membershipsRepo.insert({
					id: this.idService.gen(),
					roomId,
					userId: initiator.id,
					role: 'member',
					isMuted: false,
				});
			}

			if (newOwnerMembership.isMuted) {
				await membershipsRepo.update(newOwnerMembership.id, { role: 'member', suspendedUntil: null });
			} else {
				await membershipsRepo.delete(newOwnerMembership.id);
			}
		});

		const updatedRoom = await this.chatRoomsRepository.findOneOrFail({
			where: { id: roomId },
			relations: { owner: true },
		});

		const [packedNewOwner, packedRoomNeutral] = await Promise.all([
			this.userEntityService.pack(updatedRoom.owner ?? newOwnerId),
			this.chatEntityService.packRoom(updatedRoom),
		]);

		this.globalEventService.publishChatRoomStream(roomId, 'ownerTransferred', {
			roomId,
			oldOwnerId: initiator.id,
			newOwnerId,
			newOwner: packedNewOwner,
		});
		this.globalEventService.publishChatRoomStream(roomId, 'roomUpdated', packedRoomNeutral);

		return updatedRoom;
	}

	@bindThis
	public async pinMessage(
		initiator: MiUser,
		roomId: MiChatRoom['id'],
		messageId: MiChatMessage['id'] | null,
	): Promise<MiChatRoom> {
		const room = await this.chatRoomsRepository.findOneBy({ id: roomId });
		if (!room) {
			throw new Error('no such room');
		}

		await this.assertRoomModerationPermission(initiator, room);

		let targetMessage: MiChatMessage | null = null;
		if (messageId != null) {
			targetMessage = await this.chatMessagesRepository.findOne({
				where: { id: messageId },
				relations: { fromUser: true, file: true },
			});
			if (!targetMessage || targetMessage.toRoomId !== roomId) {
				throw new Error('no such message');
			}
		}

		await this.chatRoomsRepository.update(room.id, { pinnedMessageId: messageId });
		const updatedRoom = await this.chatRoomsRepository.findOneOrFail({
			where: { id: room.id },
			relations: { owner: true },
		});

		const [packedPinnedMessage, packedRoomNeutral] = await Promise.all([
			targetMessage
				? this.chatEntityService.packMessageDetailed(targetMessage, undefined, { _hint_: { skipToRoom: true } })
				: Promise.resolve(null),
			this.chatEntityService.packRoom(updatedRoom),
		]);

		this.globalEventService.publishChatRoomStream(roomId, 'pinnedMessageUpdated', {
			roomId,
			pinnedMessageId: messageId,
			pinnedMessage: packedPinnedMessage,
		});
		this.globalEventService.publishChatRoomStream(roomId, 'roomUpdated', packedRoomNeutral);

		return updatedRoom;
	}

	@bindThis
	public async suspend(initiator: MiUser, roomId: MiChatRoom['id'], userId: MiUser['id'], expiredAt: Date) {
		const room = await this.chatRoomsRepository.findOneBy({ id: roomId });
		if (!room) {
			throw new Error('no such room');
		}

		const { isOwner, isSiteModerator } = await this.assertRoomModerationPermission(initiator, room);

		if (room.ownerId === userId) {
			throw new Error('cannot suspend owner');
		}

		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId, userId });
		if (!membership) {
			throw new Error('not a member');
		}

		if (!isOwner && !isSiteModerator && membership.role === 'admin') {
			throw new Error('permission denied');
		}

		await this.chatRoomMembershipsRepository.update(membership.id, { suspendedUntil: expiredAt });

		// 通知被禁言的用户
		this.notificationService.createNotification(userId, 'chatRoomSuspended', {
			chatRoomId: roomId,
		}, initiator.id);

		this.globalEventService.publishChatRoomStream(roomId, 'memberSuspended', {
			roomId,
			userId,
			suspendedUntil: expiredAt.toISOString(),
		});
	}

	@bindThis
	public async unsuspend(initiator: MiUser, roomId: MiChatRoom['id'], userId: MiUser['id']) {
		const room = await this.chatRoomsRepository.findOneBy({ id: roomId });
		if (!room) {
			throw new Error('no such room');
		}

		const { isOwner, isSiteModerator } = await this.assertRoomModerationPermission(initiator, room);

		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId, userId });
		if (!membership) {
			throw new Error('not a member');
		}

		if (!isOwner && !isSiteModerator && membership.role === 'admin') {
			throw new Error('permission denied');
		}

		await this.chatRoomMembershipsRepository.update(membership.id, { suspendedUntil: null });

		// 通知被解除禁言的用户
		this.notificationService.createNotification(userId, 'chatRoomUnsuspended', {
			chatRoomId: roomId,
		}, initiator.id);

		this.globalEventService.publishChatRoomStream(roomId, 'memberUnsuspended', {
			roomId,
			userId,
		});
	}

	@bindThis
	public async updateRoom(room: MiChatRoom, params: {
		name?: string;
		description?: string;
		isPublic?: boolean;
		iconUrl?: string | null;
		announcement?: string | null;
		allowMemberInvite?: boolean;
		isArchived?: boolean;
	}): Promise<MiChatRoom> {
		const updates: Partial<MiChatRoom> = {};

		if (params.name !== undefined) {
			const trimmed = params.name.trim();
			if (!trimmed) {
				throw new Error('invalid name');
			}
			updates.name = trimmed;
		}
		if (params.description !== undefined) {
			updates.description = params.description;
		}
		if (params.isPublic !== undefined) {
			updates.isPublic = params.isPublic;
		}
		if (params.iconUrl !== undefined) {
			updates.iconUrl = validateRoomIconUrl(params.iconUrl);
		}
		if (params.announcement !== undefined) {
			updates.announcement = params.announcement != null ? params.announcement.trim() || null : null;
		}
		if (params.allowMemberInvite !== undefined) {
			updates.allowMemberInvite = params.allowMemberInvite;
		}
		if (params.isArchived !== undefined) {
			updates.isArchived = params.isArchived;
		}

		if (Object.keys(updates).length === 0) {
			return room;
		}

		await this.chatRoomsRepository.update(room.id, updates);

		const updated = await this.chatRoomsRepository.findOneOrFail({
			where: { id: room.id },
			relations: { owner: true },
		});

		const packedNeutral = await this.chatEntityService.packRoom(updated);
		this.globalEventService.publishChatRoomStream(room.id, 'roomUpdated', packedNeutral);

		return updated;
	}

	@bindThis
	public async getRoomMembershipsWithPagination(
		room: MiChatRoom | MiChatRoom['id'],
		limit: number,
		sinceId?: MiChatRoomMembership['id'] | null,
		untilId?: MiChatRoomMembership['id'] | null,
		queryText?: string | null,
	) {
		const roomEntity = typeof room === 'string'
			? await this.chatRoomsRepository.findOneByOrFail({ id: room })
			: room;

		const query = this.queryService.makePaginationQuery(
			this.chatRoomMembershipsRepository.createQueryBuilder('membership'),
			sinceId,
			untilId,
		)
			.andWhere('membership.roomId = :roomId', { roomId: roomEntity.id })
			.andWhere('membership.userId <> :ownerId', { ownerId: roomEntity.ownerId });

		const trimmedQuery = queryText?.trim();
		if (trimmedQuery) {
			query.innerJoinAndSelect('membership.user', 'user')
				.andWhere(new Brackets(qb => {
					qb.where('user.username ILIKE :q', { q: `%${sqlLikeEscape(trimmedQuery)}%` })
						.orWhere('user.name ILIKE :q', { q: `%${sqlLikeEscape(trimmedQuery)}%` });
				}));
		}

		const memberships = await query.limit(limit).getMany();

		if (sinceId && !untilId) {
			memberships.sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));
		}

		return memberships;
	}

	@bindThis
	public async searchRooms(query: string, limit: number, sinceId?: MiChatRoom['id'] | null, untilId?: MiChatRoom['id'] | null) {
		const q = this.queryService.makePaginationQuery(this.chatRoomsRepository.createQueryBuilder('room'), sinceId, untilId)
			.andWhere(new Brackets(qb => {
				qb.where('room.name ILIKE :query', { query: `%${sqlLikeEscape(query)}%` })
					.orWhere('room.description ILIKE :query', { query: `%${sqlLikeEscape(query)}%` });
			}))
			.andWhere('room.isPublic = TRUE')
			.leftJoinAndSelect('room.owner', 'owner');

		const rooms = await q.limit(limit).getMany();

		if (sinceId && !untilId) {
			rooms.sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));
		}

		return rooms;
	}

	@bindThis
	public async searchMessages(meId: MiUser['id'], query: string, limit: number, params: {
		userId?: MiUser['id'] | null;
		roomId?: MiChatRoom['id'] | null;
		fromUserId?: MiUser['id'] | null;
		sinceId?: MiChatMessage['id'] | null;
		untilId?: MiChatMessage['id'] | null;
	}) {
		const q = this.queryService.makePaginationQuery(
			this.chatMessagesRepository.createQueryBuilder('message'),
			params.sinceId,
			params.untilId,
		);

		if (params.roomId) {
			q.andWhere('message.toRoomId = :roomId', { roomId: params.roomId });
			const effectiveFromUserId = params.fromUserId ?? params.userId;
			if (effectiveFromUserId) {
				q.andWhere('message.fromUserId = :fromUserId', { fromUserId: effectiveFromUserId });
			}
		} else if (params.userId) {
			q.andWhere(new Brackets(qb => {
				qb
					.where(new Brackets(qb => {
						qb
							.where('message.fromUserId = :meId')
							.andWhere('message.toUserId = :otherId');
					}))
					.orWhere(new Brackets(qb => {
						qb
							.where('message.fromUserId = :otherId')
							.andWhere('message.toUserId = :meId');
					}));
			}))
				.setParameter('meId', meId)
				.setParameter('otherId', params.userId);
			if (params.fromUserId) {
				q.andWhere('message.fromUserId = :fromUserId', { fromUserId: params.fromUserId });
			}
		} else {
			const membershipsQuery = this.chatRoomMembershipsRepository.createQueryBuilder('membership')
				.select('membership.roomId')
				.where('membership.userId = :meId', { meId: meId });

			const ownedRoomsQuery = this.chatRoomsRepository.createQueryBuilder('room')
				.select('room.id')
				.where('room.ownerId = :meId', { meId });

			q.andWhere(new Brackets(qb => {
				qb
					.where('message.fromUserId = :meId')
					.orWhere('message.toUserId = :meId')
					.orWhere(`message.toRoomId IN (${membershipsQuery.getQuery()})`)
					.orWhere(`message.toRoomId IN (${ownedRoomsQuery.getQuery()})`);
			}));

			q.setParameters(membershipsQuery.getParameters());
			q.setParameters(ownedRoomsQuery.getParameters());

			if (params.fromUserId) {
				q.andWhere('message.fromUserId = :fromUserId', { fromUserId: params.fromUserId });
			}
		}

		q.andWhere('LOWER(message.text) LIKE :q', { q: `%${sqlLikeEscape(query.toLowerCase())}%` });

		q.leftJoinAndSelect('message.file', 'file');
		q.leftJoinAndSelect('message.fromUser', 'fromUser');
		q.leftJoinAndSelect('message.toUser', 'toUser');
		q.leftJoinAndSelect('message.toRoom', 'toRoom');
		q.leftJoinAndSelect('toRoom.owner', 'toRoomOwner');

		const messages = await q.limit(limit).getMany();

		if (params.sinceId && !params.untilId) {
			messages.sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));
		}

		return messages;
	}

	@bindThis
	public async react(messageId: MiChatMessage['id'], userId: MiUser['id'], reaction_: string) {
		let reaction;

		const custom = reaction_.match(isCustomEmojiRegexp);

		if (custom == null) {
			reaction = normalizeEmojiString(reaction_);
		} else {
			const name = custom[1];
			const emoji = (await this.customEmojiService.localEmojisCache.fetch()).get(name);

			if (emoji == null) {
				throw new Error('no such emoji');
			} else {
				reaction = `:${name}:`;
			}
		}

		const message = await this.chatMessagesRepository.findOneBy({ id: messageId });
		if (message == null) throw new ChatMessageAccessError('no such message');

		if (message.fromUserId === userId) {
			throw new ChatMessageAccessError('cannot react to own message');
		}

		if (message.toRoomId === null && message.toUserId !== userId) {
			throw new ChatMessageAccessError('cannot react to others message');
		}

		const room = message.toRoomId ? await this.chatRoomsRepository.findOneBy({ id: message.toRoomId }) : null;
		if (message.toRoomId && room == null) {
			throw new ChatMessageAccessError('no such message');
		}

		if (room) {
			if (room.ownerId !== userId) {
				const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId });
				if (!membership) {
					throw new ChatMessageAccessError('cannot react to others message');
				}
				if (isMembershipSuspended(membership)) {
					throw buildSuspendedError(membership.suspendedUntil!);
				}
			}
			if (room.isArchived) {
				throw new Error('room is archived');
			}
		}

		const pair = `${userId}/${reaction}`;
		if (message.reactions.includes(pair)) {
			return;
		}

		if (message.reactions.length >= MAX_REACTIONS_PER_MESSAGE) {
			throw new Error('too many reactions');
		}

		const result = await this.chatMessagesRepository.createQueryBuilder().update()
			.set({
				reactions: () => `array_append("reactions", :pair)`,
			})
			.where('id = :id', { id: message.id })
			.andWhere('NOT (:pair = ANY("reactions"))')
			.andWhere('cardinality("reactions") < :maxReactions', { maxReactions: MAX_REACTIONS_PER_MESSAGE })
			.setParameter('pair', pair)
			.execute();

		if (!result.affected) {
			return;
		}

		if (room) {
			this.globalEventService.publishChatRoomStream(room.id, 'react', {
				messageId: message.id,
				user: await this.userEntityService.pack(userId),
				reaction,
			});
		} else {
			this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId!, 'react', {
				messageId: message.id,
				reaction,
			});
			this.globalEventService.publishChatUserStream(message.toUserId!, message.fromUserId, 'react', {
				messageId: message.id,
				reaction,
			});
		}
	}

	@bindThis
	public async unreact(messageId: MiChatMessage['id'], userId: MiUser['id'], reaction_: string) {
		let reaction;

		const custom = reaction_.match(isCustomEmojiRegexp);

		if (custom == null) {
			reaction = normalizeEmojiString(reaction_);
		} else { // 削除されたカスタム絵文字のリアクションを削除したいかもしれないので絵文字の存在チェックはする必要なし
			const name = custom[1];
			reaction = `:${name}:`;
		}

		const message = await this.chatMessagesRepository.findOneBy({ id: messageId });
		if (message == null) throw new ChatMessageAccessError('no such message');

		const room = message.toRoomId ? await this.chatRoomsRepository.findOneBy({ id: message.toRoomId }) : null;
		if (message.toRoomId && room == null) {
			throw new ChatMessageAccessError('no such message');
		}

		if (room) {
			if (room.ownerId !== userId) {
				const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId });
				if (!membership) {
					throw new ChatMessageAccessError('cannot unreact to others message');
				}
				if (isMembershipSuspended(membership)) {
					throw buildSuspendedError(membership.suspendedUntil!);
				}
			}
			if (room.isArchived) {
				throw new Error('room is archived');
			}
		} else if (message.fromUserId !== userId && message.toUserId !== userId) {
			throw new ChatMessageAccessError('cannot unreact to others message');
		}

		const pair = `${userId}/${reaction}`;
		if (!message.reactions.includes(pair)) {
			return;
		}

		const result = await this.chatMessagesRepository.createQueryBuilder().update()
			.set({
				reactions: () => `array_remove("reactions", :pair)`,
			})
			.where('id = :id', { id: message.id })
			.andWhere(':pair = ANY("reactions")')
			.setParameter('pair', pair)
			.execute();

		if (!result.affected) {
			return;
		}

		if (room) {
			this.globalEventService.publishChatRoomStream(room.id, 'unreact', {
				messageId: message.id,
				user: await this.userEntityService.pack(userId),
				reaction,
			});
		} else {
			this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId!, 'unreact', {
				messageId: message.id,
				reaction,
			});
			this.globalEventService.publishChatUserStream(message.toUserId!, message.fromUserId, 'unreact', {
				messageId: message.id,
				reaction,
			});
		}
	}

	@bindThis
	public async getMyMemberships(userId: MiUser['id'], limit: number, sinceId?: MiChatRoomMembership['id'] | null, untilId?: MiChatRoomMembership['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomMembershipsRepository.createQueryBuilder('membership'), sinceId, untilId)
			.innerJoinAndSelect('membership.room', 'room')
			.andWhere('membership.userId = :userId', { userId })
			.andWhere('room.ownerId <> :userId', { userId });

		const memberships = await query.limit(limit).getMany();

		if (sinceId && !untilId) {
			memberships.sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));
		}

		return memberships;
	}
}
