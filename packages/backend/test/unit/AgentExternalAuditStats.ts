/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect } from 'vitest';
import ExternalAuditStats from '@/server/api/endpoints/admin/agents/external-audit/models/stats.js';

function endpoint(rows: Record<string, unknown>[]) {
	const builder: Record<string, unknown> = {};
	for (const method of ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'addGroupBy']) builder[method] = () => builder;
	builder.getRawMany = async () => rows;
	const repository = { createQueryBuilder: () => builder };
	const metaService = { fetch: async () => ({ agentExternalAuditModels: [{ id: 'm1', name: 'M1', provider: 'openai' }, { id: 'm2', name: 'M2', provider: 'openai' }] }) };
	return new ExternalAuditStats(repository as never, { assertAgentsEnabled: () => {} } as never, metaService as never);
}

describe('external audit model stats', () => {
	test('reports overall and verdict-only average durations', async () => {
		const stats = await endpoint([
			{ modelId: 'm1', status: 'allow', failureKind: null, count: 3, durationCount: 3, durationSum: '900' },
			{ modelId: 'm1', status: 'block', failureKind: null, count: 1, durationCount: 1, durationSum: '500' },
			{ modelId: 'm1', status: 'failed', failureKind: 'api', count: 1, durationCount: 1, durationSum: '30000' },
		]).exec({}, {} as never, null) as Record<string, unknown>[];
		const m1 = stats.find(s => s.id === 'm1')!;
		expect(m1.total).toBe(5);
		expect(m1.avgDurationMs).toBe(31400 / 5);
		expect(m1.avgSuccessDurationMs).toBe(1400 / 4);
	});

	test('returns null averages when no call recorded a duration', async () => {
		const stats = await endpoint([
			{ modelId: 'm1', status: 'failed', failureKind: 'parse', count: 2, durationCount: 0, durationSum: '0' },
		]).exec({}, {} as never, null) as Record<string, unknown>[];
		expect(stats.find(s => s.id === 'm1')).toMatchObject({ avgDurationMs: null, avgSuccessDurationMs: null });
		expect(stats.find(s => s.id === 'm2')).toMatchObject({ total: 0, avgDurationMs: null, avgSuccessDurationMs: null });
	});
});
