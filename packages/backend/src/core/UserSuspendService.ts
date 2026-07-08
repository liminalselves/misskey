/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Not, IsNull } from 'typeorm';
import type { AccessTokensRepository, FollowingsRepository, FollowRequestsRepository, UsersRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { QueueService } from '@/core/QueueService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import { RelationshipJobData } from '@/queue/types.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { MetaService } from '@/core/MetaService.js';
import { generateNativeUserToken } from '@/misc/token.js';

@Injectable()
export class UserSuspendService {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.followRequestsRepository)
		private followRequestsRepository: FollowRequestsRepository,

		@Inject(DI.accessTokensRepository)
		private accessTokensRepository: AccessTokensRepository,

		private userEntityService: UserEntityService,
		private queueService: QueueService,
		private globalEventService: GlobalEventService,
		private apRendererService: ApRendererService,
		private moderationLogService: ModerationLogService,
		private metaService: MetaService,
	) {
	}

	@bindThis
	public async suspend(user: MiUser, moderator: MiUser, opts?: { expiresAt?: Date | null; reason?: string | null }): Promise<void> {
		const expiresAt = opts?.expiresAt ?? null;
		const reason = opts?.reason?.trim() || null;
		if (expiresAt != null && expiresAt.getTime() <= Date.now()) {
			return;
		}

		const oldToken = this.userEntityService.isLocalUser(user) ? user.token : null;
		const newToken = oldToken != null ? generateNativeUserToken() : null;

		await this.usersRepository.update(user.id, {
			isSuspended: true,
			suspendedUntil: expiresAt,
			suspensionReason: reason,
			...(newToken != null ? { token: newToken } : {}),
		});
		await this.accessTokensRepository.delete({ userId: user.id });

		if (oldToken != null && newToken != null) {
			this.globalEventService.publishInternalEvent('userTokenRegenerated', { id: user.id, oldToken, newToken });
			this.globalEventService.publishMainStream(user.id, 'myTokenRegenerated');
		}

		this.moderationLogService.log(moderator, 'suspend', {
			userId: user.id,
			userUsername: user.username,
			userHost: user.host,
			suspendedUntil: expiresAt ? expiresAt.toISOString() : null,
			reason,
		});

		(async () => {
			await this.postSuspend(user).catch(_ => {});
			await this.unFollowAll(user).catch(_ => {});
		})();
	}

	@bindThis
	public async unsuspend(user: MiUser, moderator: MiUser): Promise<void> {
		await this.applyUnsuspend(user, { moderator, logKind: 'moderator' });
	}

	/**
	 * 期限付き凍結の満了により凍結を解除する（定期ジョブから呼ばれる）。
	 */
	@bindThis
	public async unsuspendDueToScheduledExpiry(user: MiUser): Promise<void> {
		const meta = await this.metaService.fetch();
		const rootId = meta.rootUserId;
		if (rootId) {
			const root = await this.usersRepository.findOneBy({ id: rootId });
			if (root) {
				await this.applyUnsuspend(user, { moderator: root, logKind: 'scheduleExpired' });
				return;
			}
		}
		await this.applyUnsuspend(user, { logKind: 'none' });
	}

	@bindThis
	public async processExpiredScheduledSuspensions(): Promise<void> {
		const users = await this.usersRepository.createQueryBuilder('user')
			.where('user.isSuspended = true')
			.andWhere('user.suspendedUntil IS NOT NULL')
			.andWhere('user.suspendedUntil < :now', { now: new Date() })
			.getMany();

		for (const u of users) {
			await this.unsuspendDueToScheduledExpiry(u).catch(_ => {});
		}
	}

	@bindThis
	private async applyUnsuspend(user: MiUser, opts: {
		moderator?: MiUser;
		logKind: 'moderator' | 'scheduleExpired' | 'none';
	}): Promise<void> {
		await this.usersRepository.update(user.id, {
			isSuspended: false,
			suspendedUntil: null,
			suspensionReason: null,
		});

		if (opts.logKind === 'moderator' && opts.moderator) {
			this.moderationLogService.log(opts.moderator, 'unsuspend', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
			});
		} else if (opts.logKind === 'scheduleExpired' && opts.moderator) {
			this.moderationLogService.log(opts.moderator, 'unsuspend', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
				scheduleExpired: true,
			});
		}

		(async () => {
			await this.postUnsuspend(user).catch(_ => {});
		})();
	}

	@bindThis
	private async postSuspend(user: { id: MiUser['id']; host: MiUser['host'] }): Promise<void> {
		this.globalEventService.publishInternalEvent('userChangeSuspendedState', { id: user.id, isSuspended: true });

		this.followRequestsRepository.delete({
			followeeId: user.id,
		});
		this.followRequestsRepository.delete({
			followerId: user.id,
		});

		if (this.userEntityService.isLocalUser(user)) {
			// 知り得る全SharedInboxにDelete配信
			const content = this.apRendererService.addContext(this.apRendererService.renderDelete(this.userEntityService.genLocalUserUri(user.id), user));

			const queue: string[] = [];

			const followings = await this.followingsRepository.find({
				where: [
					{ followerSharedInbox: Not(IsNull()) },
					{ followeeSharedInbox: Not(IsNull()) },
				],
				select: ['followerSharedInbox', 'followeeSharedInbox'],
			});

			const inboxes = followings.map(x => x.followerSharedInbox ?? x.followeeSharedInbox);

			for (const inbox of inboxes) {
				if (inbox != null && !queue.includes(inbox)) queue.push(inbox);
			}

			for (const inbox of queue) {
				this.queueService.deliver(user, content, inbox, true);
			}
		}
	}

	@bindThis
	private async postUnsuspend(user: MiUser): Promise<void> {
		this.globalEventService.publishInternalEvent('userChangeSuspendedState', { id: user.id, isSuspended: false });

		if (this.userEntityService.isLocalUser(user)) {
			// 知り得る全SharedInboxにUndo Delete配信
			const content = this.apRendererService.addContext(this.apRendererService.renderUndo(this.apRendererService.renderDelete(this.userEntityService.genLocalUserUri(user.id), user), user));

			const queue: string[] = [];

			const followings = await this.followingsRepository.find({
				where: [
					{ followerSharedInbox: Not(IsNull()) },
					{ followeeSharedInbox: Not(IsNull()) },
				],
				select: ['followerSharedInbox', 'followeeSharedInbox'],
			});

			const inboxes = followings.map(x => x.followerSharedInbox ?? x.followeeSharedInbox);

			for (const inbox of inboxes) {
				if (inbox != null && !queue.includes(inbox)) queue.push(inbox);
			}

			for (const inbox of queue) {
				this.queueService.deliver(user as any, content, inbox, true);
			}
		}
	}

	@bindThis
	private async unFollowAll(follower: MiUser) {
		const followings = await this.followingsRepository.find({
			where: {
				followerId: follower.id,
				followeeId: Not(IsNull()),
			},
		});

		const jobs: RelationshipJobData[] = [];
		for (const following of followings) {
			if (following.followeeId && following.followerId) {
				jobs.push({
					from: { id: following.followerId },
					to: { id: following.followeeId },
					silent: true,
				});
			}
		}
		this.queueService.createUnfollowJob(jobs);
	}
}
