/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, expect, test } from '@jest/globals';
import { getValidator } from '../../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './import.js';

const SESSION_ID = '9g6d4b3a2c1e0f8h';

describe('api:agents/proactive-schedules/import', () => {
	const validate = getValidator(paramDef);

	test('accepts an empty replacement snapshot', () => {
		expect(validate({ sessionId: SESSION_ID, schedules: [] })).toBe(true);
	});

	test('accepts completed schedule metadata', () => {
		expect(validate({
			sessionId: SESSION_ID,
			schedules: [{
				description: '提醒喝水',
				status: 'completed',
				trigger: { type: 'once', at: '2026-09-25 20:00' },
				createdAt: '2026-09-25T10:00:00.000Z',
				updatedAt: '2026-09-25T12:00:00.000Z',
				nextRunAt: null,
				lastRunAt: '2026-09-25T12:00:00.000Z',
				remainingRuns: 0,
			}],
		})).toBe(true);
	});

	test('rejects an unknown status', () => {
		expect(validate({
			sessionId: SESSION_ID,
			schedules: [{ description: '提醒喝水', status: 'unknown', trigger: {} }],
		})).toBe(false);
	});
});
