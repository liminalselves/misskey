/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { describe, expect, test, vi } from 'vitest';
import { AgentMessageNotifyService } from '@/core/AgentMessageNotifyService.js';
import AgentSessionRead from '@/server/api/endpoints/agents/sessions/read.js';

function createNotifyHarness(opts: {
	unreadSessions?: string[];
	remainingAfterOp?: number;
	marker?: string | null;
	firstUnread?: string | null;
	count?: string | null;
	reconcileRemaining?: { count: number; first: string | null; last: string | null };
} = {}) {
	const pipelineOps: Array<[string, ...unknown[]]> = [];
	const redisClient = {
		multi: () => {
			const pipe: Record<string, unknown> = {
				del: (...args: unknown[]) => { pipelineOps.push(['del', ...args]); return pipe; },
				srem: (...args: unknown[]) => { pipelineOps.push(['srem', ...args]); return pipe; },
				set: (...args: unknown[]) => { pipelineOps.push(['set', ...args]); return pipe; },
				incr: (...args: unknown[]) => { pipelineOps.push(['incr', ...args]); return pipe; },
				sadd: (...args: unknown[]) => { pipelineOps.push(['sadd', ...args]); return pipe; },
				exec: vi.fn(async () => []),
			};
			return pipe;
		},
		smembers: vi.fn(async () => opts.unreadSessions ?? []),
		scard: vi.fn(async () => opts.remainingAfterOp ?? 0),
		mget: vi.fn(async () => [opts.marker ?? null, opts.firstUnread ?? null, opts.count ?? null]),
		eval: vi.fn(async () => 1),
	};
	const qb: Record<string, unknown> = {
		select: () => qb,
		addSelect: () => qb,
		where: () => qb,
		andWhere: () => qb,
		getRawOne: vi.fn(async () => opts.reconcileRemaining ?? { count: 0, first: null, last: null }),
	};
	const globalEventService = {
		publishMainStream: vi.fn(),
	};
	const service = new AgentMessageNotifyService(
		{ createQueryBuilder: () => qb } as never,
		redisClient as never,
		globalEventService as never,
		{ pushNotification: vi.fn() } as never,
	);
	return { service, redisClient, globalEventService, pipelineOps };
}

describe('AgentMessageNotifyService agentRead emission', () => {
	test('readAgentMessages publishes agentRead for single session and read-all', async () => {
		const single = createNotifyHarness({ remainingAfterOp: 1 });
		await single.service.readAgentMessages('user1', 's1');
		expect(single.pipelineOps).toContainEqual(['srem', 'newAgentMessagesExists:user1', 's1']);
		expect(single.globalEventService.publishMainStream).toHaveBeenCalledWith('user1', 'agentRead', {
			hasUnreadAgentMessages: true,
		});

		const readAll = createNotifyHarness({ unreadSessions: ['s1', 's2'], remainingAfterOp: 0 });
		await readAll.service.readAgentMessages('user1');
		expect(readAll.pipelineOps).toContainEqual(['del', 'newAgentMessageExists:user1:s1']);
		expect(readAll.pipelineOps).toContainEqual(['del', 'newAgentMessageExists:user1:s2']);
		expect(readAll.globalEventService.publishMainStream).toHaveBeenCalledWith('user1', 'agentRead', {
			hasUnreadAgentMessages: false,
		});
	});

	test('reconcileUnreadMessages publishes agentRead after reconciling unread state', async () => {
		const h = createNotifyHarness({
			marker: 'm2',
			firstUnread: 'm1',
			count: '2',
			remainingAfterOp: 0,
			reconcileRemaining: { count: 0, first: null, last: null },
		});
		await h.service.reconcileUnreadMessages('user1', 's1');
		expect(h.redisClient.eval).toHaveBeenCalledTimes(1);
		expect(h.globalEventService.publishMainStream).toHaveBeenCalledWith('user1', 'agentRead', {
			hasUnreadAgentMessages: false,
		});
	});

	test('agents/sessions/read delegates agentRead emission to AgentMessageNotifyService', async () => {
		const h = createNotifyHarness({ remainingAfterOp: 0 });
		const endpoint = new AgentSessionRead(
			{ findOneBy: async () => ({ id: 's1', userId: 'user1' }) } as never,
			h.service,
		);
		await endpoint.exec({ sessionId: 's1' }, { id: 'user1' } as never, null);
		expect(h.globalEventService.publishMainStream).toHaveBeenCalledTimes(1);
		expect(h.globalEventService.publishMainStream).toHaveBeenCalledWith('user1', 'agentRead', {
			hasUnreadAgentMessages: false,
		});
	});
});
