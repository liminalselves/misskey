/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getEffectiveLlmModels, normalizeAgentLlmApiKeys, normalizeAgentLlmModelsParam } from '@/misc/agent-llm-models.js';
import type { MiMeta } from '@/models/Meta.js';

const baseModel = {
	id: 'model-1',
	name: 'Model 1',
	description: null,
	baseUrl: 'https://example.com/v1',
	apiModelName: 'example-model',
	maxContextTokens: 8192,
	maxOutputTokensPerCall: 2048,
	unlisted: false,
	groupId: null,
	costPerCall: 0,
	billingMode: 'per_call' as const,
	pricePerMillionInputCacheHitTokens: 0,
	pricePerMillionInputCacheMissTokens: 0,
	pricePerMillionOutputTokens: 0,
};

describe('agent LLM API keys', () => {
	test('cleans, de-duplicates, and preserves key order', () => {
		expect(normalizeAgentLlmApiKeys([' key-a ', '', 'key-b', 'key-a'], 'legacy')).toEqual(['key-a', 'key-b']);
	});

	test('uses the legacy apiKey when apiKeys is missing or empty', () => {
		expect(normalizeAgentLlmApiKeys(undefined, ' legacy-key ')).toEqual(['legacy-key']);
		expect(normalizeAgentLlmApiKeys([], ' legacy-key ')).toEqual(['legacy-key']);
	});

	test('normalizes saved models with a first-key compatibility mirror', () => {
		const result = normalizeAgentLlmModelsParam([{
			...baseModel,
			apiKey: 'stale-key',
			apiKeys: [' key-a ', 'key-b', 'key-a'],
			multiKeyEnabled: true,
		}]);
		expect(result.ok).toBe(true);
		if (!result.ok || result.value == null) return;
		expect(result.value[0]).toEqual(expect.objectContaining({
			apiKey: 'key-a',
			apiKeys: ['key-a', 'key-b'],
			multiKeyEnabled: true,
		}));
	});

	test('loads old single-key models as a disabled one-item pool', () => {
		const meta = {
			agentLlmModels: [{
				...baseModel,
				apiKey: 'legacy-key',
			}],
		} as unknown as MiMeta;
		expect(getEffectiveLlmModels(meta)[0]).toEqual(expect.objectContaining({
			apiKey: 'legacy-key',
			apiKeys: ['legacy-key'],
			multiKeyEnabled: false,
		}));
	});
});
