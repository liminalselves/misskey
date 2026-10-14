/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll } from '@jest/globals';
import {
	AgentRegexBatchFilter,
	AgentRegexFilterTimeoutError,
	AgentRegexFilterUnavailableError,
	type AgentRegexFilterRule,
} from '@/core/agent-regex-filter.js';

const RULE = (pattern: string, targets: Array<'user' | 'assistant'>, effects: Array<'hide' | 'aiInvisible'>): AgentRegexFilterRule =>
	({ pattern, targets, effects });

const createdFilters: AgentRegexBatchFilter[] = [];
function makeFilter(timeoutMs?: number): AgentRegexBatchFilter {
	const filter = new AgentRegexBatchFilter(timeoutMs);
	createdFilters.push(filter);
	return filter;
}

afterAll(() => {
	// Terminate lingering workers so Jest does not need to force-exit them.
	for (const filter of createdFilters) filter.dispose();
});

describe('AgentRegexBatchFilter', () => {
	test('no applicable rule short-circuits without touching a worker', async () => {
		const filter = makeFilter(50);
		const results = await filter.applyBatch(
			[RULE('x', ['user'], ['hide'])],
			'aiInvisible',
			[
				{ role: 'user', text: 'x untouched' },
				{ role: 'assistant', text: 'x untouched too' },
			],
		);
		expect(results).toEqual(['x untouched', 'x untouched too']);
	});

	test('applies multiple rules with target/effect selection across a batch', async () => {
		const filter = makeFilter();
		const rules = [
			RULE('SECRET-', ['user'], ['aiInvisible']),
			RULE('</?think>', ['assistant'], ['aiInvisible', 'hide']),
			RULE('x', ['user', 'assistant'], ['hide']),
		];
		const items = [
			{ role: 'user' as const, text: 'SECRET-keep x' },
			{ role: 'assistant' as const, text: '<think>hidden</think> shown x' },
		];
		await expect(filter.applyBatch(rules, 'aiInvisible', items)).resolves.toEqual(['keep x', 'hidden shown x']);
		await expect(filter.applyBatch(rules, 'hide', items)).resolves.toEqual(['SECRET-keep ', 'hidden shown ']);
	});

	test('preserves full JavaScript regex semantics (lookbehind, backrefs, unicode classes)', async () => {
		const filter = makeFilter();
		const rules = [
			RULE('(?<=foo)bar', ['user'], ['hide']),
			RULE('(a|b)\\1+', ['user'], ['hide']),
			RULE('(?<w>\\w+) \\k<w>', ['user'], ['hide']),
			RULE('\\p{Lu}+', ['user'], ['hide']),
		];
		const results = await filter.applyBatch(rules, 'hide', [
			{ role: 'user', text: 'foobar bazbar' },
			{ role: 'user', text: 'aa bb ab' },
			{ role: 'user', text: 'hey hey you' },
			{ role: 'user', text: 'ABC def GHI' },
		]);
		expect(results).toEqual([
			'foo bazbar',
			'  ab',
			' you',
			' def ',
		]);
	});

	test('invalid legacy rules stay ignored while valid ones still apply', async () => {
		const filter = makeFilter();
		const results = await filter.applyBatch(
			[
				RULE('[unclosed', ['user'], ['hide']),
				RULE('(?<broken', ['user'], ['hide']),
				RULE('ok-', ['user'], ['hide']),
			],
			'hide',
			[{ role: 'user', text: 'ok-kept' }],
		);
		expect(results).toEqual(['kept']);
	});

	test('handles an empty batch', async () => {
		const filter = makeFilter();
		await expect(filter.applyBatch([RULE('x', ['user'], ['hide'])], 'hide', [])).resolves.toEqual([]);
	});

	test('catastrophic backtracking fails with an explicit timeout error in bounded time', async () => {
		const filter = makeFilter(50);
		const startedAt = Date.now();
		await expect(filter.applyBatch(
			[RULE('(a+)+$', ['user'], ['hide'])],
			'hide',
			[{ role: 'user', text: 'a'.repeat(35) + 'b' }],
		)).rejects.toBeInstanceOf(AgentRegexFilterTimeoutError);
		// The bound is 50ms; allow generous slack for worker startup/termination.
		expect(Date.now() - startedAt).toBeLessThan(5_000);
	});

	test('recovers on a fresh worker after a timeout terminated the stuck one', async () => {
		const filter = makeFilter(50);
		await expect(filter.applyBatch(
			[RULE('(a+)+$', ['user'], ['hide'])],
			'hide',
			[{ role: 'user', text: 'a'.repeat(35) + 'b' }],
		)).rejects.toBeInstanceOf(AgentRegexFilterTimeoutError);
		await expect(filter.applyBatch(
			[RULE('bad-', ['user'], ['hide'])],
			'hide',
			[{ role: 'user', text: 'bad-good' }],
		)).resolves.toEqual(['good']);
	});

	test('dispose rejects in-flight batches instead of leaving dangling timers', async () => {
		const filter = makeFilter(10_000);
		const settled = filter.applyBatch(
			[RULE('x', ['user'], ['hide'])],
			'hide',
			[{ role: 'user', text: 'x' }],
		).then(
			() => 'resolved',
			(err: unknown) => err,
		);
		// Runs before the worker reply can arrive in the event loop.
		filter.dispose();
		await expect(settled).resolves.toBeInstanceOf(AgentRegexFilterUnavailableError);
	});
});
