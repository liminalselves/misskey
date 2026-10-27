/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@@/js/config.js', () => ({ apiUrl: 'http://test/api' }));
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { _agents: {} } } }));
vi.mock('@/utility/agent-control-embed.js', () => ({
	getAgentControlRuntimeToken: () => null,
	notifyAgentControlApiSuccess: vi.fn(),
	notifyAgentControlAuthenticationFailure: vi.fn(),
}));

import { misskeyApi, pendingApiRequestsCount } from '@/utility/misskey-api.js';

function hangingFetch() {
	return vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
		init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
	}));
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('misskeyApi timeout', () => {
	test('a hanging request rejects with REQUEST_TIMEOUT and releases the pending counter', async () => {
		vi.stubGlobal('fetch', hangingFetch());
		const promise = misskeyApi('meta', {});
		const assertion = expect(promise).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
		expect(pendingApiRequestsCount.value).toBe(1);
		await vi.advanceTimersByTimeAsync(60_000);
		await assertion;
		expect(pendingApiRequestsCount.value).toBe(0);
	});

	test('agents endpoints get the long cap', async () => {
		vi.stubGlobal('fetch', hangingFetch());
		let settled = false;
		const promise = misskeyApi('agents/sessions/show' as 'meta', {}).catch(() => { settled = true; });
		await vi.advanceTimersByTimeAsync(60_000);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(240_000);
		await promise;
		expect(settled).toBe(true);
	});

	test('caller aborts keep their original AbortError', async () => {
		vi.stubGlobal('fetch', hangingFetch());
		const controller = new AbortController();
		const promise = misskeyApi('meta', {}, undefined, controller.signal);
		controller.abort();
		await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
	});
});
