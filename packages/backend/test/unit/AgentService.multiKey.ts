/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect } from 'vitest';

import { agentLlmAttemptErrorFrom, agentsErrors, deprioritizeCoolingAgentLlmApiKeys, invokeAgentLlmApiKeys, isAgentLlmKeyUnusableError, rotateAgentLlmApiKeys } from '@/core/AgentService.js';
import { ApiError } from '@/server/api/error.js';

describe('AgentService multi-key helpers', () => {
	test('rotates keys evenly from the Redis counter value', () => {
		expect(rotateAgentLlmApiKeys(['a', 'b', 'c'], 1)).toEqual(['a', 'b', 'c']);
		expect(rotateAgentLlmApiKeys(['a', 'b', 'c'], 2)).toEqual(['b', 'c', 'a']);
		expect(rotateAgentLlmApiKeys(['a', 'b', 'c'], 3)).toEqual(['c', 'a', 'b']);
		expect(rotateAgentLlmApiKeys(['a', 'b', 'c'], 4)).toEqual(['a', 'b', 'c']);
	});

	test('keeps a single key unchanged', () => {
		expect(rotateAgentLlmApiKeys(['only'], 100)).toEqual(['only']);
	});

	test('extracts safe attempt diagnostics from ApiError', () => {
		const error = new ApiError(agentsErrors.llmRequestFailed, {
			reason: 'UPSTREAM_HTTP_ERROR',
			status: 401,
			detail: 'invalid key',
		});
		expect(agentLlmAttemptErrorFrom(error, 2)).toEqual({
			index: 2,
			code: 'AGENTS_LLM_FAILED',
			reason: 'UPSTREAM_HTTP_ERROR',
			status: 401,
			detail: 'invalid key',
		});
	});

	test('falls back to the next key after a retryable failure', async () => {
		const invoked: string[] = [];
		const result = await invokeAgentLlmApiKeys(['bad', 'good'], async key => {
			invoked.push(key);
			if (key === 'bad') throw new ApiError(agentsErrors.llmRequestFailed, { reason: 'NETWORK_ERROR' });
			return 'ok';
		});
		expect(result).toBe('ok');
		expect(invoked).toEqual(['bad', 'good']);
	});

	test('aggregates all retryable key failures', async () => {
		await expect(invokeAgentLlmApiKeys(['a', 'b'], async (key, index) => {
			throw new ApiError(index === 0 ? agentsErrors.llmRequestFailed : agentsErrors.llmTimeout, {
				reason: index === 0 ? 'UPSTREAM_HTTP_ERROR' : undefined,
				status: index === 0 ? 401 : undefined,
				detail: index === 0 ? `invalid ${key}` : undefined,
			});
		})).rejects.toMatchObject({
			code: 'AGENTS_LLM_FAILED',
			info: {
				reason: 'ALL_KEYS_FAILED',
				attempts: [
					{ index: 1, code: 'AGENTS_LLM_FAILED', status: 401, detail: 'invalid a' },
					{ index: 2, code: 'AGENTS_LLM_TIMEOUT' },
				],
			},
		});
	});

	test('treats auth failure and exhausted quota as unusable keys, but not plain rate limits', () => {
		const upstream = (status: number, detail?: string) => new ApiError(agentsErrors.llmRequestFailed, { reason: 'UPSTREAM_HTTP_ERROR', status, ...(detail ? { detail } : {}) });
		expect(isAgentLlmKeyUnusableError(upstream(401))).toBe(true);
		expect(isAgentLlmKeyUnusableError(upstream(403))).toBe(true);
		expect(isAgentLlmKeyUnusableError(upstream(429, 'insufficient_quota: inference exceeds tpm/rpm limit'))).toBe(true);
		expect(isAgentLlmKeyUnusableError(upstream(429, 'inference exceeds tpm/rpm limit'))).toBe(false);
		expect(isAgentLlmKeyUnusableError(upstream(500))).toBe(false);
		expect(isAgentLlmKeyUnusableError(new ApiError(agentsErrors.llmRequestFailed, { reason: 'NETWORK_ERROR' }))).toBe(false);
		expect(isAgentLlmKeyUnusableError(new ApiError(agentsErrors.llmTimeout))).toBe(false);
	});

	test('moves cooling keys to the end without dropping any', () => {
		expect(deprioritizeCoolingAgentLlmApiKeys(['a', 'b', 'c'], new Set(['a']))).toEqual(['b', 'c', 'a']);
		expect(deprioritizeCoolingAgentLlmApiKeys(['a', 'b', 'c'], new Set(['a', 'c']))).toEqual(['b', 'a', 'c']);
		expect(deprioritizeCoolingAgentLlmApiKeys(['a', 'b'], new Set(['a', 'b']))).toEqual(['a', 'b']);
		expect(deprioritizeCoolingAgentLlmApiKeys(['a', 'b'], new Set())).toEqual(['a', 'b']);
	});

	test('reports each failed key to the failure hook', async () => {
		const failed: string[] = [];
		const result = await invokeAgentLlmApiKeys(['bad', 'good'], async key => {
			if (key === 'bad') throw new ApiError(agentsErrors.llmRequestFailed, { reason: 'UPSTREAM_HTTP_ERROR', status: 401 });
			return 'ok';
		}, (key, error) => {
			expect(isAgentLlmKeyUnusableError(error)).toBe(true);
			failed.push(key);
		});
		expect(result).toBe('ok');
		expect(failed).toEqual(['bad']);
	});

	test('does not try another key after a client abort', async () => {
		const invoked: string[] = [];
		await expect(invokeAgentLlmApiKeys(['a', 'b'], async key => {
			invoked.push(key);
			throw new ApiError(agentsErrors.llmAborted);
		})).rejects.toMatchObject({ code: 'AGENTS_LLM_ABORTED' });
		expect(invoked).toEqual(['a']);
	});
});
