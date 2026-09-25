/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, expect, test } from '@jest/globals';
import { getValidator } from '../../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './import.js';

const SESSION_ID = '9g6d4b3a2c1e0f8h';

describe('api:agents/compression-sticky/import', () => {
	const validate = getValidator(paramDef);

	test('accepts an empty replacement snapshot', () => {
		expect(validate({ sessionId: SESSION_ID, stickies: [] })).toBe(true);
	});

	test('accepts full sticky metadata', () => {
		expect(validate({
			sessionId: SESSION_ID,
			stickies: [{
				createdAt: '2026-09-25T10:00:00.000Z',
				updatedAt: '2026-09-25T11:00:00.000Z',
				fromMessageId: 'new-from-message',
				toMessageId: 'new-to-message',
				summaryText: '摘要',
				state: 'failed',
				userOverridden: false,
				sourceFingerprint: 'abc',
				errorMessage: 'failed',
				lastModelId: 'model',
				sortIndex: 2,
				retryCount: 4,
			}],
		})).toBe(true);
	});

	test('rejects a negative retry count', () => {
		expect(validate({
			sessionId: SESSION_ID,
			stickies: [{ summaryText: '摘要', state: 'active', userOverridden: false, sortIndex: 0, retryCount: -1 }],
		})).toBe(false);
	});
});
