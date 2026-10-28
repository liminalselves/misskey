/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { deepClone } from '@/utility/clone.js';

export type AgentRegexFilterRole = 'user' | 'assistant';
export type AgentRegexFilterEffect = 'hide' | 'aiInvisible';
export type AgentRegexFilterRule = {
	pattern: string;
	targets: AgentRegexFilterRole[];
	effects: AgentRegexFilterEffect[];
};
export type AgentRegexFilterItem = { role: AgentRegexFilterRole; text: string };

/** Hard upper bound for one batch; character regex never runs on the main thread. */
export const AGENT_REGEX_FILTER_TIMEOUT_MS = 1_000;

type QueuedBatch = {
	rules: AgentRegexFilterRule[];
	effect: AgentRegexFilterEffect;
	items: AgentRegexFilterItem[];
	timeoutMs: number;
	resolve: (results: string[] | null) => void;
};

type MergedGroup = {
	request: {
		rules: AgentRegexFilterRule[];
		effect: AgentRegexFilterEffect;
		items: AgentRegexFilterItem[];
	};
	/** Each participant receives exactly its own slice of the merged results. */
	participants: Array<{ offset: number; length: number; resolve: (results: string[] | null) => void }>;
	timeoutMs: number;
};

type WorkerResponse = {
	requestId: number;
	results?: string[];
	error?: string;
};

const queue: QueuedBatch[] = [];
let flushScheduled = false;
let flushing = false;
let worker: Worker | null = null;
let workerSetup: Promise<Worker | null> | null = null;
let nextRequestId = 1;
const pending = new Map<number, { resolve: (results: string[] | null) => void; timer: number }>();

/** Test seam replacing the bundled worker constructor; production never sets it. */
let workerFactoryForTesting: (() => Worker) | null = null;

export function setAgentRegexWorkerFactoryForTesting(factory: (() => Worker) | null): void {
	workerFactoryForTesting = factory;
	worker = null;
	workerSetup = null;
}

/**
 * Filter texts through character regex rules in a bounded web worker, merged per tick
 * into one worker invocation. Never rejects: resolves null when the worker is
 * unavailable, the batch exceeds its time budget, or dispatching fails.
 */
export function filterAgentRegexTexts(
	rules: AgentRegexFilterRule[],
	effect: AgentRegexFilterEffect,
	items: AgentRegexFilterItem[],
	timeoutMs: number = AGENT_REGEX_FILTER_TIMEOUT_MS,
): Promise<string[] | null> {
	if (!rules.some(rule => rule.effects.includes(effect))) {
		return Promise.resolve(items.map(item => item.text));
	}
	return new Promise(resolve => {
		queue.push({ rules, effect, items, timeoutMs, resolve });
		scheduleFlush();
	});
}

function scheduleFlush(): void {
	if (flushScheduled) return;
	flushScheduled = true;
	queueMicrotask(() => {
		flushScheduled = false;
		void flush();
	});
}

async function flush(): Promise<void> {
	if (flushing || queue.length === 0) return;
	flushing = true;
	const batches = queue.splice(0, queue.length);
	const settleAll = (results: string[] | null): void => {
		// Double-resolve is harmless: promises settle exactly once.
		for (const batch of batches) batch.resolve(results);
	};
	try {
		const groups = new Map<string, MergedGroup>();
		for (const batch of batches) {
			const key = `${batch.timeoutMs}\u0000${batch.effect}\u0000${JSON.stringify(batch.rules)}`;
			let group = groups.get(key);
			if (group == null) {
				group = {
					request: { rules: batch.rules, effect: batch.effect, items: [] },
					participants: [],
					timeoutMs: batch.timeoutMs,
				};
				groups.set(key, group);
			}
			group.participants.push({ offset: group.request.items.length, length: batch.items.length, resolve: batch.resolve });
			group.request.items.push(...batch.items);
		}
		const activeWorker = await ensureWorker();
		if (activeWorker == null) {
			settleAll(null);
			return;
		}
		try {
			for (const group of groups.values()) {
				const requestId = nextRequestId++;
				pending.set(requestId, {
					resolve: results => {
						for (const participant of group.participants) {
							participant.resolve(results == null ? null : results.slice(participant.offset, participant.offset + participant.length));
						}
					},
					timer: window.setTimeout(() => timeoutWorker(activeWorker), group.timeoutMs),
				});
				// Nested Vue proxies cannot cross the worker's structured-clone boundary.
				activeWorker.postMessage(deepClone({ requestId, ...group.request }));
			}
		} catch {
			// postMessage threw (e.g. a dying worker): fail registered entries, resolve
			// participants of groups that were never posted, then drop the worker.
			failAllPending();
			settleAll(null);
			destroyWorker(activeWorker);
		}
	} catch {
		// flush is called with `void`: it must never reject and strand callers.
		settleAll(null);
	} finally {
		flushing = false;
		// Items queued while this flush awaited worker setup were dropped by their own
		// microtask (flushing guard); re-arm so they are never stranded.
		if (queue.length > 0 && !flushScheduled) {
			scheduleFlush();
		}
	}
}

async function ensureWorker(): Promise<Worker | null> {
	if (worker != null) return worker;
	if (workerSetup == null) {
		workerSetup = (async () => {
			try {
				if (workerFactoryForTesting != null) {
					const created = workerFactoryForTesting();
					wireWorker(created);
					return created;
				}
				// Worker-less environments resolve null before loading the ?worker chunk.
				if (typeof Worker === 'undefined') return null;
				const { default: AgentRegexWorker } = await import('@/workers/agent-regex-filter?worker');
				const created = new AgentRegexWorker();
				wireWorker(created);
				return created;
			} catch {
				return null;
			}
		})();
	}
	const created = await workerSetup;
	worker = created;
	if (created == null) workerSetup = null;
	return created;
}

function wireWorker(target: Worker): void {
	target.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
		const message = event.data;
		if (message == null || typeof message.requestId !== 'number') return;
		const entry = pending.get(message.requestId);
		if (entry == null) return;
		pending.delete(message.requestId);
		window.clearTimeout(entry.timer);
		entry.resolve(message.error == null && Array.isArray(message.results) ? message.results : null);
	});
	target.addEventListener('error', () => {
		// Stale events of an already-replaced worker must not fail newer batches.
		if (worker !== target) return;
		failAllPending();
		destroyWorker(target);
	});
}

function timeoutWorker(stuckWorker: Worker): void {
	// A catastrophic pattern blocks the worker: drop it and fall back to raw text.
	if (worker !== stuckWorker) return;
	failAllPending();
	destroyWorker(stuckWorker);
}

function failAllPending(): void {
	for (const [requestId, entry] of pending) {
		window.clearTimeout(entry.timer);
		entry.resolve(null);
		pending.delete(requestId);
	}
}

function destroyWorker(target: Worker): void {
	if (worker === target) {
		worker = null;
		workerSetup = null;
	}
	target.terminate();
}

const FILTERED_TEXT_CACHE_LIMIT = 200;
const filteredTextCache = new Map<string, string>();
const filteredTextRequests = new Map<string, Promise<string | null>>();

/**
 * Share completed results and in-flight work across message mounts. Only successful
 * worker results are cached; failures keep the existing retry/fallback behavior.
 */
export function getAgentRegexTextWithCache(
	rules: AgentRegexFilterRule[],
	effect: AgentRegexFilterEffect,
	item: AgentRegexFilterItem,
	filter: typeof filterAgentRegexTexts = filterAgentRegexTexts,
): { cached: string | undefined; request: Promise<string | null> } {
	const key = JSON.stringify([
		rules.map(rule => [rule.pattern, [...rule.targets].sort(), [...rule.effects].sort()]),
		effect,
		item.role,
		item.text,
	]);
	const cached = filteredTextCache.get(key);
	if (cached != null) return { cached, request: Promise.resolve(cached) };

	let request = filteredTextRequests.get(key);
	if (request == null) {
		request = filter(rules, effect, [item]).then(results => {
			filteredTextRequests.delete(key);
			if (results == null) return null;
			const text = results[0] ?? '';
			if (filteredTextCache.size >= FILTERED_TEXT_CACHE_LIMIT) {
				const oldest = filteredTextCache.keys().next().value;
				if (oldest != null) filteredTextCache.delete(oldest);
			}
			filteredTextCache.set(key, text);
			return text;
		});
		filteredTextRequests.set(key, request);
	}
	return { cached: undefined, request };
}
