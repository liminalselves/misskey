/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createAgentControlParentGuard } from '@/utility/agent-control-embed.js';

const parent = {} as Window;
function message(origin: string, type = 'misskey:agent-control:configure', source: Window = parent): MessageEvent {
	return { source, origin, data: { type, token: 'test-token' } } as MessageEvent;
}

describe('Agent control parent handshake', () => {
	beforeEach(() => {
		vi.spyOn(window, 'parent', 'get').mockReturnValue(parent);
		vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://host-a.example/project');
	});
	afterEach(() => vi.restoreAllMocks());

	test('checks both window source and known host origin', () => {
		const guard = createAgentControlParentGuard();
		expect(guard.accept(message('https://host-a.example', undefined, {} as Window))).toBe(false);
		expect(guard.accept(message('https://other.example'))).toBe(false);
		expect(guard.accept(message('https://host-a.example'))).toBe(true);
		expect(guard.origin()).toBe('https://host-a.example');
	});

	test('learns a missing referrer only from a recognized parent handshake', () => {
		vi.spyOn(document, 'referrer', 'get').mockReturnValue('');
		const guard = createAgentControlParentGuard();
		expect(guard.origin()).toBeNull();
		expect(guard.accept(message('https://other.example', 'unrelated'))).toBe(false);
		expect(guard.origin()).toBeNull();
		expect(guard.accept(message('https://host-b.example'))).toBe(true);
		expect(guard.accept(message('https://host-a.example'))).toBe(false);
		expect(guard.origin()).toBe('https://host-b.example');
	});

	test('rejects opaque origins without poisoning the next valid handshake', () => {
		vi.spyOn(document, 'referrer', 'get').mockReturnValue('');
		const guard = createAgentControlParentGuard();
		expect(guard.accept(message('null'))).toBe(false);
		expect(guard.origin()).toBeNull();
		expect(guard.accept(message('https://host-a.example'))).toBe(true);
	});

	test('keeps separate legitimate hosts independent', () => {
		const first = createAgentControlParentGuard();
		vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://host-b.example/');
		const second = createAgentControlParentGuard();
		expect(first.accept(message('https://host-a.example'))).toBe(true);
		expect(second.accept(message('https://host-b.example'))).toBe(true);
		expect(second.accept(message('https://host-a.example'))).toBe(false);
	});
});
