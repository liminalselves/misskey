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
		)).toThrow('A one-time schedule must be');
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
