/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, expect, test } from '@jest/globals';
import { getValidator } from '../../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './import-context.js';

const SESSION_ID = '9g6d4b3a2c1e0f8h';

describe('api:agents/messages/import-context', () => {
	const validate = getValidator(paramDef);

	test('accepts an empty v7 snapshot', () => {
		expect(validate({ sessionId: SESSION_ID, sessionCreatedAt: '2026-09-25T12:00:00.000Z', messages: [] })).toBe(true);
	});

	test('accepts private and internal message fields', () => {
		expect(validate({
			sessionId: SESSION_ID,
			messages: [{
				sourceId: 'source-message',
				role: 'system',
				content: '',
				createdAt: '2026-09-25T12:34:56.000Z',
				timeTrusted: false,
				rawContent: null,
				proactiveScheduleControlRaw: '<proactive_schedule_actions>[]</proactive_schedule_actions>',
				proactiveScheduleControlError: {
					code: 'INVALID_JSON',
					message: 'invalid',
					processedAt: '2026-09-25T12:35:00.000Z',
				},
				isInternal: true,
				statsDialogueStyleId: null,
				promptTokens: 12,
				completionTokens: 3,
			}],
		})).toBe(true);
	});

	test('rejects negative token counts', () => {
		expect(validate({
			sessionId: SESSION_ID,
			messages: [{ role: 'assistant', content: 'ok', promptTokens: -1 }],
		})).toBe(false);
	});
});
