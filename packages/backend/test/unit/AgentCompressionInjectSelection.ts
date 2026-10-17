/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { jest } from '@jest/globals';
import {
	AgentCompressionMemoryService,
	AGENT_COMPRESSION_MEMORY_XML_OPEN,
	AGENT_COMPRESSION_MEMORY_XML_CLOSE,
	type CompressionScanRow,
} from '@/core/AgentCompressionMemoryService.js';
import { MiAgentSessionCompressionSticky } from '@/models/AgentSessionCompressionSticky.js';
import type { MiAgentSession } from '@/models/AgentSession.js';
import type { MiMeta } from '@/models/Meta.js';
import UserOverview, { meta as userMeta } from '@/server/api/endpoints/agents/sessions/compression-overview.js';
import ReviewOverview, { meta as reviewMeta } from '@/server/api/endpoints/admin/agents/governance/session-review/compression-overview.js';

function sticky(id: string, summaryText: string, sortIndex = 1, patch: Partial<MiAgentSessionCompressionSticky> = {}): MiAgentSessionCompressionSticky {
	return Object.assign(new MiAgentSessionCompressionSticky(), {
		id, summaryText, sortIndex, state: 'active', userOverridden: false, errorMessage: null,
		fromMessageId: 'imported', toMessageId: 'deleted', createdAt: new Date(), updatedAt: new Date(),
	}, patch);
}

function memoryService() {
	return new AgentCompressionMemoryService({} as never, {} as never, {} as never,
		{} as never, {} as never, {} as never, {} as never);
}

function message(id: string, content: string, index: number): CompressionScanRow {
	return { id, content, role: 'user', createdAt: new Date(index * 1000) };
}

describe('Compression injection tail window', () => {
	const service = memoryService();

	test('joins in sticky order, including independent stickies, without mutating the input', () => {
		const stickies = [sticky('c', 'third', 2), sticky('b', ' second ', 1), sticky('a', 'first', 1)];
		const result = service.computeCompressionInjectText(stickies, 4000);
		expect(result.text).toBe('first\n\nsecond\n\nthird');
		expect([...result.injectedIds]).toEqual(['a', 'b', 'c']);
		expect(result.eligibleChars).toBe(result.text.length);
		expect(stickies.map(s => s.id)).toEqual(['c', 'b', 'a']);
	});

	test('keeps the suffix of the whole text instead of packing individual stickies', () => {
		const stickies = [sticky('old', 'old', 1), sticky('middle', 'M'.repeat(500), 2), sticky('new', 'latest', 3)];
		const result = service.computeCompressionInjectText(stickies, 200);
		expect(result.text).toBe(`${'M'.repeat(192)}\n\nlatest`);
		expect([...result.injectedIds]).toEqual(['middle', 'new']);
		expect(result.injectedChars).toBe(200);
		expect(result.eligibleChars).toBe(513);
	});

	test('excludes non-active, empty and uncorrected failed summaries before joining', () => {
		const stickies = [
			sticky('dormant', 'dormant', 1, { state: 'dormant' }),
			sticky('failed', 'failed', 2, { state: 'failed' }),
			sticky('stale', 'stale', 3, { state: 'stale' }),
			sticky('empty', ' \n\t ', 4),
			sticky('error', 'error', 5, { errorMessage: 'failed' }),
			sticky('corrected', 'corrected', 6, { errorMessage: 'failed', userOverridden: true }),
			sticky('good', 'good', 7),
		];
		expect(service.computeCompressionInjectText(stickies, 200)).toMatchObject({
			text: 'corrected\n\ngood', injectedIds: new Set(['corrected', 'good']), eligibleCount: 2,
		});
		expect(service.buildCompressionSystemBlock(stickies.slice(0, 5), 200)).toEqual({ block: '', injectedIds: new Set() });
	});

	test.each([198, 199, 200])('does not leave a partial separator before a %i-character suffix', length => {
		const result = service.computeCompressionInjectText([sticky('a', 'A'.repeat(20)), sticky('b', 'B'.repeat(length), 2)], 200);
		expect(result.text).toBe('B'.repeat(length));
		expect([...result.injectedIds]).toEqual(['b']);
	});

	test.each(['&', '<', '>'])('counts escaped characters and never cuts inside the entity for %s', symbol => {
		const result = service.computeCompressionInjectText([sticky('a', `${'x'.repeat(20)}${symbol}${'z'.repeat(198)}`)], 200);
		expect(result.text).toBe('z'.repeat(198));
		expect(result.injectedChars).toBeLessThanOrEqual(200);
		const whole = service.computeCompressionInjectText([sticky('b', '<a&b>')], 200);
		expect(whole.text).toBe('&lt;a&amp;b&gt;');
	});

	test('does not split a UTF-16 surrogate pair at the cut', () => {
		const result = service.computeCompressionInjectText([sticky('a', `x😀${'z'.repeat(199)}`)], 200);
		expect(result.text).toBe('z'.repeat(199));
	});

	test.each([200, 4000, 50000])('preview and wrapped prompt use the same text window at cap %i', cap => {
		const stickies = [sticky('a', 'old', 1), sticky('b', '<&>'.repeat(500), 2)];
		const result = service.computeCompressionInjectText(stickies, cap);
		const block = service.buildCompressionSystemBlock(stickies, cap);
		expect(block).toEqual({
			block: AGENT_COMPRESSION_MEMORY_XML_OPEN + result.text + AGENT_COMPRESSION_MEMORY_XML_CLOSE,
			injectedIds: result.injectedIds,
		});
		expect(service.computeCompressionInjectionPreview(stickies, cap)).toEqual({
			maxChars: cap, eligibleCount: 2, eligibleChars: result.eligibleChars,
			willInjectCount: result.injectedIds.size, willInjectChars: result.text.length,
		});
		expect(result.text.length).toBeLessThanOrEqual(cap);
	});

	test('excludes raw history only for retained summaries with resolvable ranges', () => {
		const rows = [message('m1', 'old raw', 1), message('m2', 'replaced raw', 2), message('m3', 'keep raw', 3)];
		const stickies = [
			sticky('old', 'old summary', 1, { fromMessageId: 'm1', toMessageId: 'm1' }),
			sticky('retained', 'new summary', 2, { fromMessageId: 'm2', toMessageId: 'm2' }),
			sticky('independent', 'I'.repeat(188), 3),
		];
		const injected = service.buildCompressionSystemBlock(stickies, 200);
		expect(injected.injectedIds).toEqual(new Set(['retained', 'independent']));
		const boundaries = new Map(rows.map(m => [m.id, m]));
		expect(service.buildPairsExcludingInjectedCompression(rows, stickies.filter(s => injected.injectedIds.has(s.id)), boundaries))
			.toEqual([{ role: 'user', content: 'old raw' }, { role: 'user', content: 'keep raw' }]);
		expect(service.buildPairsExcludingInjectedCompression(rows, [stickies[2]!], boundaries)).toHaveLength(3);
	});
});

function compressionHarness(rows: CompressionScanRow[], currentRows: CompressionScanRow[] = rows) {
	const insert = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
	const builder = { select: () => builder, where: () => builder, getRawOne: async () => ({ m: '0' }) };
	const manager = {
		findOne: async () => ({ id: 's1', timeAwarenessEnabled: true }),
		find: jest.fn(async () => currentRows),
		createQueryBuilder: () => builder,
		insert,
	};
	const repository = {
		find: jest.fn(async (): Promise<MiAgentSessionCompressionSticky[]> => []), findOne: async () => null,
		manager: { transaction: async (cb: (m: unknown) => Promise<void>) => cb(manager) },
	};
	const invoke = jest.fn(async (_params: { userText: string }) => ({ text: 'summary' }));
	const format = jest.fn((m: { content: string }) => `[time]${m.content}`);
	const service = new AgentCompressionMemoryService({ find: async () => rows } as never, repository as never, {} as never, {
		resolveModelApiNameForUser: async () => 'model', invokeChatCompletions: invoke,
		formatMessageForLlmHistory: format, newId: () => 'sticky1',
	} as never, {} as never, {
		canAffordModelCall: async () => true, startLog: async () => ({}), finishLog: async () => {},
	} as never, {} as never);
	jest.spyOn(service, 'reconcileStickyStates').mockResolvedValue(undefined);
	const sidecar = { dMap: new Map(rows.map((m, i) => [m.id, 95 - i])), hSend: 100, t1: 80, t2: 90 };
	const session = { id: 's1', agentLongMemoryProvider: 'compression', timeAwarenessEnabled: true } as MiAgentSession;
	const run = (maxInput: number) => service.afterAssistantForCompression(session, {} as never, {} as never,
		{ agentCompressionMaxInputChars: maxInput } as MiMeta, 'owner', [...rows].reverse(), sidecar);
	return { service, invoke, format, insert, manager, repository, sidecar, run, session };
}

describe('Compression input and declared range', () => {
	test('stops at complete formatted messages and declares only the sent prefix', async () => {
		const rows = [message('m1', 'a'.repeat(220), 1), message('m2', 'b'.repeat(220), 2), message('m3', 'c'.repeat(220), 3)];
		const harness = compressionHarness(rows, rows.slice(0, 2));
		await harness.run(500);
		const text = `user: [time]${rows[0]!.content}\n\nuser: [time]${rows[1]!.content}`;
		expect(harness.invoke).toHaveBeenCalledWith(expect.objectContaining({ userText: text }));
		expect(harness.insert).toHaveBeenCalledWith(MiAgentSessionCompressionSticky, expect.objectContaining({
			fromMessageId: 'm1', toMessageId: 'm2', sourceFingerprint: createHash('sha256').update(text).digest('hex'),
		}));
		expect(harness.manager.find).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			where: expect.objectContaining({ id: expect.objectContaining({ _value: ['m1', 'm2'] }) }),
		}));
	});

	test('leaves unsent messages available for the next compression batch', async () => {
		const rows = [message('m1', 'a'.repeat(220), 1), message('m2', 'b'.repeat(220), 2), message('m3', 'c'.repeat(220), 3)];
		const harness = compressionHarness(rows, rows.slice(0, 2));
		await harness.run(500);
		harness.repository.find.mockResolvedValueOnce([
			sticky('saved', 'summary', 1, { state: 'dormant', fromMessageId: 'm1', toMessageId: 'm2' }),
		]);
		harness.manager.find.mockResolvedValueOnce(rows.slice(2));
		await harness.run(500);
		expect(harness.invoke.mock.calls[1]![0].userText).toBe(`user: [time]${rows[2]!.content}`);
		expect(harness.insert).toHaveBeenNthCalledWith(2, MiAgentSessionCompressionSticky, expect.objectContaining({ fromMessageId: 'm3', toMessageId: 'm3' }));
	});

	test('includes role, formatting and separators in the input budget', async () => {
		const rows = [message('m1', 'a'.repeat(240), 1), message('m2', 'b'.repeat(240), 2)];
		const harness = compressionHarness(rows, rows.slice(0, 1));
		await harness.run(500);
		expect(harness.invoke.mock.calls[0]![0].userText).toBe(`user: [time]${rows[0]!.content}`);
		expect(harness.insert).toHaveBeenCalledWith(MiAgentSessionCompressionSticky, expect.objectContaining({ fromMessageId: 'm1', toMessageId: 'm1' }));
	});

	test('preserves one oversized message in full rather than falsely claiming its truncated tail', async () => {
		const rows = [message('m1', 'a'.repeat(900), 1), message('m2', 'tail', 2)];
		const harness = compressionHarness(rows, rows.slice(0, 1));
		await harness.run(500);
		expect(harness.invoke.mock.calls[0]![0].userText).toBe(`user: [time]${rows[0]!.content}`);
		expect(harness.insert).toHaveBeenCalledWith(MiAgentSessionCompressionSticky, expect.objectContaining({ fromMessageId: 'm1', toMessageId: 'm1' }));
	});

	test('does not invoke the model until uncovered messages reach the staged band', async () => {
		const rows = [message('m1', 'prep', 1)];
		const harness = compressionHarness(rows);
		harness.sidecar.dMap.set('m1', 85);
		await harness.run(500);
		expect(harness.invoke).not.toHaveBeenCalled();
		expect(harness.insert).not.toHaveBeenCalled();
	});
});

describe('Compression overview preview mirrors', () => {
	test('user and review schemas stay identical for injection preview', () => {
		expect(reviewMeta.res.properties.injectionPreview).toEqual(userMeta.res.properties.injectionPreview);
	});

	test.each(['user', 'review'])('%s overview reuses injection calculation without requiring message anchors', async kind => {
		const service = memoryService();
		const stickies = [sticky('independent', 'M'.repeat(800))];
		jest.spyOn(service, 'buildSendPathBudgets').mockResolvedValue({ historyBudget: 1000, charsPerToken: 3, historyBudgetTokens: 333 } as never);
		jest.spyOn(service, 'getCompressionOverviewData').mockResolvedValue({
			historyBudgetTokens: 333, t1Tokens: 266, t2Tokens: 299, messages: [],
			stickies: stickies.map(s => Object.assign(s, { fromMessagePreview: '…', toMessagePreview: '…' })),
			compressionSidecarFailedAt: null,
		});
		const row = { id: 's1', userId: 'owner', dialogueStyleId: 'style', agentLongMemoryProvider: 'compression', agentCompressionInjectMaxChars: 50000 };
		const instance = { agentCompressionInjectMaxChars: 400 };
		const sessions = { findOneBy: async () => row };
		const resource = { findOneByOrFail: async () => ({}) };
		const agent = {
			assertAgentsEnabled: () => {}, assertAgentUserSessionChatAllowed: () => {}, assertSessionStylePolicy: () => {},
			effectiveCharacterForLlm: () => ({}), effectiveStyleForSession: () => ({}),
		};
		const Endpoint = kind === 'user' ? UserOverview : ReviewOverview;
		const endpoint = new Endpoint(sessions as never, resource as never, resource as never, agent as never,
			{ fetch: async () => instance } as never, service, {
				resolveTokenConfigForUser: async () => ({ tokenMode: 'estimate' }), makeCounter: () => undefined,
			} as never);
		const result = await endpoint.exec({ sessionId: 's1' }, { id: 'owner' } as never, null);
		expect(result.injectionPreview).toEqual({ maxChars: 400, eligibleCount: 1, eligibleChars: 800, willInjectCount: 1, willInjectChars: 400 });
		instance.agentCompressionInjectMaxChars = 600;
		const updated = await endpoint.exec({ sessionId: 's1' }, { id: 'owner' } as never, null);
		expect(updated.injectionPreview).toMatchObject({ maxChars: 600, willInjectChars: 600 });
	});
});
