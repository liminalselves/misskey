/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const { lookup } = vi.hoisted(() => ({
	lookup: vi.fn<(host: string, opts: unknown) => Promise<{ address: string }[]>>(),
}));
vi.mock('node:dns/promises', () => ({ default: { lookup } }));

import { createLlmUrlBatchValidator, UnsafeLlmUrlError } from '@/misc/validate-llm-endpoint-url.js';

describe('createLlmUrlBatchValidator', () => {
	beforeEach(() => {
		lookup.mockReset();
		lookup.mockResolvedValue([{ address: '8.8.8.8' }]);
	});

	test('skips DNS for URLs already stored in config', async () => {
		const validate = createLlmUrlBatchValidator(['https://api.example.com/v1']);
		const u = await validate('api.example.com/v1');
		expect(u.href).toBe('https://api.example.com/v1');
		expect(lookup).not.toHaveBeenCalled();
	});

	test('looks up each new host once and shares the result', async () => {
		const validate = createLlmUrlBatchValidator([]);
		await Promise.all([
			validate('https://a.example.com/v1'),
			validate('https://A.example.com/v2'),
			validate('https://b.example.com'),
		]);
		expect(lookup).toHaveBeenCalledTimes(2);
	});

	test('still rejects private resolution and syntax errors for new URLs', async () => {
		lookup.mockResolvedValue([{ address: '10.0.0.1' }]);
		const validate = createLlmUrlBatchValidator([]);
		await expect(validate('https://internal.example.com')).rejects.toBeInstanceOf(UnsafeLlmUrlError);
		await expect(validate('http://plain.example.com')).rejects.toMatchObject({ reason: 'not_https' });
		await expect(validate('https://localhost/v1')).rejects.toMatchObject({ reason: 'blocked_host' });
	});

	test('trusted stored URLs still go through syntax checks', async () => {
		const validate = createLlmUrlBatchValidator(['http://old.example.com']);
		await expect(validate('http://old.example.com')).rejects.toMatchObject({ reason: 'not_https' });
	});
});
