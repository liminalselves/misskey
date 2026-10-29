/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { fetchAgentBillingPage } from '@/server/api/endpoints/agents/_billing-logs.js';
import { vi, describe, test, expect } from 'vitest';
import { withWritableAgentSession } from '@/server/api/endpoints/agents/_with-agent-lock.js';
import { reconcileUnread } from '@/misc/reconcile-unread.js';
import { readBodyWithLimit } from '@/misc/read-body-with-limit.js';

vi.doMock('../../src/core/AgentService.js', () => ({
	AgentService: class {}, escapeAgentXmlText: (text: string) => text,
	AGENT_LLM_MEMORY_XML_OPEN: '<memory>', AGENT_LLM_MEMORY_XML_CLOSE: '</memory>',
}));
vi.doMock('../../src/core/QueryService.js', () => ({ QueryService: class {} }));
vi.doMock('../../src/core/RoleService.js', () => ({ RoleService: class {} }));
vi.doMock('../../src/core/MetaService.js', () => ({ MetaService: class {} }));
vi.doMock('../../src/core/S3Service.js', () => ({ S3Service: class {} }));
const { default: DownloadUrl } = await import('../../src/server/api/endpoints/drive/files/download-url.js');
const { default: DeleteCharacter } = await import('../../src/server/api/endpoints/agents/characters/delete.js');

vi.doMock('../../src/core/AgentDashscopeMemoryService.js', () => ({ AgentDashscopeMemoryService: class {} }));
vi.doMock('../../src/core/AgentModelUsageService.js', () => ({ AgentModelUsageService: class {} }));
vi.doMock('../../src/core/AgentTokenService.js', () => ({
	AgentTokenService: class {}, AGENT_LLM_APPROX_CHARS_PER_TOKEN: 3,
	AGENT_OVERVIEW_SCAN_LIMIT: 500, AGENT_SEND_PATH_SCAN_LIMIT: 500,
}));
vi.doMock('../../src/core/NotificationService.js', () => ({ NotificationService: class {} }));
vi.doMock('../../src/core/UserSuspendService.js', () => ({ UserSuspendService: class {} }));
const { AgentCompressionMemoryService } = await import('../../src/core/AgentCompressionMemoryService.js');
const { default: QuickAction } = await import('../../src/server/api/endpoints/admin/agents/governance/quick-action.js');

const me = { id: 'reader1' };

describe('Agent session mutation boundary', () => {
	test('rechecks reply occupancy after taking the session lock', async () => {
		const manager = { findOne: vi.fn(async () => ({ id: 'session1', agentReplyPending: true })) };
		const db = { transaction: async (callback: (manager: unknown) => Promise<unknown>) => callback(manager) };
		const mutate = vi.fn<() => Promise<void>>();
		await expect(withWritableAgentSession(db as never, 'session1', me.id, mutate)).rejects.toMatchObject({ code: 'AGENT_REPLY_PENDING' });
		expect(mutate).not.toHaveBeenCalled();
		expect(manager.findOne.mock.calls[0]).toBeDefined();
	});

	test('does not invoke a mutation for a missing or foreign session', async () => {
		const db = { transaction: async (callback: (manager: unknown) => Promise<unknown>) => callback({ findOne: async () => null }) };
		const mutate = vi.fn<() => Promise<void>>();
		await expect(withWritableAgentSession(db as never, 'session1', me.id, mutate)).rejects.toMatchObject({ code: 'NO_SUCH_SESSION' });
		expect(mutate).not.toHaveBeenCalled();
	});

	test('rejects deleting a character referenced by a session before any cascade', async () => {
		const manager = {
			findOne: async () => ({ id: 'character1', userId: me.id }),
			existsBy: async () => true,
			delete: vi.fn<() => Promise<void>>(),
		};
		const db = { transaction: async (callback: (manager: unknown) => Promise<unknown>) => callback(manager) };
		const endpoint = new DeleteCharacter(db as never, { assertAgentsEnabled: () => {} } as never);
		await expect(endpoint.exec({ characterId: 'character1' }, me as never, null)).rejects.toMatchObject({ code: 'AGENT_CHARACTER_IN_USE' });
		expect(manager.delete).not.toHaveBeenCalled();
	});
});

describe('Unread reconciliation', () => {
	const keys: [string, string, string, string] = ['marker', 'first', 'count', 'all'];

	test('retries from the new range if a notification changes the snapshot', async () => {
		const snapshots = [['m3', 'm1', '3'], ['m4', 'm1', '4']];
		const redis = {
			mget: vi.fn(async () => snapshots.shift()!),
			eval: vi.fn<(...args: unknown[]) => Promise<number>>().mockResolvedValueOnce(0).mockResolvedValueOnce(1),
		};
		const load = vi.fn(async (first: string, last: string) => ({ count: 2, first, last }));
		await reconcileUnread(redis as never, keys, 'room:r1', load);
		expect(load.mock.calls).toEqual([['m1', 'm3'], ['m1', 'm4']]);
		expect(redis.eval.mock.calls[1]!.slice(6)).toEqual(['m4', 'm1', '4', '2', 'm1', 'm4', 'room:r1']);
	});

	test('retains legacy unknown-count dots instead of inventing a read receipt', async () => {
		const redis = { mget: async () => ['m3', null, null], eval: vi.fn() };
		const load = vi.fn<() => Promise<never>>();
		await reconcileUnread(redis as never, keys, 'session1', load);
		expect(load).not.toHaveBeenCalled();
		expect(redis.eval).not.toHaveBeenCalled();
	});
});

function downloadHarness(owner = 'owner1', visibleAt = -1, blocked = false) {
	let index = 0;
	const query = () => {
		const readable = index++ === visibleAt;
		const builder = {
			where: (..._args: unknown[]) => builder,
			andWhere: (..._args: unknown[]) => builder,
			leftJoin: (..._args: unknown[]) => builder,
			innerJoin: (..._args: unknown[]) => builder,
			getExists: async () => readable,
		};
		return builder;
	};
	const db = { getRepository: () => ({ createQueryBuilder: query }) };
	const files = { findOneBy: async () => ({ id: 'file1', userId: owner, isAgentImageBlocked: blocked, url: 'https://files.example/image.png' }) };
	const config = { url: 'https://example.com' };
	const endpoint = new DownloadUrl(db as never, { generateVisibilityQuery: () => {} } as never,
		{ isModerator: async () => false } as never, files as never, config as never,
		{ fetch: async () => ({ useObjectStorage: false }) } as never, {} as never);
	return endpoint;
}

describe('Download authorization', () => {
	test('allows the owner without requiring a content attachment', async () => {
		await expect(downloadHarness(me.id).exec({ fileId: 'file1' }, me as never, null)).resolves.toHaveProperty('url');
	});

	test.each([0, 1, 2, 3, 4])('allows files attached to a readable content category %i', async index => {
		await expect(downloadHarness('owner1', index).exec({ fileId: 'file1' }, me as never, null)).resolves.toHaveProperty('url');
	});

	test('rejects an unrelated private file', async () => {
		await expect(downloadHarness().exec({ fileId: 'file1' }, me as never, null)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
	});

	test('keeps the image-ban gate even for the owner', async () => {
		await expect(downloadHarness(me.id, -1, true).exec({ fileId: 'file1' }, me as never, null)).rejects.toMatchObject({ code: 'NO_SUCH_FILE' });
	});
});

describe('Compression result commit boundary', () => {
	test.each(['deleted', 'edited', 'unchanged'])('checks source messages again after generation: %s', async change => {
		const source = { id: 'm1', role: 'user', content: 'original' };
		const insert = vi.fn<() => Promise<void>>();
		const builder = { select: () => builder, where: () => builder, getRawOne: async () => ({ m: '0' }) };
		const manager = {
			findOne: async () => ({ id: 's1', timeAwarenessEnabled: false }),
			find: async () => change === 'deleted' ? [] : [{ ...source, content: change === 'edited' ? 'edited' : 'original' }],
			createQueryBuilder: () => builder,
			insert,
		};
		const service = new AgentCompressionMemoryService({} as never, {
			manager: { transaction: async (cb: (m: unknown) => Promise<void>) => cb(manager) },
		} as never, {} as never, {
			resolveModelApiNameForUser: async () => 'model',
			invokeChatCompletions: async () => ({ text: 'summary' }),
			formatMessageForLlmHistory: (m: { content: string }) => m.content,
			newId: () => 'sticky1',
		} as never, {} as never, {
			canAffordModelCall: async () => true, startLog: async () => ({}), finishLog: async () => {},
		} as never, {} as never);
		Object.defineProperties(service, {
			gatherCompressionCandidates: { value: async () => ({
				candidates: [source], fromId: source.id, toId: source.id, textBlob: 'user: original',
				fingerprint: createHash('sha256').update('user: original').digest('hex'), existingByFp: null,
			}) },
			reconcileStickyStates: { value: async () => {} },
		});
		await service.afterAssistantForCompression({ id: 's1', agentLongMemoryProvider: 'compression', timeAwarenessEnabled: false } as never,
			{} as never, {} as never, {} as never, me.id, [], { dMap: new Map(), hSend: 100, t1: 30, t2: 70 });
		expect(insert).toHaveBeenCalledTimes(change === 'unchanged' ? 1 : 0);
	});
});

describe('Quick-action preflight', () => {
	test('rejects a moderator suspension before banning any session', async () => {
		const write = vi.fn();
		const endpoint = new QuickAction({ findBy: async () => [{ id: 's1', userId: 'u1' }], createQueryBuilder: write } as never,
			{ findOneBy: async () => ({ id: 'u1', isSuspended: false }) } as never,
			{} as never, {} as never, { assertAgentsEnabled: () => {} } as never,
			{} as never, {} as never, {} as never, { isModerator: async () => true } as never);
		await expect(endpoint.exec({ sessionIds: ['s1'], violationCategory: 'test', suspendDurationHours: 0 }, me as never, null))
			.rejects.toMatchObject({ code: 'CANNOT_SUSPEND_MODERATOR' });
		expect(write).not.toHaveBeenCalled();
	});
});

describe('Merged billing query', () => {
	test('uses every bound parameter with BYOK/date filters and converts raw numeric credit', async () => {
		const queries: string[] = [];
		const query = async (sql: string, args: unknown[]) => {
			queries.push(sql);
			const used = [...new Set([...sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1])))].sort((a, b) => a - b);
			expect(used).toEqual(args.map((_, i) => i + 1));
			return sql.includes('COUNT(*)') ? [{ cnt: '1' }, { cnt: '1' }] : [{
				id: 'redeem1', kind: 'redeem', ts: new Date('2026-10-01'), cost: '12.5', code: 'test-code',
			}];
		};
		const result = await fetchAgentBillingPage({
			agentModelUsageLogsRepository: { query }, agentRedeemCodesRepository: {},
			agentUserModelsRepository: { find: async () => [{ id: 'byok1' }] },
			metaService: { fetch: async () => ({ agentLlmModels: [] }) },
			agentVisionService: { listAvailableVisionModels: async () => [] },
		} as never, { userId: me.id, page: 2, pageSize: 20, untilDate: new Date('2026-10-02') });
		expect(queries).toHaveLength(2);
		expect(result).toMatchObject({ total: 2, items: [{ amount: 12.5 }] });
	});
});

describe('Bounded response body', () => {
	test('cancels an oversized stream', async () => {
		const cancel = vi.fn<() => void>();
		const response = new Response(new ReadableStream({
			start(controller) { controller.enqueue(new Uint8Array(8)); }, cancel,
		}));
		await expect(readBodyWithLimit(response, 4)).rejects.toThrow();
		expect(cancel).toHaveBeenCalled();
	});

	test('propagates body aborts after headers rather than waiting forever', async () => {
		let controller!: ReadableStreamDefaultController<Uint8Array>;
		const response = new Response(new ReadableStream({ start(value) { controller = value; } }));
		const body = readBodyWithLimit(response, 4);
		controller.error(new DOMException('Timed out', 'AbortError'));
		await expect(body).rejects.toMatchObject({ name: 'AbortError' });
	});
});
