/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi, describe, test, expect } from 'vitest';
import { AgentProactiveMessageService } from '@/core/AgentProactiveMessageService.js';
import { AgentCompressionMemoryService, AGENT_OVERVIEW_SCAN_LIMIT } from '@/core/AgentCompressionMemoryService.js';
import type { AgentService } from '@/core/AgentService.js';
import type { MiAgentSessionCompressionSticky } from '@/models/AgentSessionCompressionSticky.js';
// 依存チェーン上の ESM-only パッケージ（node-fetch / nanoid / chalk 等）は
// vi.config.unit.cjs の moduleNameMapper で共通スタブに解決される

type ProactivePrivate = {
	processRandom: (session: Record<string, unknown>) => Promise<void>;
	processScheduled: (schedule: Record<string, unknown>, now: Date) => Promise<void>;
};

function createHarness(opts: { reply?: string; imageModelEnabled?: boolean; modelCost?: number; hasFreeQuota?: boolean; creditBalance?: number; compression?: boolean } = {}) {
	const session = {
		id: 'session-id',
		userId: 'user-id',
		characterId: 'character-id',
		dialogueStyleId: 'style-id',
		sessionKind: 'draft_test',
		name: 'Test session',
		agentLongMemoryProvider: opts.compression ? 'compression' : 'none',
		agentModelId: 'model-id',
		agentReplyPending: false,
		timeAwarenessEnabled: true,
		randomProactiveEnabled: true,
		scheduledProactiveEnabled: true,
		randomProactiveAt: new Date('2026-07-12T00:00:00.000Z'),
		randomProactiveNeedsUserMessage: false,
		randomProactiveLastError: null,
		scheduledProactiveLastError: null,
		moderationBanned: false,
		lastMessageAt: null,
		updatedAt: new Date('2026-07-12T00:00:00.000Z'),
	};
	const query = {
		update: vi.fn(),
		set: vi.fn(),
		where: vi.fn(),
		execute: vi.fn(async () => ({ affected: 1 })),
	};
	query.update.mockReturnValue(query);
	query.set.mockReturnValue(query);
	query.where.mockReturnValue(query);

	const sessionsRepository = {
		createQueryBuilder: vi.fn(() => query),
		findOneBy: vi.fn(async () => session),
		save: vi.fn(async (row: unknown) => row),
	};
	const messagesRepository = {
		insertOne: vi.fn(async (row: Record<string, unknown>) => row),
		delete: vi.fn(async () => undefined),
	};
	const usage = {
		startLog: vi.fn(async (params: Record<string, unknown>) => ({ ...params, requestedAt: new Date() })),
		finishLog: vi.fn(async () => undefined),
		hasFreeQuotaRemaining: vi.fn(async () => opts.hasFreeQuota ?? true),
		// 与真实实现同口径：免费额度或余额可覆盖单次成本即放行
		canAffordModelCall: vi.fn(async () => {
			if (opts.hasFreeQuota ?? true) return true;
			const cost = opts.modelCost ?? 0;
			if (cost <= 0) return true;
			return (opts.creditBalance ?? 100) >= cost;
		}),
	};
	const agentService = {
		newId: vi.fn(() => 'message-id'),
		loadCharacterForAgentSessionOrThrow: vi.fn(async () => ({ regexRules: [], avatarFileId: null })),
		assertAgentUserSessionChatAllowed: vi.fn(),
		effectiveCharacterForLlm: vi.fn((character: unknown) => character),
		effectiveStyleForSession: vi.fn((style: unknown) => style),
		buildSystemPrompt: vi.fn(() => 'system'),
		loadRecentMessagesForContextWithMeta: vi.fn<AgentService['loadRecentMessagesForContextWithMeta']>(async () => ({ messages: [], truncated: false, oldestIncludedId: null })),
		normalizeRegexRules: vi.fn(() => []),
		// 与真实实现同口径：批量 worker 过滤直接原样返回文本
		applyRegexRulesBatch: vi.fn(async (_rules: unknown, _effect: unknown, items: Array<{ text: string }>) => items.map(item => item.text)),
		selectWorldbookEntriesForPrompt: vi.fn(() => []),
		wrapLatestUserTextWithStyleDirective: vi.fn((text: string) => text),
		prependCurrentBeijingTime: vi.fn((text: string) => text),
		resolveModelApiName: vi.fn(() => 'provider-model'),
		normalizeRules: vi.fn(() => []),
		resolveActiveRules: vi.fn(() => []),
		resolveModelApiNameForUser: vi.fn(async () => 'provider-model'),
		resolveEffectiveModelId: vi.fn(() => 'effective-model-id'),
		getUserFacingModelCostPerCall: vi.fn(() => opts.modelCost ?? 0),
		invokeChatCompletions: vi.fn<AgentService['invokeChatCompletions']>(async () => {
			if (opts.reply != null) return { text: opts.reply, usage: null };
			throw new Error('provider unavailable');
		}),
	};
	const schedules = {
		systemPromptBlock: 'schedule protocol',
		consumeScheduleRun: vi.fn(async () => undefined),
		prependScheduleContext: vi.fn(async (text: string) => text),
		extractControl: vi.fn((raw: string) => ({ visibleContent: raw, controlRaw: null })),
		applyAssistantControl: vi.fn(async () => undefined),
	};

	const imageService = {
		resolveImageModel: vi.fn(() => opts.imageModelEnabled ? { id: 'image-model-id' } : null),
		stripDrawPlaceholders: vi.fn((text: string) => text),
	};
	const stickerService = {
		buildSystemBlocks: vi.fn(async () => ({ block: '', emojiList: [] as { name: string; description: string }[], stickerKeys: [] as string[] })),
		convertUserTextForLlm: vi.fn((text: string) => text),
		enforceReplyLimits: vi.fn((text: string) => text),
		normalizeCharacterStickers: vi.fn(() => []),
	};
	const compressionCalculator = Object.create(AgentCompressionMemoryService.prototype) as AgentCompressionMemoryService;
	const compressionMemory = {
		resolveEffectiveProvider: vi.fn(() => opts.compression ? 'compression' : 'none'),
		buildSendPathBudgets: vi.fn(async () => ({ historyBudget: 9000, historyBudgetTokens: 3000, charsPerToken: 3 })),
		buildCompressionContext: vi.fn<AgentCompressionMemoryService['buildCompressionContext']>(async () => ({ block: '<compression_memory>remember</compression_memory>', injectedStickies: [], boundaries: new Map() })),
		buildPairsExcludingInjectedCompression: vi.fn<AgentCompressionMemoryService['buildPairsExcludingInjectedCompression']>((...args) => compressionCalculator.buildPairsExcludingInjectedCompression(...args)),
		afterAssistantForCompression: vi.fn<AgentCompressionMemoryService['afterAssistantForCompression']>(async () => undefined),
	};
	const tokenService = { resolveTokenConfigForUser: vi.fn(async () => ({ tokenMode: 'estimate' })), makeCounter: vi.fn(() => undefined) };
	const service = new AgentProactiveMessageService(
		sessionsRepository as never,
		messagesRepository as never,
		{} as never,
		{ findOneBy: vi.fn(async () => ({ id: 'style-id' })) } as never,
		{ findOneBy: vi.fn(async () => ({ id: 'user-id' })) } as never,
		{ findOneBy: vi.fn(async () => ({ agentCreditBalance: opts.creditBalance ?? 100 })) } as never,
		agentService as never,
		schedules as never,
		{ auditReply: vi.fn(async () => ({ blocked: false })) } as never,
		usage as never,
		imageService as never,
		stickerService as never,
		{ fetch: vi.fn(async () => ({ agentGlobalSystemPrompt: null })) } as never,
		{ notifyAgentMessage: vi.fn(async () => undefined) } as never,
		{} as never,
		compressionMemory as never,
		tokenService as never,
	);

	return { service: service as unknown as ProactivePrivate, session, usage, schedules, agentService, imageService, compressionMemory, messagesRepository };
}

describe('Proactive compression memory', () => {
	test.each(['random', 'scheduled'])('%s delivery injects memory, excludes only its sources, then compresses the new reply', async kind => {
		const h = createHarness({ compression: true, reply: 'Remembered reply.' });
		const rows = ['m1', 'm2', 'm3'].map((id, index) => ({
			id, createdAt: new Date(index * 1000), role: 'user' as const, content: `source-${id}`,
			imageFileId: null, imageRecognitionStatus: null, imageRecognitionDescription: null,
			proactiveScheduleControlRaw: null, proactiveScheduleControlError: null, timeTrusted: true,
		}));
		const dMap = new Map([['m1', 3100], ['m2', 2900], ['m3', 100]]);
		h.agentService.loadRecentMessagesForContextWithMeta.mockResolvedValue({ messages: rows, dMap, truncated: true, oldestIncludedId: 'm1' });
		h.compressionMemory.buildCompressionContext.mockResolvedValue({
			block: '<compression_memory>remember</compression_memory>',
			injectedStickies: [{ id: 'sticky', fromMessageId: 'm1', toMessageId: 'm2' } as MiAgentSessionCompressionSticky],
			boundaries: new Map(rows.slice(0, 2).map(row => [row.id, row])),
		});
		if (kind === 'random') {
			await h.service.processRandom(h.session);
		} else {
			await h.service.processScheduled({ id: 'schedule', sessionId: h.session.id, description: 'hello' }, new Date());
		}
		expect(h.agentService.loadRecentMessagesForContextWithMeta).toHaveBeenCalledWith(h.session.id, 9000, AGENT_OVERVIEW_SCAN_LIMIT,
			expect.objectContaining({ tokenBudget: 3000, charsPerToken: 3, timeAwarenessEnabled: true }));
		expect(h.compressionMemory.buildCompressionContext).toHaveBeenCalledWith(expect.objectContaining({ sidecar: { dMap, hSend: 3000 } }));
		expect(h.agentService.invokeChatCompletions).toHaveBeenCalledWith(expect.objectContaining({
			system: expect.stringContaining('<compression_memory>remember</compression_memory>'),
			messages: [{ role: 'user', content: 'source-m3' }],
		}));
		expect(h.messagesRepository.insertOne).toHaveBeenCalledWith(expect.objectContaining({ role: 'assistant', content: 'Remembered reply.' }));
		expect(h.compressionMemory.afterAssistantForCompression).toHaveBeenCalledTimes(1);
		expect(h.compressionMemory.afterAssistantForCompression.mock.calls[0]).toHaveLength(5);
		expect(h.compressionMemory.afterAssistantForCompression.mock.invocationCallOrder[0]).toBeGreaterThan(h.messagesRepository.insertOne.mock.invocationCallOrder.at(1) ?? Infinity);
	});

	test('does not compress after a failed generation', async () => {
		const h = createHarness({ compression: true });
		await h.service.processRandom(h.session);
		expect(h.compressionMemory.afterAssistantForCompression).not.toHaveBeenCalled();
		expect(h.session.randomProactiveLastError).toEqual(expect.objectContaining({ code: 'PROACTIVE_LLM_FAILED' }));
	});

	test('a failed background compression cannot retract a delivered reply', async () => {
		const h = createHarness({ compression: true, reply: 'Delivered.' });
		h.compressionMemory.afterAssistantForCompression.mockRejectedValue(new Error('compression unavailable'));
		await h.service.processRandom(h.session);
		expect(h.messagesRepository.insertOne).toHaveBeenCalledWith(expect.objectContaining({ role: 'assistant', content: 'Delivered.' }));
		expect(h.messagesRepository.delete).not.toHaveBeenCalled();
		expect(h.session.randomProactiveLastError).toBeNull();
	});
});

describe('AgentProactiveMessageService failed attempts', () => {
	test('records a failed random proactive request once and consumes the delivery', async () => {
		const { service, session, usage, agentService } = createHarness();

		await service.processRandom(session);
		await service.processRandom(session);

		expect(agentService.invokeChatCompletions).toHaveBeenCalledTimes(1);
		expect(usage.startLog).toHaveBeenCalledWith(expect.objectContaining({ usageKind: 'proactive_random' }));
		expect(usage.finishLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
			status: 'failed',
			errorCode: 'PROACTIVE_LLM_FAILED',
		});
		expect(session.randomProactiveAt).toBeNull();
		expect(session.randomProactiveNeedsUserMessage).toBe(true);
		expect(session.randomProactiveLastError).toEqual(expect.objectContaining({ code: 'PROACTIVE_LLM_FAILED' }));
	});

	test('records a failed scheduled proactive request and consumes the schedule run', async () => {
		const { service, session, usage, schedules, agentService } = createHarness();
		const schedule = {
			id: 'schedule-id',
			sessionId: session.id,
			description: '发送问候消息',
		};

		await service.processScheduled(schedule, new Date('2026-07-12T00:00:00.000Z'));

		expect(schedules.consumeScheduleRun).toHaveBeenCalledWith(schedule, expect.any(Date));
		expect(agentService.invokeChatCompletions).toHaveBeenCalledTimes(1);
		expect(usage.startLog).toHaveBeenCalledWith(expect.objectContaining({ usageKind: 'proactive_scheduled' }));
		expect(usage.finishLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
			status: 'failed',
			errorCode: 'PROACTIVE_LLM_FAILED',
		});
		expect(session.scheduledProactiveLastError).toEqual(expect.objectContaining({ code: 'PROACTIVE_LLM_FAILED' }));
	});

	test('settles a delivered proactive request as a successful billed usage', async () => {
		const { service, session, usage, agentService, compressionMemory } = createHarness({ reply: '你好，想和你聊聊。' });

		await service.processRandom(session);

		expect(usage.startLog).toHaveBeenCalledWith(expect.objectContaining({ usageKind: 'proactive_random' }));
		expect(usage.finishLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), { status: 'success' });
		expect(session.randomProactiveLastError).toBeNull();
		expect(agentService.loadRecentMessagesForContextWithMeta).toHaveBeenCalledWith(session.id, 48_000, 500, expect.objectContaining({ timeAwarenessEnabled: true }));
		expect(compressionMemory.buildCompressionContext).not.toHaveBeenCalled();
		expect(compressionMemory.afterAssistantForCompression).not.toHaveBeenCalled();
	});

	test('adds the unchanged image protocol when an image model is selected', async () => {
		const { service, session, agentService } = createHarness({
			reply: 'A proactive reply.',
			imageModelEnabled: true,
		});

		await service.processRandom(session);

		expect(agentService.invokeChatCompletions).toHaveBeenCalledWith(expect.objectContaining({
			system: expect.stringContaining('<agent_image_generation_protocol>\nImage generation protocol:'),
		}));
	});

	test('skips a random proactive delivery when the user has no free quota and insufficient credit', async () => {
		const { service, session, usage, agentService } = createHarness({
			reply: 'A proactive reply.',
			modelCost: 10,
			hasFreeQuota: false,
			creditBalance: 5,
		});

		await service.processRandom(session);

		expect(agentService.invokeChatCompletions).not.toHaveBeenCalled();
		expect(usage.startLog).not.toHaveBeenCalled();
		expect(session.randomProactiveAt).toBeNull();
		expect(session.randomProactiveNeedsUserMessage).toBe(true);
		expect(session.randomProactiveLastError).toEqual(expect.objectContaining({ code: 'PROACTIVE_INSUFFICIENT_CREDIT' }));
	});
});
