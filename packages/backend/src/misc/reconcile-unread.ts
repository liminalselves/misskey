/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Redis } from 'ioredis';

const RECONCILE_UNREAD = `
if (redis.call('GET', KEYS[1]) or '') ~= ARGV[1]
  or (redis.call('GET', KEYS[2]) or '') ~= ARGV[2]
  or (redis.call('GET', KEYS[3]) or '') ~= ARGV[3] then return 0 end
if ARGV[4] == '0' then
  redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
  redis.call('SREM', KEYS[4], ARGV[7])
else
  redis.call('SET', KEYS[1], ARGV[6])
  redis.call('SET', KEYS[2], ARGV[5])
  if ARGV[3] ~= '' then redis.call('SET', KEYS[3], ARGV[4]) end
end
return 1
`;

export async function reconcileUnread(
	redis: Redis,
	keys: [string, string, string, string],
	conversationId: string,
	loadRange: (first: string, last: string) => Promise<{ count: number; first: string | null; last: string | null }>,
): Promise<void> {
	for (;;) {
		const [marker, first, count] = await redis.mget(...keys.slice(0, 3));
		// Legacy unread dots have no recoverable range; do not invent a read receipt.
		if (marker == null || first == null) return;
		const remaining = await loadRange(first, marker);
		const applied = await redis.eval(RECONCILE_UNREAD, 4, ...keys,
			marker, first, count ?? '', String(remaining.count), remaining.first ?? '', remaining.last ?? '', conversationId);
		if (applied === 1) return;
	}
}
