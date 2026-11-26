/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { describe, expect, test, vi } from 'vitest';
import { NotificationService, compareRedisStreamIds } from '@/core/NotificationService.js';
import NotificationsMarkAllAsRead from '@/server/api/endpoints/notifications/mark-all-as-read.js';
import NotificationsFlush from '@/server/api/endpoints/notifications/flush.js';
import INotifications from '@/server/api/endpoints/i/notifications.js';
import INotificationsGrouped from '@/server/api/endpoints/i/notifications-grouped.js';

function createHarness(opts: {
	latestReadId?: string | null;
	latestStreamId?: string | null;
	xaddId?: string;
	setImpl?: (key: string, val: string) => Promise<unknown>;
} = {}) {
	let storedReadId: string | null = opts.latestReadId ?? null;
	const redisClient = {
		get: vi.fn(async () => storedReadId),
		set: vi.fn(async (key: string, val: string) => {
			if (opts.setImpl) return await opts.setImpl(key, val);
			storedReadId = val;
			return 'OK';
		}),
		del: vi.fn(async () => 1),
		xrevrange: vi.fn(async () => (opts.latestStreamId ? [[opts.latestStreamId, ['data', '{}']]] : [])),
		xadd: vi.fn(async () => opts.xaddId ?? '1700000000000-10'),
	};
	const globalEventService = {
		publishMainStream: vi.fn(),
	};
	const pushNotificationService = {
		pushNotification: vi.fn(),
	};
	const notificationEntityService = {
		pack: vi.fn(async (n: Record<string, unknown>) => ({ id: n.id, type: n.type })),
	};
	const idService = {
		gen: vi.fn(() => 'notif-1'),
		parseFull: vi.fn(() => ({ date: 1700000000000n, additional: 10n })),
	};
	const service = new NotificationService(
		{ perUserNotificationsMaxCount: 100 } as never,
		redisClient as never,
		{} as never,
		{ existsBy: vi.fn(async () => false) } as never,
		notificationEntityService as never,
		idService as never,
		globalEventService as never,
		pushNotificationService as never,
		{ userProfileCache: { fetch: vi.fn(async () => ({ enableAppPush: false })) } } as never,
		{} as never,
		{ isUserOnline: vi.fn(async () => true) } as never,
		{ getLogger: () => ({ error: vi.fn() }) } as never,
	);
	return { service, redisClient, globalEventService, pushNotificationService };
}

describe('compareRedisStreamIds', () => {
	test('orders same-millisecond stream IDs numerically across digit widths and 64-bit sequences', () => {
		expect(compareRedisStreamIds('1700000000000-2', '1700000000000-10')).toBeLessThan(0);
		expect(compareRedisStreamIds('1700000000000-10', '1700000000000-2')).toBeGreaterThan(0);
		expect(compareRedisStreamIds('1700000000000-10', '1700000000000-10')).toBe(0);
		expect(compareRedisStreamIds('999999999999-0', '1000000000000-0')).toBeLessThan(0);
		expect(compareRedisStreamIds('1700000000000-18446744073709551614', '1700000000000-18446744073709551615')).toBeLessThan(0);
	});
});

describe('NotificationService async persistence and stream ID ordering', () => {
	test('readAllNotification awaits redisClient.set before returning and compares stream IDs numerically', async () => {
		const deferred = Promise.withResolvers<string>();
		const { service, redisClient, globalEventService } = createHarness({
			latestReadId: '1700000000000-2',
			latestStreamId: '1700000000000-10',
			setImpl: async () => await deferred.promise,
		});

		let settled = false;
		const run = service.readAllNotification('user1').then(() => {
			settled = true;
		});

		await vi.waitFor(() => {
			expect(redisClient.set).toHaveBeenCalledWith('latestReadNotification:user1', '1700000000000-10');
		});
		expect(settled).toBe(false);

		deferred.resolve('OK');
		await run;
		expect(settled).toBe(true);
		expect(globalEventService.publishMainStream).toHaveBeenCalledWith('user1', 'readAllNotifications');
	});

	test('createNotification unread check compares stream IDs numerically (-2 read does not suppress -10 unread)', async () => {
		const unreadHarness = createHarness({
			latestReadId: '1700000000000-2',
			xaddId: '1700000000000-10',
		});
		try {
			unreadHarness.service.createNotification('user1', 'test', {});
			await vi.waitFor(() => {
				expect(unreadHarness.globalEventService.publishMainStream).toHaveBeenCalledWith(
					'user1',
					'unreadNotification',
					expect.objectContaining({ id: 'notif-1', type: 'test' }),
				);
			});
		} finally {
			unreadHarness.service.dispose();
		}

		const readHarness = createHarness({
			latestReadId: '1700000000000-10',
			xaddId: '1700000000000-2',
		});
		try {
			readHarness.service.createNotification('user1', 'test', {});
			await vi.waitFor(() => {
				expect(readHarness.globalEventService.publishMainStream).toHaveBeenCalledWith(
					'user1',
					'notification',
					expect.objectContaining({ id: 'notif-1', type: 'test' }),
				);
			});
			await new Promise(resolve => globalThis.setTimeout(resolve, 30));
			expect(readHarness.globalEventService.publishMainStream).not.toHaveBeenCalledWith(
				'user1',
				'unreadNotification',
				expect.anything(),
			);
		} finally {
			readHarness.service.dispose();
		}
	});
});

describe('Notification read/flush HTTP endpoints await NotificationService', () => {
	test.each([
		['notifications/mark-all-as-read', 'readAllNotification'],
		['notifications/flush', 'flushAllNotifications'],
		['i/notifications', 'readAllNotification'],
		['i/notifications-grouped', 'readAllNotification'],
	] as const)('%s awaits %s before resolving', async (kind, methodName) => {
		const deferred = Promise.withResolvers<void>();
		const notificationService = {
			getNotifications: vi.fn(async () => [{ id: 'n1', type: 'follow' }]),
			readAllNotification: vi.fn(async () => await deferred.promise),
			flushAllNotifications: vi.fn(async () => await deferred.promise),
		};
		const entityService = {
			packMany: vi.fn(async () => [{ id: 'n1' }]),
			packGroupedMany: vi.fn(async () => [{ id: 'n1' }]),
		};
		const idService = { gen: vi.fn(() => 'id-1') };

		let pending: Promise<unknown>;
		if (kind === 'notifications/mark-all-as-read') {
			pending = new NotificationsMarkAllAsRead(notificationService as never).exec({}, { id: 'u1' } as never, null);
		} else if (kind === 'notifications/flush') {
			pending = new NotificationsFlush(notificationService as never).exec({}, { id: 'u1' } as never, null);
		} else if (kind === 'i/notifications') {
			pending = new INotifications(idService as never, entityService as never, notificationService as never)
				.exec({ markAsRead: true }, { id: 'u1' } as never, null);
		} else {
			pending = new INotificationsGrouped(idService as never, entityService as never, notificationService as never)
				.exec({ markAsRead: true }, { id: 'u1' } as never, null);
		}

		let settled = false;
		const tracked = pending.then(() => {
			settled = true;
		});

		await vi.waitFor(() => {
			expect(notificationService[methodName]).toHaveBeenCalled();
		});
		expect(settled).toBe(false);

		deferred.resolve();
		await tracked;
		expect(settled).toBe(true);
	});
});
