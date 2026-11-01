/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi, describe, test, expect } from 'vitest';
import { DataSource, EntitySchema } from 'typeorm';
import { AgentSessionCleanupService } from '@/daemons/AgentSessionCleanupService.js';
import { MiAgentSession } from '@/models/AgentSession.js';

function createHarness() {
	const events: string[] = [];
	const chain = (rows: Array<{ id: string }>) => {
		const query = {
			select: vi.fn(), where: vi.fn(), andWhere: vi.fn(),
			orderBy: vi.fn(), addOrderBy: vi.fn(), limit: vi.fn(),
			setLock: vi.fn(), setOnLocked: vi.fn(),
			getMany: vi.fn(async () => rows),
		};
		for (const method of ['select', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'limit', 'setLock', 'setOnLocked'] as const) {
			query[method].mockReturnValue(query);
		}
		return query;
	};
	const candidates = chain([{ id: 'session-id' }]);
	const locked = chain([{ id: 'session-id' }]);
	locked.getMany.mockImplementation(async () => {
		events.push('lock');
		return [{ id: 'session-id' }];
	});
	const deletion = {
		delete: vi.fn(), from: vi.fn(), where: vi.fn(), andWhere: vi.fn(),
		execute: vi.fn(async () => { events.push('delete'); return { affected: 1 }; }),
	};
	for (const method of ['delete', 'from', 'where', 'andWhere'] as const) deletion[method].mockReturnValue(deletion);
	const manager = {
		getRepository: vi.fn(() => ({ createQueryBuilder: () => locked })),
		createQueryBuilder: vi.fn(() => deletion),
	};
	const transaction = vi.fn(async (_isolation: string, callback: (value: typeof manager) => Promise<void>) => callback(manager));
	const service = new AgentSessionCleanupService({
		createQueryBuilder: () => candidates,
		manager: { transaction },
	} as never, { getLogger: () => ({ error: vi.fn() }) } as never);
	return { service, candidates, locked, deletion, transaction, manager, events };
}

const cleanup = (service: AgentSessionCleanupService) => (service as unknown as { cleanup(): Promise<void> }).cleanup();

describe('AgentSessionCleanupService', () => {
	test('rechecks message eligibility after locking and only deletes sessions through their cascading FK', async () => {
		const { service, candidates, locked, deletion, transaction, manager, events } = createHarness();
		await cleanup(service);

		expect(transaction).toHaveBeenCalledWith('READ COMMITTED', expect.any(Function));
		expect(manager.getRepository).toHaveBeenCalledWith(MiAgentSession);
		expect(locked.setLock).toHaveBeenCalledWith('pessimistic_write');
		expect(locked.setOnLocked).toHaveBeenCalledWith('skip_locked');
		expect(locked.andWhere).toHaveBeenCalledWith('agent_session.agentReplyPending = false');
		expect(events).toEqual(['lock', 'delete']);
		expect(deletion.from).toHaveBeenCalledWith(MiAgentSession);
		expect(deletion.where).toHaveBeenCalledWith('id IN (:...ids)', { ids: ['session-id'] });

		const [condition, params] = candidates.andWhere.mock.calls[1];
		expect(condition).toContain('LIMIT 1 OFFSET 1');
		expect(condition).not.toContain('COUNT(');
		expect(condition).toContain('m."role" <> \'assistant\'');
		expect(params).toEqual({ greetingGraceSeconds: 120 });
		expect(deletion.andWhere).toHaveBeenCalledWith(condition, params);
	});

	test('generates valid session correlations and lock SQL without opening a database connection', async () => {
		const db = new DataSource({
			type: 'postgres',
			entities: [new EntitySchema({
				name: 'CleanupSession', target: MiAgentSession, tableName: 'agent_session',
				columns: { id: { type: String, primary: true }, createdAt: { type: Date }, agentReplyPending: { type: Boolean } },
			})],
		});
		await (db as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
		const { service, candidates } = createHarness();
		await cleanup(service);
		const [condition, params] = candidates.andWhere.mock.calls[1] as [string, { greetingGraceSeconds: number }];
		const [sql, values] = db.createQueryBuilder().delete().from(MiAgentSession)
			.where('id IN (:...ids)', { ids: ['session-id'] }).andWhere(condition, params).getQueryAndParameters();
		expect(sql).toContain('DELETE FROM "agent_session"');
		expect(sql).toContain('m."sessionId" = "agent_session"."id"');
		expect(sql).not.toContain(':greetingGraceSeconds');
		expect(values).toEqual(['session-id', 120]);
		const [candidateSql] = db.getRepository(MiAgentSession).createQueryBuilder('agent_session')
			.select('agent_session.id').where('agent_session.createdAt < :cutoff', { cutoff: new Date() })
			.andWhere('agent_session.agentReplyPending = false').andWhere(condition, params)
			.orderBy('agent_session.createdAt', 'ASC').addOrderBy('agent_session.id', 'ASC').limit(500).getQueryAndParameters();
		expect(candidateSql).toContain('"agent_session"."agentReplyPending" = false');
		expect(candidateSql).toContain('LIMIT 500');
		const lockSql = db.getRepository(MiAgentSession).createQueryBuilder('agent_session')
			.select('agent_session.id').setLock('pessimistic_write').setOnLocked('skip_locked').getQuery();
		expect(lockSql).toContain('FOR UPDATE SKIP LOCKED');
	});

	test('preserves a new message committed between candidate selection and the locked recheck', async () => {
		const { service, locked, deletion, candidates } = createHarness();
		let newMessageExists = false;
		locked.getMany.mockImplementation(async () => {
			newMessageExists = true;
			return [{ id: 'session-id' }];
		});
		deletion.execute.mockImplementation(async () => ({ affected: newMessageExists ? 0 : 1 }));
		await cleanup(service);
		expect(deletion.andWhere).toHaveBeenCalledWith(...candidates.andWhere.mock.calls[1]);
		expect(await deletion.execute.mock.results[0].value).toEqual({ affected: 0 });
	});

	test('does not delete candidates whose send has occupied or locked the session', async () => {
		const { service, locked, deletion } = createHarness();
		locked.getMany.mockResolvedValue([]);
		await cleanup(service);
		expect(deletion.execute).not.toHaveBeenCalled();
	});

	test('does not open a transaction without eligible candidates', async () => {
		const { service, candidates, transaction } = createHarness();
		candidates.getMany.mockResolvedValue([]);
		await cleanup(service);
		expect(transaction).not.toHaveBeenCalled();
	});

	test('allows a later tick after a failure and does not duplicate its timer', async () => {
		vi.useFakeTimers();
		const { service, candidates } = createHarness();
		try {
			candidates.getMany.mockRejectedValueOnce(new Error('database unavailable'));
			service.start();
			service.start();
			await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
			expect(candidates.getMany).toHaveBeenCalledTimes(2);
		} finally {
			service.dispose();
			vi.useRealTimers();
		}
	});
});
