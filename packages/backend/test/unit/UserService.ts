/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { UserService } from '@/core/UserService.js';
import type { MiUser } from '@/models/User.js';

function createHarness() {
	const claims = new Map<string, { token: string; expiresAt: number }>();
	const redis = {
		set: jest.fn(async (key: string, token: string, _expiry: string, ttl: number, _condition: string) => {
			if ((claims.get(key)?.expiresAt ?? 0) > Date.now()) return null;
			claims.set(key, { token, expiresAt: Date.now() + ttl });
			return 'OK';
		}),
		eval: jest.fn(async (_script: string, _keys: number, key: string, token: string) => {
			if (claims.get(key)?.token !== token) return 0;
			claims.delete(key);
			return 1;
		}),
	};
	const query = {
		update: jest.fn(), set: jest.fn(), where: jest.fn(), returning: jest.fn(),
		execute: jest.fn(async () => ({ raw: [{ isHibernated: true }] })),
	};
	for (const method of ['update', 'set', 'where', 'returning'] as const) query[method].mockReturnValue(query);
	const users = { update: jest.fn(async () => undefined), createQueryBuilder: () => query };
	const followings = { update: jest.fn(async () => undefined) };
	const createService = () => new UserService(users as never, followings as never, {} as never, {} as never, redis as never);
	return { service: createService(), createService, users, followings, redis, claims, query };
}

const user = (id = 'user-id', isHibernated = false) => ({ id, isHibernated }) as MiUser;

describe('UserService activity writes', () => {
	afterEach(() => jest.useRealTimers());

	test('deduplicates concurrent tabs across service instances while keeping users independent', async () => {
		const { service, createService, users, redis } = createHarness();
		await Promise.all([
			service.updateLastActiveDate(user()),
			createService().updateLastActiveDate(user()),
			service.updateLastActiveDate(user('other-user')),
		]);
		expect(users.update).toHaveBeenCalledTimes(2);
		expect(redis.set).toHaveBeenCalledWith('user:last-active-write:user-id', expect.any(String), 'PX', 30_000, 'NX');
	});

	test('allows the next write after thirty seconds', async () => {
		jest.useFakeTimers({ now: new Date('2026-10-04T00:00:00Z') });
		const { service, users } = createHarness();
		await service.updateLastActiveDate(user());
		jest.setSystemTime(new Date('2026-10-04T00:00:29Z'));
		await service.updateLastActiveDate(user());
		expect(users.update).toHaveBeenCalledTimes(1);
		jest.setSystemTime(new Date('2026-10-04T00:00:30Z'));
		await service.updateLastActiveDate(user());
		expect(users.update).toHaveBeenCalledTimes(2);
	});

	test('releases its failed claim so the next connection can retry', async () => {
		const { service, users, redis } = createHarness();
		users.update.mockRejectedValueOnce(new Error('database unavailable'));
		await expect(service.updateLastActiveDate(user())).rejects.toThrow('database unavailable');
		await service.updateLastActiveDate(user());
		expect(users.update).toHaveBeenCalledTimes(2);
		expect(redis.eval).toHaveBeenCalledTimes(1);
	});

	test('does not remove a newer claim when an older write fails', async () => {
		const { service, users, claims } = createHarness();
		users.update.mockImplementationOnce(async () => {
			claims.set('user:last-active-write:user-id', { token: 'newer-claim', expiresAt: Date.now() + 30_000 });
			throw new Error('database unavailable');
		});
		await expect(service.updateLastActiveDate(user())).rejects.toThrow('database unavailable');
		expect(claims.get('user:last-active-write:user-id')?.token).toBe('newer-claim');
	});

	test('waits for both hibernation wake-up writes before resolving', async () => {
		const { service, query, users, followings } = createHarness();
		await service.updateLastActiveDate(user('sleeping-user', true));
		expect(query.returning).toHaveBeenCalledWith(['isHibernated']);
		expect(users.update).toHaveBeenCalledWith('sleeping-user', { isHibernated: false });
		expect(followings.update).toHaveBeenCalledWith({ followerId: 'sleeping-user' }, { isFollowerHibernated: false });
	});
});
