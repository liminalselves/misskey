/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { jest } from '@jest/globals';
import { AgentCompressionMemoryService } from '@/core/AgentCompressionMemoryService.js';
import { AgentTokenService } from '@/core/AgentTokenService.js';
import type { MiAgentSession } from '@/models/AgentSession.js';
import type { MiMeta } from '@/models/Meta.js';
import UpdateSession from '@/server/api/endpoints/agents/sessions/update.js';
import ExportSession from '@/server/api/endpoints/agents/sessions/export.js';
import ExportSessionReview from '@/server/api/endpoints/admin/agents/governance/session-review/export.js';

const instance = { agentMem0InjectMaxChars: 8000, agentLongMemoryConfigured: true } as unknown as MiMeta;
const owner = { id: 'owner1' };

function session() {
	return {
		id: 'session1', userId: owner.id, createdAt: new Date(), updatedAt: new Date(),
		agentLongMemoryProvider: 'compression', agentLongMemoryEnabled: true,
		agentLongMemoryInjectMaxChars: 4000, agentCompressionInjectMaxChars: 6000,
	} as unknown as MiAgentSession;
}

function memoryService() {
	const tokens = new AgentTokenService();
	jest.spyOn(tokens, 'resolveTokenConfigForUser').mockResolvedValue({
		tokenMode: 'estimate', charsPerToken: 3,
	});
	return new AgentCompressionMemoryService({} as never, {} as never, {} as never, {
		resolveModelConnectionForUser: async () => ({ maxContextTokens: 32000, maxOutputTokensPerCall: 2048 }),
		buildSystemPrompt: () => '', buildBudgetWorldbookEntries: () => [], buildLatestUserDirectiveBlock: () => '',
	} as never, { isRunnable: () => true } as never, {} as never, tokens);
}

function updateEndpoint(row: MiAgentSession) {
	const set = jest.fn<(...args: unknown[]) => unknown>();
	const builder = {
		update: () => builder, set: (...args: unknown[]) => { set(...args); return builder; },
		where: () => builder, setParameter: () => builder, execute: async () => ({ affected: 1 }),
	};
	const endpoint = new UpdateSession({ findOneBy: async () => ({ ...row }), createQueryBuilder: () => builder } as never,
		{} as never, { assertAgentsEnabled: () => {}, loadCharacterForAgentSessionOrThrow: async () => ({}), assertAgentUserSessionChatAllowed: () => {} } as never,
		{ fetch: async () => instance } as never, {} as never, {} as never, {} as never);
	return { endpoint, set };
}

describe('Independent compression injection limits', () => {
	test('compression reserves only its own limit and ignores Aliyun settings', async () => {
		const service = memoryService();
		const row = session();
		const params = { instanceMeta: instance, session: row, character: {} as never, style: {} as never, provider: 'compression' as const };
		const initial = await service.buildSendPathBudgets(params);
		expect(initial.compReserveChars).toBe(service.computeCompressionReserveChars(6000));
		row.agentLongMemoryInjectMaxChars = 20000;
		expect(await service.buildSendPathBudgets(params)).toEqual(initial);
		row.agentCompressionInjectMaxChars = 9000;
		const changed = await service.buildSendPathBudgets(params);
		expect(changed.compReserveChars - initial.compReserveChars).toBe(3000);
		expect(initial.historyBudget - changed.historyBudget).toBe(3000);
	});

	test('Aliyun reserves only its own limit and ignores compression settings', async () => {
		const service = memoryService();
		const row = session();
		const params = { instanceMeta: instance, session: row, character: {} as never, style: {} as never, provider: 'aliyun' as const };
		const initial = await service.buildSendPathBudgets(params);
		row.agentCompressionInjectMaxChars = 30000;
		expect(await service.buildSendPathBudgets(params)).toEqual(initial);
		row.agentLongMemoryInjectMaxChars = 10000;
		const changed = await service.buildSendPathBudgets(params);
		expect(changed.memReserveChars - initial.memReserveChars).toBe(6000);
		expect(changed.compReserveChars).toBe(0);
	});

	test.each([
		[{ agentCompressionInjectMaxChars: 9000 }, 4000, 9000],
		[{ agentLongMemoryInjectMaxChars: 15000 }, 15000, 6000],
	])('saving %j leaves the other limit unchanged', async (patch, aliyun, compression) => {
		const { endpoint, set } = updateEndpoint(session());
		const result = await endpoint.exec({ sessionId: 'session1', ...patch }, owner as never, null);
		expect(result).toMatchObject({ agentLongMemoryInjectMaxChars: aliyun, agentCompressionInjectMaxChars: compression });
		expect(set).toHaveBeenCalledWith(expect.objectContaining({ agentLongMemoryInjectMaxChars: aliyun, agentCompressionInjectMaxChars: compression }));
	});

	test('switching providers preserves both independently saved limits', async () => {
		const { endpoint } = updateEndpoint(session());
		for (const provider of ['none', 'aliyun', 'compression']) {
			const result = await endpoint.exec({ sessionId: 'session1', agentLongMemoryProvider: provider }, owner as never, null);
			expect(result).toMatchObject({
				agentLongMemoryProvider: provider, agentLongMemoryInjectMaxChars: 4000, agentCompressionInjectMaxChars: 6000,
			});
		}
	});

	test.each([199, 50001, 200.5, null])('rejects invalid compression limits: %s', async limit => {
		const { endpoint, set } = updateEndpoint(session());
		await expect(endpoint.exec({ sessionId: 'session1', agentCompressionInjectMaxChars: limit }, owner as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(set).not.toHaveBeenCalled();
	});

	test('user and review exports preserve both limits independently', async () => {
		const sessions = { findOneBy: async () => session() };
		const empty = { find: async () => [] };
		const agent = { assertAgentsEnabled: () => {} };
		const user = new ExportSession(sessions as never, empty as never, empty as never, empty as never, agent as never);
		const review = new ExportSessionReview(sessions as never, empty as never, empty as never, empty as never, agent as never);
		for (const endpoint of [user, review]) {
			const result = await endpoint.exec({ sessionId: 'session1' }, owner as never, null);
			expect(result.settings).toMatchObject({ agentLongMemoryInjectMaxChars: 4000, agentCompressionInjectMaxChars: 6000 });
		}
	});
});
