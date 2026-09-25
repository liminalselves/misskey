/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, expect, test } from '@jest/globals';
import { getValidator } from '../../../../../../test/prelude/get-api-validator.js';
import { paramDef } from './export.js';

const SESSION_ID = '9g6d4b3a2c1e0f8h';

describe('api:agents/sessions/export', () => {
	const validate = getValidator(paramDef);

	test('requires a session id', () => {
		expect(validate({ sessionId: SESSION_ID })).toBe(true);
		expect(validate({})).toBe(false);
	});
});
