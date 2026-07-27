/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { AgentProactiveScheduleService } from '@/core/AgentProactiveScheduleService.js';
import { jest } from '@jest/globals';

describe('AgentProactiveScheduleService control extraction', () => {
	const service = new AgentProactiveScheduleService({} as never, {} as never, {
		newId: () => 'test-id',
	} as never);

	test('separates a valid final action block from visible output', () => {
		const result = service.extractControl([
			'Visible reply.',
			'<proactive_schedule_actions>',
			JSON.stringify({
				actions: [{
					op: 'create',
					description: '明天主动问候用户。',
					trigger: { type: 'once', at: '2026-07-12 09:00' },
				}],
			}),
			'</proactive_schedule_actions>',
		].join('\n'));

		expect(result.visibleContent).toBe('Visible reply.');
		expect(result.error).toBeNull();
		expect(result.controlRaw).toContain('<proactive_schedule_actions>');
		expect(result.actions).toEqual([{
			op: 'create',
			description: '明天主动问候用户。',
			trigger: { type: 'once', at: '2026-07-12 09:00' },
		}]);
	});

	test('accepts a top-level action array from the model', () => {
		const result = service.extractControl([
			'Visible reply.',
			'<proactive_schedule_actions>',
			JSON.stringify([{
				op: 'create',
				description: '给用户发送约定的问候消息',
				trigger: { type: 'once', at: '2026-07-12 11:08' },
			}]),
			'</proactive_schedule_actions>',
		].join('\n'));

		expect(result.error).toBeNull();
		expect(result.actions).toHaveLength(1);
		expect(result.actions?.[0]).toMatchObject({ op: 'create', description: '给用户发送约定的问候消息' });
	});

	test('keeps an invalid JSON control block for private error feedback', () => {
		const result = service.extractControl('Visible reply.\n<proactive_schedule_actions>{ nope }</proactive_schedule_actions>');

		expect(result.visibleContent).toBe('Visible reply.');
		expect(result.controlRaw).toBe('<proactive_schedule_actions>{ nope }</proactive_schedule_actions>');
		expect(result.actions).toBeNull();
		expect(result.error?.code).toBe('INVALID_JSON');
	});

	test('rejects a control block followed by visible content', () => {
		const result = service.extractControl('<proactive_schedule_actions>{"actions":[]}</proactive_schedule_actions>Visible reply.');

		expect(result.controlRaw).toBe('<proactive_schedule_actions>{"actions":[]}</proactive_schedule_actions>');
		expect(result.actions).toBeNull();
		expect(result.error?.code).toBe('CONTROL_BLOCK_NOT_FINAL');
	});

	test('rejects an impossible Beijing calendar date', () => {
		const internal = service as unknown as {
			normalizeTrigger: (trigger: { type: 'once'; at: string }, now: Date) => unknown;
		};

		expect(() => internal.normalizeTrigger(
			{ type: 'once', at: '2026-02-31 12:00' },
			new Date('2026-02-01T00:00:00.000Z'),
		)).toThrow('A one-time schedule must use');
	});

	test('accepts a once-trigger still in the future even within the five-minute latency window', () => {
		const internal = service as unknown as {
			normalizeTrigger: (trigger: { type: 'once'; at: string }, now: Date) => { nextRunAt: Date; remainingRuns: number | null };
		};

		// AI 基于 0:00 注入的 <time> 设定 00:05；响应耗时 2 分钟后创建时刻为 00:02（北京时）。
		// 目标仍在未来，应尊重 AI 的设定而非拒绝。
		const result = internal.normalizeTrigger(
			{ type: 'once', at: '2026-02-01 00:05' },
			new Date('2026-01-31T16:02:00.000Z'), // 北京时 2026-02-01 00:02
		);

		expect(result.nextRunAt.getTime()).toBe(new Date('2026-01-31T16:05:00.000Z').getTime());
		expect(result.remainingRuns).toBe(1);
	});

	test('clamps an already-passed once-trigger to five minutes from now instead of throwing', () => {
		const internal = service as unknown as {
			normalizeTrigger: (trigger: { type: 'once'; at: string }, now: Date) => { nextRunAt: Date; remainingRuns: number | null };
		};

		// AI 设定 00:05，但响应耗时 7 分钟后创建时刻已是 00:07（北京时），目标已过期。
		// 应钳制到 now+5min 以保留提醒意图，而非报错。
		const now = new Date('2026-01-31T16:07:00.000Z'); // 北京时 2026-02-01 00:07
		const result = internal.normalizeTrigger(
			{ type: 'once', at: '2026-02-01 00:05' },
			now,
		);

		expect(result.nextRunAt.getTime()).toBe(now.getTime() + 5 * 60 * 1000);
		expect(result.remainingRuns).toBe(1);
	});

	test('completes an expired one-time schedule instead of throwing when it is resumed', async () => {
		const save = jest.fn(async (schedule: unknown) => schedule);
		const scheduled = new AgentProactiveScheduleService({ save } as never, {} as never, {} as never);
		const schedule = {
			status: 'paused',
			trigger: { type: 'once' as const, at: '2000-01-01 00:00' },
			nextRunAt: new Date('2000-01-01T00:00:00.000Z'),
			remainingRuns: 1,
		};

		await scheduled.setStatus(schedule as never, 'active');

		expect(schedule.status).toBe('completed');
		expect(schedule.nextRunAt).toBeNull();
		expect(schedule.remainingRuns).toBe(0);
		expect(save).toHaveBeenCalledWith(schedule);
	});
});
