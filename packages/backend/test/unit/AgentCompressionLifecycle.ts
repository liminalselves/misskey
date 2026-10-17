/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { jest } from '@jest/globals';
import { AgentCompressionMemoryService, AGENT_OVERVIEW_SCAN_LIMIT, type CompressionScanRow } from '@/core/AgentCompressionMemoryService.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentTokenService } from '@/core/AgentTokenService.js';
import { MiAgentMessage } from '@/models/AgentMessage.js';
import type { MiAgentSession } from '@/models/AgentSession.js';
import type { MiMeta } from '@/models/Meta.js';
import { MiAgentSessionCompressionSticky } from '@/models/AgentSessionCompressionSticky.js';
import UserOverview from '@/server/api/endpoints/agents/sessions/compression-overview.js';
import ReviewOverview from '@/server/api/endpoints/admin/agents/governance/session-review/compression-overview.js';
import { invalidateMessageCompression } from '@/server/api/endpoints/agents/messages/_invalidate-compression.js';
import UpdateMessage from '@/server/api/endpoints/agents/messages/update.js';
import DeleteMessage from '@/server/api/endpoints/agents/messages/delete.js';
import RollbackMessage from '@/server/api/endpoints/agents/messages/rollback.js';

function message(id: string, index: number, patch: Partial<CompressionScanRow> = {}): CompressionScanRow {
	return { id, role: 'user', content: `source-${id}`, createdAt: new Date(index * 1000), ...patch };
}

function sticky(id: string, from: string, to: string, patch: Partial<MiAgentSessionCompressionSticky> = {}): MiAgentSessionCompressionSticky {
	return Object.assign(new MiAgentSessionCompressionSticky(), {
		id, sessionId: 's1', fromMessageId: from, toMessageId: to,
		summaryText: `summary-${id}`, state: 'dormant', userOverridden: false, errorMessage: null,
		sourceFingerprint: null, sortIndex: 1, createdAt: new Date(0), updatedAt: new Date(0),
	}, patch);
}

function harness(rows: CompressionScanRow[], stored: MiAgentSessionCompressionSticky[] = []) {
	const formatter = Object.create(AgentService.prototype) as AgentService;
	const insert = jest.fn(async (_entity: unknown, row: MiAgentSessionCompressionSticky) => { stored.push(row); });
	const builder = {
		select: jest.fn(), where: jest.fn(), set: jest.fn(), update: jest.fn(),
		getRawOne: async () => ({ m: '0' }), execute: jest.fn(async () => ({ affected: 1 })),
	};
	for (const method of ['select', 'where', 'set', 'update'] as const) builder[method].mockReturnValue(builder);
	const manager = {
		findOne: async () => ({ id: 's1', timeAwarenessEnabled: false }),
		find: jest.fn(async (_entity: unknown, options: { where: { id: { _value: string[] } } }) =>
			rows.filter(row => options.where.id._value.includes(row.id)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())),
		insert, createQueryBuilder: () => builder,
	};
	const repository = {
		find: jest.fn(async () => stored),
		findOne: jest.fn(async (options: { where: Partial<MiAgentSessionCompressionSticky> }) =>
			stored.find(row => Object.entries(options.where).every(([key, value]) => row[key as keyof MiAgentSessionCompressionSticky] === value)) ?? null),
		update: jest.fn(async () => ({ affected: 1 })),
		manager: { transaction: jest.fn(async (callback: (value: typeof manager) => Promise<void>) => callback(manager)) },
	};
	const messages = { find: jest.fn(async () => [...rows].reverse()) };
	const invoke = jest.fn(async (_params: { userText: string }) => ({ text: 'summary' }));
	const usage = { canAffordModelCall: async () => true, startLog: async () => ({}), finishLog: jest.fn(async (..._args: unknown[]) => {}) };
	const agent = {
		formatMessageForLlmHistory: formatter.formatMessageForLlmHistory,
		resolveModelApiNameForUser: async () => 'model', invokeChatCompletions: invoke, newId: () => 'generated',
		assertAgentsEnabled: () => {}, assertAgentUserSessionChatAllowed: () => {}, assertSessionStylePolicy: () => {},
		effectiveCharacterForLlm: () => ({}), effectiveStyleForSession: () => ({}),
	};
	const tokens = Object.create(AgentTokenService.prototype) as AgentTokenService;
	const service = new AgentCompressionMemoryService(messages as never, repository as never, {} as never,
		agent as never, {} as never, usage as never, tokens);
	const session = { id: 's1', userId: 'owner', characterId: 'character', dialogueStyleId: 'style', agentLongMemoryProvider: 'compression', timeAwarenessEnabled: false } as MiAgentSession;
	const instance = { agentCompressionMaxInputChars: 500, agentCompressionInjectMaxChars: 4000 } as MiMeta;
	const sidecar = { dMap: new Map(rows.map((row, i) => [row.id, 95 - i * 5])), hSend: 100, t1: 80, t2: 90 };
	const run = () => service.afterAssistantForCompression(session, {} as never, {} as never, instance, 'owner', [...rows].reverse(), sidecar);
	return { service, session, instance, sidecar, stored, repository, messages, manager, builder, insert, invoke, usage, agent, tokens, run };
}

describe('Compression context state projection', () => {
	test('activates summaries at the current window edge without persisting a preview', async () => {
		const rows = [message('m1', 1), message('m2', 2)];
		const h = harness(rows, [sticky('old', 'm1', 'm2'), sticky('independent', 'missing', 'missing'), sticky('stale', 'missing', 'missing', { state: 'stale' })]);
		const sidecar = { dMap: new Map([['m1', 110], ['m2', 90]]), hSend: 100 };
		const context = await h.service.buildCompressionContext({ session: h.session, instanceMeta: h.instance, character: {} as never, style: {} as never, sidecar });
		expect(context.block).toContain('summary-old');
		expect(context.block).toContain('summary-independent');
		expect(context.block).not.toContain('summary-stale');
		expect(context.injectedStickies.map(row => row.state)).toEqual(['active', 'active']);
		expect(h.stored.at(0)?.state).toBe('dormant');
		expect(h.repository.update).not.toHaveBeenCalled();
	});

	test('returns an active summary to dormancy when a larger window contains its sources', async () => {
		const h = harness([message('m1', 1)], [sticky('old', 'm1', 'm1', { state: 'active' })]);
		const context = await h.service.buildCompressionContext({ session: h.session, instanceMeta: h.instance, character: {} as never, style: {} as never, sidecar: { dMap: new Map([['m1', 90]]), hSend: 100 } });
		expect(context.block).toBe('');
		expect(context.injectedStickies).toHaveLength(0);
	});

	test.each(['user', 'review'])('%s overview projects current states without any database write', async kind => {
		const h = harness([message('m1', 1), message('m2', 2)], [sticky('old', 'm1', 'm2')]);
		jest.spyOn(h.service, 'buildSendPathBudgets').mockResolvedValue({ historyBudget: 300, historyBudgetTokens: 100, charsPerToken: 3 } as never);
		jest.spyOn(h.tokens, 'resolveTokenConfigForUser').mockResolvedValue({ tokenMode: 'estimate', charsPerToken: 3 } as never);
		jest.spyOn(h.tokens, 'computeMessageWeights').mockResolvedValue({
			dMap: new Map([['m1', 110], ['m2', 90]]), tokensById: new Map(), estimatedById: new Map(), useExactD: false,
		});
		const resource = { findOneByOrFail: async () => ({}) };
		const Endpoint = kind === 'user' ? UserOverview : ReviewOverview;
		const endpoint = new Endpoint({ findOneBy: async () => h.session } as never, resource as never, resource as never,
			h.agent as never, { fetch: async () => h.instance } as never, h.service, h.tokens);
		const result = await endpoint.exec({ sessionId: 's1' }, { id: 'owner' } as never, null);
		expect(result.stickies.at(0)?.state).toBe('active');
		expect(result.injectionPreview?.willInjectCount).toBe(1);
		expect(h.stored.at(0)?.state).toBe('dormant');
		expect(h.repository.update).not.toHaveBeenCalled();
		expect(h.manager.insert).not.toHaveBeenCalled();
		expect(h.repository.manager.transaction).not.toHaveBeenCalled();
		expect(h.builder.update).not.toHaveBeenCalled();
	});
});

describe('Compression source coverage', () => {
	test('stops before a covered middle message instead of claiming an unsent source', async () => {
		const h = harness([message('m1', 1), message('m2', 2), message('m3', 3)], [sticky('middle', 'm2', 'm2')]);
		await h.run();
		expect(h.invoke).toHaveBeenCalledWith(expect.objectContaining({ userText: 'user: source-m1' }));
		expect(h.insert).toHaveBeenCalledWith(MiAgentSessionCompressionSticky, expect.objectContaining({ fromMessageId: 'm1', toMessageId: 'm1' }));
	});

	test('compresses recognized image-only messages using their actual formatted description', async () => {
		const h = harness([message('image', 1, { content: '', imageFileId: 'file', imageRecognitionStatus: 'succeeded', imageRecognitionDescription: 'red sign: 42' })]);
		await h.run();
		expect(h.invoke).toHaveBeenCalledWith(expect.objectContaining({ userText: 'user: <image-recognition source="server" not-user-input="true">red sign: 42</image-recognition>' }));
		expect(h.insert).toHaveBeenCalledWith(MiAgentSessionCompressionSticky, expect.objectContaining({ fromMessageId: 'image', toMessageId: 'image' }));
	});

	test.each(['', ' \n\t '])('stores blank model output as a retryable failure: %j', async text => {
		const h = harness([message('m1', 1)]);
		h.invoke.mockResolvedValueOnce({ text });
		await h.run();
		expect(h.insert).toHaveBeenCalledWith(MiAgentSessionCompressionSticky, expect.objectContaining({ state: 'failed', summaryText: '', errorMessage: 'COMPRESSION_LLM_FAILED' }));
		expect(h.usage.finishLog).toHaveBeenCalledWith(expect.anything(), h.instance, { status: 'failed', errorCode: 'COMPRESSION_LLM' });
		await h.run();
		expect(h.invoke).toHaveBeenCalledTimes(2);
		expect(h.builder.set).toHaveBeenCalledWith(expect.objectContaining({ summaryText: 'summary', state: 'dormant', errorMessage: null }));
		expect(h.builder.where).toHaveBeenCalledWith(expect.objectContaining({ state: 'failed', userOverridden: false, updatedAt: expect.any(Date) }));
	});

	test('retries a legacy empty success instead of treating it as covered forever', async () => {
		const fingerprint = createHash('sha256').update('user: source-m1').digest('hex');
		const h = harness([message('m1', 1)], [sticky('empty', 'm1', 'm1', { summaryText: ' ', sourceFingerprint: fingerprint })]);
		await h.run();
		expect(h.invoke).toHaveBeenCalledTimes(1);
		expect(h.insert).not.toHaveBeenCalled();
		expect(h.builder.where).toHaveBeenCalledWith(expect.objectContaining({ id: 'empty', state: 'dormant', sourceFingerprint: fingerprint, userOverridden: false }));
	});

	test('loads the post-reply scan, including the assistant, with the full scan limit', async () => {
		const h = harness([message('m1', 1), message('assistant', 2, { role: 'assistant' })]);
		const compute = jest.spyOn(h.service, 'computeSidecarTokenD').mockResolvedValue({ ...h.sidecar, dMap: new Map([['m1', 95], ['assistant', 10]]) });
		await h.service.afterAssistantForCompression(h.session, {} as never, {} as never, h.instance, 'owner');
		expect(h.messages.find).toHaveBeenCalledWith(expect.objectContaining({ take: AGENT_OVERVIEW_SCAN_LIMIT }));
		expect(compute).toHaveBeenCalledWith(expect.objectContaining({ rows: expect.arrayContaining([expect.objectContaining({ id: 'assistant' })]) }));
		expect(h.invoke).toHaveBeenCalledWith(expect.objectContaining({ userText: 'user: source-m1' }));
	});
});

describe('Message mutation compression boundaries', () => {
	function mutationHarness() {
		const session = { id: 's1', userId: 'owner', agentReplyPending: false };
		const row = message('m1', 1);
		let deleted = false;
		const remove = jest.fn(async () => { deleted = true; return { affected: 1 }; });
		const query = { delete: () => query, from: () => query, where: () => query, andWhere: () => query, execute: remove };
		const manager = {
			findOne: async (entity: unknown) => entity === MiAgentMessage ? null : session,
			findOneBy: async () => row,
			find: async (entity: unknown) => entity === MiAgentMessage ? (deleted ? [] : [row]) : [sticky('sticky', 'm1', 'm1')],
			update: jest.fn(async (..._args: unknown[]) => ({ affected: 1 })),
			delete: remove, createQueryBuilder: () => query,
		};
		const db = { transaction: async (callback: (value: typeof manager) => Promise<unknown>) => callback(manager) };
		const sessions = { findOneBy: async () => session };
		const agent = { assertAgentsEnabled: () => {}, loadCharacterForAgentSessionOrThrow: async () => ({}), assertAgentUserSessionChatAllowed: () => {} };
		const chat = { checkChatAvailability: async () => {} };
		const notifications = { reconcileUnreadMessages: async () => {} };
		return { row, manager, remove, db, sessions, agent, chat, notifications };
	}

	test.each(['delete', 'rollback'])('%s resolves and invalidates sources before deleting their boundaries', async kind => {
		const h = mutationHarness();
		const Endpoint = kind === 'delete' ? DeleteMessage : RollbackMessage;
		const endpoint = new Endpoint(h.db as never, h.notifications as never, h.sessions as never, h.agent as never, h.chat as never);
		await endpoint.exec({ sessionId: 's1', messageId: 'm1' }, { id: 'owner' } as never, null);
		expect(h.manager.update).toHaveBeenCalledWith(MiAgentSessionCompressionSticky, expect.anything(), expect.objectContaining({ state: 'stale' }));
		expect(h.manager.update.mock.invocationCallOrder[0]).toBeLessThan(h.remove.mock.invocationCallOrder.at(0) ?? -Infinity);
	});

	test.each([false, true])('only invalidates when the saved message content changed: %s', async changed => {
		const h = mutationHarness();
		const endpoint = new UpdateMessage(h.db as never, h.sessions as never, { findOneBy: async () => h.row } as never,
			h.agent as never, h.chat as never, {} as never, {} as never, {} as never);
		await endpoint.exec({ sessionId: 's1', messageId: 'm1', content: changed ? 'edited' : h.row.content }, { id: 'owner' } as never, null);
		expect(h.manager.update.mock.calls.filter(([entity]) => entity === MiAgentSessionCompressionSticky)).toHaveLength(changed ? 1 : 0);
	});
});

describe('Source-scoped compression invalidation', () => {
	function invalidationHarness() {
		const rows = [message('a', 1), message('b', 2), message('c', 3), message('d', 4), message('e', 5)];
		const stickies = [sticky('old', 'a', 'b'), sticky('affected', 'b', 'd'), sticky('reversed', 'e', 'c'), sticky('independent', 'missing', 'missing')];
		const manager = {
			find: jest.fn(async (entity: unknown) => entity === MiAgentMessage ? rows : stickies),
			update: jest.fn(async (..._args: unknown[]) => ({ affected: 1 })),
		};
		return { rows, manager };
	}

	test('an edit only invalidates overlapping automatic summaries, preserving unrelated and unresolved sources', async () => {
		const { manager } = invalidationHarness();
		await invalidateMessageCompression(manager as never, 's1', message('c', 3));
		expect(manager.find).toHaveBeenCalledWith(MiAgentSessionCompressionSticky, expect.objectContaining({ where: { sessionId: 's1', userOverridden: false } }));
		expect(manager.update).toHaveBeenCalledWith(MiAgentSessionCompressionSticky, expect.objectContaining({
			sessionId: 's1', id: expect.objectContaining({ _value: ['affected', 'reversed'] }), userOverridden: false,
		}), expect.objectContaining({ state: 'stale', sourceFingerprint: null }));
	});

	test('rollback invalidates only intervals intersecting the deleted suffix', async () => {
		const { manager } = invalidationHarness();
		await invalidateMessageCompression(manager as never, 's1', message('d', 4), null);
		expect(manager.update).toHaveBeenCalledWith(MiAgentSessionCompressionSticky,
			expect.objectContaining({ id: expect.objectContaining({ _value: ['affected', 'reversed'] }) }), expect.anything());
	});

	test.each(['b', 'c'])('orders equal-time message boundaries by id: %s', async id => {
		const manager = {
			find: async (entity: unknown) => entity === MiAgentMessage ? [message('a', 1), message('b', 1)] : [sticky('same-time', 'a', 'b')],
			update: jest.fn(async (..._args: unknown[]) => ({ affected: 1 })),
		};
		await invalidateMessageCompression(manager as never, 's1', message(id, 1));
		expect(manager.update).toHaveBeenCalledTimes(id === 'b' ? 1 : 0);
	});

	test('a change outside every source interval leaves all summaries unchanged', async () => {
		const { manager } = invalidationHarness();
		await invalidateMessageCompression(manager as never, 's1', message('later', 10));
		expect(manager.update).not.toHaveBeenCalled();
	});
});
