/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi, describe, test, expect } from 'vitest';
import { UserWebSocketStatusService } from '@/core/UserWebSocketStatusService.js';

function createRedis() {
	const multi = {
		incr: vi.fn(() => multi),
		expire: vi.fn(() => multi),
		setex: vi.fn(() => multi),
		del: vi.fn(() => multi),
		exec: vi.fn(async () => []),
	};
	const redis = {
		eval: vi.fn(async (..._args: unknown[]) => 0),
		multi: vi.fn(() => multi),
		get: vi.fn(async () => null),
		expire: vi.fn(async () => 1),
		setex: vi.fn(async () => 'OK'),
		decr: vi.fn(async () => 0),
	};
	return { redis, multi };
}

describe('UserWebSocketStatusService', () => {
	test('setUserOnline keeps the multi pipeline', async () => {
		const { redis, multi } = createRedis();
		const service = new UserWebSocketStatusService(redis as never);

		await service.setUserOnline('user-1');

		expect(multi.incr).toHaveBeenCalledWith('userWsConnCount:user-1');
		expect(multi.setex).toHaveBeenCalledWith('userWsOnline:user-1', 130, '1');
		expect(multi.exec).toHaveBeenCalledTimes(1);
	});

	test('setUserOffline runs decr + del/expire atomically in one Lua script', async () => {
		const { redis } = createRedis();
		const service = new UserWebSocketStatusService(redis as never);

		await service.setUserOffline('user-1');

		expect(redis.eval).toHaveBeenCalledTimes(1);
		const args = redis.eval.mock.calls[0]!;
		// 脚本、numKeys=2、连接计数键、在线标记键、TTL
		expect(args[1]).toBe(2);
		expect(args[2]).toBe('userWsConnCount:user-1');
		expect(args[3]).toBe('userWsOnline:user-1');
		expect(args[4]).toBe(130);
		const script = String(args[0]);
		// decr 归零 → 删除两个键；未归零 → 续期两个键，全在一个原子脚本内
		expect(script).toContain("redis.call('DECR', KEYS[1])");
		expect(script).toContain("redis.call('DEL', KEYS[1])");
		expect(script).toContain("redis.call('DEL', KEYS[2])");
		expect(script).toContain("redis.call('EXPIRE', KEYS[1], ARGV[1])");
		expect(script).toContain("redis.call('SETEX', KEYS[2], ARGV[1], '1')");
	});
});
