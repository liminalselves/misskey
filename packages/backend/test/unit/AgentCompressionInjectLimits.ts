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
import UpdateMeta, { meta as updateMeta } from '@/server/api/endpoints/admin/update-meta.js';
import AdminMeta from '@/server/api/endpoints/admin/meta.js';
import UpdateSession, { paramDef as updateSessionParams } from '@/server/api/endpoints/agents/sessions/update.js';
import ExportSession from '@/server/api/endpoints/agents/sessions/export.js';
import ExportSessionReview from '@/server/api/endpoints/admin/agents/governance/session-review/export.js';

const owner = { id: 'owner1' };

function instanceMeta() {
	return { agentMem0InjectMaxChars: 8000, agentLongMemoryConfigured: true, agentCompressionInjectMaxChars: 6000 } as unknown as MiMeta;
}

function session() {
	return {
		id: 'session1', userId: owner.id, createdAt: new Date(), updatedAt: new Date(),
		agentLongMemoryProvider: 'compression', agentLongMemoryEnabled: true,
		agentLongMemoryInjectMaxChars: 4000,
	} as unknown as MiAgentSession;
}

function memoryService() {
	const tokens = new AgentTokenService();
	jest.spyOn(tokens, 'resolveTokenConfigForUser').mockResolvedValue({ tokenMode: 'estimate', charsPerToken: 3 });
	return new AgentCompressionMemoryService({} as never, {} as never, {} as never, {
		resolveModelConnectionForUser: async () => ({ maxContextTokens: 32000, maxOutputTokensPerCall: 2048 }),
		buildSystemPrompt: () => '', buildBudgetWorldbookEntries: () => [], buildLatestUserDirectiveBlock: () => '',
	} as never, { isRunnable: () => true } as never, {} as never, tokens);
}

function updateMetaEndpoint() {
	const instance = instanceMeta();
	const update = jest.fn(async (patch: Partial<MiMeta>) => { Object.assign(instance, patch); });
	const metaService = { fetch: async () => instance, update };
	const endpoint = new UpdateMeta(instance, metaService as never, { log: async () => {} } as never,
		memoryService(), {} as never, {} as never);
	return { instance, endpoint, update, metaService };
}

describe('Site-wide compression injection limit', () => {
	test('compression budgets follow the site setting, not session or Aliyun values', async () => {
		const service = memoryService();
		const instance = instanceMeta();
		const row = session();
		const params = { instanceMeta: instance, session: row, character: {} as never, style: {} as never, provider: 'compression' as const };
		const initial = await service.buildSendPathBudgets(params);
		expect(initial.compReserveChars).toBe(service.computeCompressionReserveChars(6000));
		row.agentLongMemoryInjectMaxChars = 20000;
		Object.assign(row, { agentCompressionInjectMaxChars: 50000 });
		expect(await service.buildSendPathBudgets(params)).toEqual(initial);
		instance.agentCompressionInjectMaxChars = 9000;
		const changed = await service.buildSendPathBudgets(params);
		expect(changed.compReserveChars - initial.compReserveChars).toBe(3000);
		expect(initial.historyBudget - changed.historyBudget).toBe(3000);
	});

	test('Aliyun budgets do not change when the site compression limit changes', async () => {
		const service = memoryService();
		const instance = instanceMeta();
		const row = session();
		const params = { instanceMeta: instance, session: row, character: {} as never, style: {} as never, provider: 'aliyun' as const };
		const initial = await service.buildSendPathBudgets(params);
		instance.agentCompressionInjectMaxChars = 30000;
		expect(await service.buildSendPathBudgets(params)).toEqual(initial);
		row.agentLongMemoryInjectMaxChars = 10000;
		const changed = await service.buildSendPathBudgets(params);
		expect(changed.memReserveChars - initial.memReserveChars).toBe(6000);
		expect(changed.compReserveChars).toBe(0);
	});

	test('the administrator endpoint saves and reads the global value independently', async () => {
		const { endpoint, update, instance, metaService } = updateMetaEndpoint();
		expect(updateMeta.requireAdmin).toBe(true);
		await endpoint.exec({ agentCompressionInjectMaxChars: 9000 }, owner as never, null);
		expect(update).toHaveBeenCalledWith({ agentCompressionInjectMaxChars: 9000 }, expect.any(Function));
		expect(instance.agentMem0InjectMaxChars).toBe(8000);
		const read = new AdminMeta({ version: 'test', url: 'https://example.com' } as never, metaService as never, { fetch: async () => ({ id: 'proxy1' }) } as never);
		const result = await read.exec({}, owner as never, null);
		expect(result.agentCompressionInjectMaxChars).toBe(9000);
	});

	test.each([199, 50001, 200.5, null])('admin/update-meta rejects invalid limits: %s', async limit => {
		const { endpoint, update } = updateMetaEndpoint();
		await expect(endpoint.exec({ agentCompressionInjectMaxChars: limit }, owner as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(update).not.toHaveBeenCalled();
	});

	test('session update cannot write or return the site compression setting', async () => {
		expect(updateSessionParams.properties).not.toHaveProperty('agentCompressionInjectMaxChars');
		const row = session();
		const instance = instanceMeta();
		const set = jest.fn<(...args: unknown[]) => unknown>();
		const builder = {
			update: () => builder, set: (...args: unknown[]) => { set(...args); return builder; },
			where: () => builder, setParameter: () => builder, execute: async () => ({ affected: 1 }),
		};
		const endpoint = new UpdateSession({ findOneBy: async () => ({ ...row }), createQueryBuilder: () => builder } as never,
			{} as never, { assertAgentsEnabled: () => {}, loadCharacterForAgentSessionOrThrow: async () => ({}), assertAgentUserSessionChatAllowed: () => {} } as never,
			{ fetch: async () => instance } as never, {} as never, {} as never, {} as never);
		const result = await endpoint.exec({ sessionId: row.id, agentCompressionInjectMaxChars: 50000 }, owner as never, null);
		expect(result).not.toHaveProperty('agentCompressionInjectMaxChars');
		expect(set.mock.calls[0]![0]).not.toHaveProperty('agentCompressionInjectMaxChars');
		expect(instance.agentCompressionInjectMaxChars).toBe(6000);
	});

	test('user and review exports exclude the site-level setting', async () => {
		const sessions = { findOneBy: async () => session() };
		const empty = { find: async () => [] };
		const agent = { assertAgentsEnabled: () => {} };
		const user = new ExportSession(sessions as never, empty as never, empty as never, empty as never, agent as never);
		const review = new ExportSessionReview(sessions as never, empty as never, empty as never, empty as never, agent as never);
		for (const endpoint of [user, review]) {
			const result = await endpoint.exec({ sessionId: 'session1' }, owner as never, null);
			expect(result.settings).toHaveProperty('agentLongMemoryInjectMaxChars', 4000);
			expect(result.settings).not.toHaveProperty('agentCompressionInjectMaxChars');
		}
	});
});
