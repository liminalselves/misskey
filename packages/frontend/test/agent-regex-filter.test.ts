/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test } from 'vitest';
import { reactive } from 'vue';
import {
	filterAgentRegexTexts,
	setAgentRegexWorkerFactoryForTesting,
	type AgentRegexFilterRule,
} from '@/utility/agent-regex-filter.js';

/** Mirrors the worker semantics so tests exercise the utility, not the regex engine. */
function applyRulesLikeWorker(rules: AgentRegexFilterRule[], effect: string, items: Array<{ role: string; text: string }>): string[] {
	return items.map(item => {
		let text = item.text;
		for (const rule of rules) {
			if (!rule.targets.includes(item.role as 'user' | 'assistant') || !rule.effects.includes(effect as 'hide' | 'aiInvisible')) continue;
			try {
				text = text.replace(new RegExp(rule.pattern, 'gu'), '');
			} catch {
				// Invalid legacy rules are ignored.
			}
		}
		return text;
	});
}

class FakeWorker {
	public readonly posted: unknown[] = [];
	public terminated = false;
	private readonly messageListeners: Array<(event: { data: unknown }) => void> = [];
	constructor(private readonly mode: 'echo' | 'silent') {}

	public postMessage(data: unknown): void {
		data = structuredClone(data);
		this.posted.push(data);
		if (this.mode !== 'echo') return;
		const req = data as {
			requestId: number;
			rules: AgentRegexFilterRule[];
			effect: 'hide' | 'aiInvisible';
			items: Array<{ role: 'user' | 'assistant'; text: string }>;
		};
		const results = applyRulesLikeWorker(req.rules, req.effect, req.items);
		for (const listener of [...this.messageListeners]) {
			listener({ data: { requestId: req.requestId, results } });
		}
	}

	public addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
		if (type === 'message') this.messageListeners.push(listener);
	}

	public terminate(): void {
		this.terminated = true;
	}
}

const HIDE_RULE: AgentRegexFilterRule = { pattern: 'hidden-', targets: ['user'], effects: ['hide'] };

afterEach(() => {
	setAgentRegexWorkerFactoryForTesting(null);
});

describe('filterAgentRegexTexts', () => {
	test('merges same-tick requests into a single worker invocation', async () => {
		const created: FakeWorker[] = [];
		setAgentRegexWorkerFactoryForTesting(() => {
			const worker = new FakeWorker('echo');
			created.push(worker);
			return worker as unknown as Worker;
		});
		const [first, second] = await Promise.all([
			filterAgentRegexTexts([HIDE_RULE], 'hide', [{ role: 'user', text: 'hidden-one' }]),
			filterAgentRegexTexts([{ ...HIDE_RULE }], 'hide', [{ role: 'user', text: 'hidden-two' }]),
		]);
		expect(created).toHaveLength(1);
		expect(created[0].posted).toHaveLength(1);
		expect((created[0].posted[0] as { items: unknown[] }).items).toHaveLength(2);
		expect(created[0].terminated).toBe(false);
		expect(first).toEqual(['one']);
		expect(second).toEqual(['two']);
	});

	test.each([false, true])('filters reactive rules and items through structured cloning (filtered rules: %s)', async (filtered) => {
		const worker = new FakeWorker('echo');
		setAgentRegexWorkerFactoryForTesting(() => worker as unknown as Worker);
		const rules = reactive([{ ...HIDE_RULE, targets: [...HIDE_RULE.targets], effects: [...HIDE_RULE.effects] }]);
		const applicableRules = filtered ? rules.filter(rule => rule.effects.includes('hide')) : rules;
		const items = reactive([{ role: 'user' as const, text: 'hidden-visible' }]);
		await expect(filterAgentRegexTexts(applicableRules, 'hide', items)).resolves.toEqual(['visible']);
		expect(worker.terminated).toBe(false);
	});

	test('retries worker creation on the next batch after a setup failure', async () => {
		let attempts = 0;
		setAgentRegexWorkerFactoryForTesting(() => {
			if (++attempts === 1) throw new Error('temporary setup failure');
			return new FakeWorker('echo') as unknown as Worker;
		});
		await expect(filterAgentRegexTexts([HIDE_RULE], 'hide', [{ role: 'user', text: 'hidden-first' }])).resolves.toBeNull();
		await expect(filterAgentRegexTexts([HIDE_RULE], 'hide', [{ role: 'user', text: 'hidden-second' }])).resolves.toEqual(['second']);
		expect(attempts).toBe(2);
	});

	test('resolves null and terminates the worker when the batch exceeds its time budget', async () => {
		let worker: FakeWorker | undefined;
		setAgentRegexWorkerFactoryForTesting(() => {
			worker = new FakeWorker('silent');
			return worker as unknown as Worker;
		});
		const startedAt = Date.now();
		const result = await filterAgentRegexTexts([HIDE_RULE], 'hide', [{ role: 'user', text: 'hidden-x' }], 20);
		expect(result).toBeNull();
		expect(worker?.terminated).toBe(true);
		expect(Date.now() - startedAt).toBeLessThan(5_000);
	});

	test('resolves null when the worker cannot be created', async () => {
		setAgentRegexWorkerFactoryForTesting(() => {
			throw new Error('boom');
		});
		await expect(filterAgentRegexTexts([HIDE_RULE], 'hide', [{ role: 'user', text: 'x' }])).resolves.toBeNull();
	});

	test('no applicable rule resolves synchronously without ever constructing a worker', async () => {
		setAgentRegexWorkerFactoryForTesting(() => {
			throw new Error('worker must not be constructed');
		});
		const result = await filterAgentRegexTexts(
			[{ pattern: 'x', targets: ['user'], effects: ['aiInvisible'] }],
			'hide',
			[{ role: 'user', text: 'untouched' }],
		);
		expect(result).toEqual(['untouched']);
	});

	test('items queued while worker setup is in flight are still delivered', async () => {
		const worker = new FakeWorker('echo');
		let queuedDuringSetup: Promise<string[] | null> | undefined;
		setAgentRegexWorkerFactoryForTesting(() => {
			// Enqueue from inside setup: the new flush microtask fires while the first
			// flush is still awaiting ensureWorker (flushing guard must not strand it).
			queuedDuringSetup = filterAgentRegexTexts([{ ...HIDE_RULE }], 'hide', [{ role: 'user', text: 'hidden-late' }]);
			return worker as unknown as Worker;
		});
		const first = await filterAgentRegexTexts([HIDE_RULE], 'hide', [{ role: 'user', text: 'hidden-early' }]);
		expect(first).toEqual(['early']);
		await expect(queuedDuringSetup).resolves.toEqual(['late']);
	});

	test('postMessage throwing resolves every caller with null and drops the worker', async () => {
		const worker = new FakeWorker('echo');
		const originalPost = worker.postMessage.bind(worker);
		let calls = 0;
		worker.postMessage = (data: unknown) => {
			calls += 1;
			if (calls === 1) {
				originalPost(data);
				return;
			}
			throw new Error('postMessage failed');
		};
		setAgentRegexWorkerFactoryForTesting(() => worker as unknown as Worker);
		const results = await Promise.all([
			filterAgentRegexTexts([HIDE_RULE], 'hide', [{ role: 'user', text: 'hidden-a' }]),
			// Different rule set forces a second group whose postMessage throws.
			filterAgentRegexTexts([{ pattern: 'other-', targets: ['user'], effects: ['hide'] }], 'hide', [{ role: 'user', text: 'other-b' }]),
		]);
		// First group already echoed; the never-posted group resolves null, not a hang.
		expect(results[0]).toEqual(['a']);
		expect(results[1]).toBeNull();
		expect(worker.terminated).toBe(true);
	});
});
