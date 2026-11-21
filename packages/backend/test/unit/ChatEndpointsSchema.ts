/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import * as endpointsObject from '@/server/api/endpoint-list.js';

describe('Chat & modified endpoint AJV schemas', () => {
	test('every endpoint in endpoint-list compiles its paramDef via Endpoint constructor without AJV error', () => {
		const entries = Object.entries(endpointsObject);
		expect(entries.length).toBeGreaterThan(0);

		for (const [name, mod] of entries) {
			const EndpointClass = (mod as { default: new (...args: any[]) => unknown }).default;
			expect(typeof EndpointClass, `endpoint ${name} should export default class`).toBe('function');
			const stubArgs = Array.from({ length: Math.max(EndpointClass.length, 20) }, () => ({}));
			expect(() => new EndpointClass(...stubArgs), `endpoint ${name} failed schema compilation`).not.toThrow();
		}
	});
});
