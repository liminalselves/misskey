/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { agentLlmAttemptErrorFrom, agentsErrors, invokeAgentLlmApiKeys, rotateAgentLlmApiKeys } from '@/core/AgentService.js';
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

	test('does not try another key after a client abort', async () => {
		const invoked: string[] = [];
		await expect(invokeAgentLlmApiKeys(['a', 'b'], async key => {
			invoked.push(key);
			throw new ApiError(agentsErrors.llmAborted);
		})).rejects.toMatchObject({ code: 'AGENTS_LLM_ABORTED' });
		expect(invoked).toEqual(['a']);
	});
});
