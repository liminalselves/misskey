/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isPreservedUsername } from '@/misc/username-reservation.js';

describe('isPreservedUsername', () => {
	test('matches case-insensitively and ignores control-panel line whitespace', () => {
		expect(isPreservedUsername('Admin', ['  admin  ', 'root'])).toBe(true);
	});

	test('does not match a partial username', () => {
		expect(isPreservedUsername('administrator', ['admin'])).toBe(false);
	});
});
