/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { AgentProactiveMessageService } from '@/core/AgentProactiveMessageService.js';
import { jest } from '@jest/globals';

type ProactivePrivate = {
	processRandom: (session: Record<string, unknown>) => Promise<void>;
	processScheduled: (schedule: Record<string, unknown>, now: Date) => Promise<void>;
};

function createHarness(opts: { reply?: string; imageModelEnabled?: boolean; modelCost?: number; hasFreeQuota?: boolean; creditBalance?: number } = {}) {
	const session = {
		id: 'session-id',
		userId: 'user-id',
		characterId: 'character-id',
		dialogueStyleId: 'style-id',
		sessionKind: 'draft_test',
		name: 'Test session',
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
		update: jest.fn(),
		set: jest.fn(),
		where: jest.fn(),
		execute: jest.fn(async () => ({ affected: 1 })),
	};
	query.update.mockReturnValue(query);
	query.set.mockReturnValue(query);
	query.where.mockReturnValue(query);

	const sessionsRepository = {
		createQueryBuilder: jest.fn(() => query),
		findOneBy: jest.fn(async () => session),
		save: jest.fn(async (row: unknown) => row),
	};
	const messagesRepository = {
		insertOne: jest.fn(async (row: Record<string, unknown>) => row),
		delete: jest.fn(async () => undefined),
	};
	const usage = {
		startLog: jest.fn(async (params: Record<string, unknown>) => ({ ...params, requestedAt: new Date() })),
		finishLog: jest.fn(async () => undefined),
		hasFreeQuotaRemaining: jest.fn(async () => opts.hasFreeQuota ?? true),
	};
	const agentService = {
		newId: jest.fn(() => 'message-id'),
		loadCharacterForAgentSessionOrThrow: jest.fn(async () => ({ regexRules: [], avatarFileId: null })),
		assertAgentUserSessionChatAllowed: jest.fn(),
		effectiveCharacterForLlm: jest.fn((character: unknown) => character),
		effectiveStyleForLlm: jest.fn((style: unknown) => style),
		buildSystemPrompt: jest.fn(() => 'system'),
		loadRecentMessagesForContextWithMeta: jest.fn(async () => ({ messages: [] })),
		normalizeRegexRules: jest.fn(() => []),
		applyRegexRules: jest.fn((text: string) => text),
		selectWorldbookEntriesForPrompt: jest.fn(() => []),
		wrapLatestUserTextWithStyleDirective: jest.fn((text: string) => text),
		prependCurrentBeijingTime: jest.fn((text: string) => text),
		resolveModelApiName: jest.fn(() => 'provider-model'),
		getUserFacingModelCostPerCall: jest.fn(() => opts.modelCost ?? 0),
		invokeChatCompletions: jest.fn(async () => {
			if (opts.reply != null) return opts.reply;
			throw new Error('provider unavailable');
		}),
	};
	const schedules = {
		systemPromptBlock: 'schedule protocol',
		consumeScheduleRun: jest.fn(async () => undefined),
		prependScheduleContext: jest.fn(async (text: string) => text),
		extractControl: jest.fn((raw: string) => ({ visibleContent: raw, controlRaw: null })),
		applyAssistantControl: jest.fn(async () => undefined),
	};

	const imageService = { resolveImageModel: jest.fn(() => opts.imageModelEnabled ? { id: 'image-model-id' } : null) };
	const service = new AgentProactiveMessageService(
		sessionsRepository as never,
		messagesRepository as never,
		{} as never,
		{ findOneBy: jest.fn(async () => ({ id: 'style-id' })) } as never,
		{ findOneBy: jest.fn(async () => ({ id: 'user-id' })) } as never,
		{ findOneBy: jest.fn(async () => ({ agentCreditBalance: opts.creditBalance ?? 100 })) } as never,
		agentService as never,
		schedules as never,
		{ auditReply: jest.fn(async () => ({ blocked: false })) } as never,
		usage as never,
		imageService as never,
		{ fetch: jest.fn(async () => ({ agentGlobalSystemPrompt: null })) } as never,
		{ createNotification: jest.fn() } as never,
		{} as never,
	);

	return { service: service as unknown as ProactivePrivate, session, usage, schedules, agentService, imageService };
}

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
		const { service, session, usage } = createHarness({ reply: '你好，想和你聊聊。' });

		await service.processRandom(session);

		expect(usage.startLog).toHaveBeenCalledWith(expect.objectContaining({ usageKind: 'proactive_random' }));
		expect(usage.finishLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), { status: 'success' });
		expect(session.randomProactiveLastError).toBeNull();
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
