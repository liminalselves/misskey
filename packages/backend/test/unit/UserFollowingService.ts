/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { describe, expect, test, vi } from 'vitest';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import type { MiLocalUser } from '@/models/User.js';

describe('UserFollowingService', () => {
	test.each(['unfollow', 'rejectFollow'] as const)('%s waits for both user counters before completing', async action => {
		const follower = { id: 'follower', host: null, movedToUri: null } as MiLocalUser;
		const followee = { id: 'followee', host: null, movedToUri: null } as MiLocalUser;
		const followingWrite = Promise.withResolvers<void>();
		const followersWrite = Promise.withResolvers<void>();
		const counters = { followingCount: 1, followersCount: 1 };
		const decrement = vi.fn(async (_where: unknown, field: keyof typeof counters) => {
			await (field === 'followingCount' ? followingWrite.promise : followersWrite.promise);
			counters[field]--;
		});
		const service = Object.create(UserFollowingService.prototype) as UserFollowingService;
		Object.assign(service, {
			meta: { enableStatsForFederatedInstances: false },
			followingsRepository: {
				findOne: vi.fn(async () => ({ id: 'following', follower, followee })),
				delete: vi.fn(async () => ({ affected: 1 })),
			},
			usersRepository: { decrement },
			cacheService: { userFollowingsCache: { refresh: vi.fn() } },
			globalEventService: { publishInternalEvent: vi.fn(), publishMainStream: vi.fn() },
			userEntityService: {
				isLocalUser: () => true,
				isRemoteUser: () => false,
				pack: vi.fn(async () => ({})),
			},
			webhookService: { enqueueUserWebhook: vi.fn() },
			perUserFollowingChart: { update: vi.fn() },
		});

		let settled = false;
		const result = (action === 'unfollow'
			? service.unfollow(follower, followee, true)
			: service.rejectFollow(followee, follower)
		).then(() => { settled = true; });

		await vi.waitFor(() => expect(decrement).toHaveBeenCalledTimes(2));
		expect(settled).toBe(false);

		followingWrite.resolve();
		await vi.waitFor(() => expect(counters.followingCount).toBe(0));
		expect(settled).toBe(false);

		followersWrite.resolve();
		await result;
		expect(counters).toEqual({ followingCount: 0, followersCount: 0 });
	});
});
