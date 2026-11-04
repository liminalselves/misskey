/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi } from 'vitest';
import { agentImageErrors, invokeAgentImageApiKeys, resolveAgentImageModelApiKeys } from '@/core/AgentImageService.js';
import { getEffectiveImageModels } from '@/misc/agent-image-models.js';
import { ApiError } from '@/server/api/error.js';
import type { MiMeta } from '@/models/Meta.js';

const upstream = (diagnostic: string) => new ApiError(agentImageErrors.upstreamFailed, { diagnostic });

describe('image model multi-key resolution', () => {
	test('uses only the first key while multi-key is off', () => {
		expect(resolveAgentImageModelApiKeys({ apiKey: 'a', apiKeys: ['a', 'b'], multiKeyEnabled: false })).toEqual(['a']);
	});

	test('uses every unique non-empty key while multi-key is on', () => {
		expect(resolveAgentImageModelApiKeys({ apiKey: 'a', apiKeys: [' a ', '', 'b', 'a', 'c'], multiKeyEnabled: true })).toEqual(['a', 'b', 'c']);
	});

	test('falls back to the legacy single apiKey', () => {
		expect(resolveAgentImageModelApiKeys({ apiKey: 'legacy', apiKeys: null, multiKeyEnabled: true })).toEqual(['legacy']);
	});

	test('effective models expose normalized keys', () => {
		const [model] = getEffectiveImageModels({ agentImageModels: [{ id: 'm', name: 'M', provider: 'openai', apiKey: 'a', apiKeys: ['a', 'b'], multiKeyEnabled: true }] } as unknown as MiMeta);
		expect(model.apiKeys).toEqual(['a', 'b']);
		expect(model.multiKeyEnabled).toBe(true);
	});
});

describe('invokeAgentImageApiKeys', () => {
	test('fails over to the next key on upstream failure', async () => {
		const invoke = vi.fn(async (key: string) => {
			if (key === 'a') throw upstream('HTTP 429');
			return key;
		});
		await expect(invokeAgentImageApiKeys(['a', 'b'], invoke)).resolves.toBe('b');
		expect(invoke).toHaveBeenCalledTimes(2);
	});

	test('does not try other keys for non-upstream errors', async () => {
		const invoke = vi.fn(async () => { throw new ApiError(agentImageErrors.notConfigured); });
		await expect(invokeAgentImageApiKeys(['a', 'b'], invoke)).rejects.toMatchObject({ code: agentImageErrors.notConfigured.code });
		expect(invoke).toHaveBeenCalledTimes(1);
	});

	test('keeps the original error for a single key', async () => {
		const err = upstream('HTTP 500');
		await expect(invokeAgentImageApiKeys(['a'], async () => { throw err; })).rejects.toBe(err);
	});

	test('aggregates every key diagnostic when all keys fail', async () => {
		const rejected = invokeAgentImageApiKeys(['a', 'b'], async key => { throw upstream(`HTTP 401 for ${key}`); });
		await expect(rejected).rejects.toMatchObject({ code: agentImageErrors.upstreamFailed.code });
		const err = await rejected.catch(e => e as ApiError);
		expect(err.info?.diagnostic).toContain('All 2 API keys failed.');
		expect(err.info?.diagnostic).toContain('[Key 1]');
		expect(err.info?.diagnostic).toContain('[Key 2]');
	});
});
