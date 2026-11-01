/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Worker } from 'node:worker_threads';

export type AgentRegexFilterRole = 'user' | 'assistant';
export type AgentRegexFilterEffect = 'hide' | 'aiInvisible';
export type AgentRegexFilterRule = {
	pattern: string;
	targets: AgentRegexFilterRole[];
	effects: AgentRegexFilterEffect[];
};
export type AgentRegexFilterItem = { role: AgentRegexFilterRole; text: string };

/** Hard upper bound for one batch; character regex execution is otherwise unbounded. */
export const AGENT_REGEX_FILTER_TIMEOUT_MS = 2_000;

/** Raised when a batch exceeds its time budget; the worker is terminated by then. */
export class AgentRegexFilterTimeoutError extends Error {
	public override readonly name = 'AgentRegexFilterTimeoutError';
	constructor(timeoutMs: number) {
		super(`Agent regex filtering exceeded the ${timeoutMs}ms time budget.`);
	}
}

/** Raised when the regex worker cannot be started or died unexpectedly. */
export class AgentRegexFilterUnavailableError extends Error {
	public override readonly name = 'AgentRegexFilterUnavailableError';
	constructor(detail: string) {
		super(`Agent regex worker unavailable: ${detail}`);
	}
}

type WorkerRequest = {
	requestId: number;
	rules: AgentRegexFilterRule[];
	effect: AgentRegexFilterEffect;
	items: AgentRegexFilterItem[];
};

type WorkerResponse = {
	requestId: number;
	results?: string[];
	error?: string;
};

// Eval'd CommonJS worker source: no separate compiled artifact, identical in dev,
// production builds and Jest. Keeps full JavaScript regex semantics ('gu' flags,
// lookbehind, backreferences); invalid legacy rules stay ignored.
const AGENT_REGEX_WORKER_SOURCE = `
'use strict';
const { parentPort } = require('node:worker_threads');
if (parentPort == null) throw new Error('agent regex worker must be started as a Worker');
parentPort.on('message', (req) => {
	try {
		// Compile the rule set once per batch (invalid compiles ignored once);
		// String.replace resets lastIndex on global regexes, so compiled instances
		// are reused across items with identical /gu semantics.
		const compiled = [];
		for (const rule of req.rules) {
			if (!rule.effects.includes(req.effect)) continue;
			try {
				compiled.push({ regex: new RegExp(rule.pattern, 'gu'), targets: rule.targets });
			} catch {
				// Invalid legacy rules are ignored.
			}
		}
		const results = [];
		for (const item of req.items) {
			let text = item.text;
			for (const entry of compiled) {
				if (!entry.targets.includes(item.role)) continue;
				text = text.replace(entry.regex, '');
			}
			results.push(text);
		}
		parentPort.postMessage({ requestId: req.requestId, results });
	} catch (err) {
		parentPort.postMessage({ requestId: req.requestId, error: String(err) });
	}
});
`;

/**
 * Bounded worker-thread executor for character regex rules. A catastrophic pattern can
 * only block the worker; once the budget is exceeded the worker is terminated and every
 * in-flight batch fails with an explicit timeout error. The worker respawns lazily.
 */
export class AgentRegexBatchFilter {
	private worker: Worker | null = null;
	private nextRequestId = 1;
	private readonly pending = new Map<number, {
		resolve: (results: string[]) => void;
		reject: (error: Error) => void;
		timer: NodeJS.Timeout;
	}>();

	constructor(
		private readonly timeoutMs: number = AGENT_REGEX_FILTER_TIMEOUT_MS,
	) {}

	/** One worker invocation filters the whole generation; never runs on the main thread. */
	public async applyBatch(rules: readonly AgentRegexFilterRule[], effect: AgentRegexFilterEffect, items: readonly AgentRegexFilterItem[]): Promise<string[]> {
		if (!rules.some(rule => rule.effects.includes(effect))) {
			return items.map(item => item.text);
		}
		let worker: Worker;
		try {
			worker = this.ensureWorker();
		} catch (err) {
			throw new AgentRegexFilterUnavailableError(err instanceof Error ? err.message : String(err));
		}
		const requestId = this.nextRequestId++;
		const request: WorkerRequest = { requestId, rules: [...rules], effect, items: [...items] };
		return new Promise<string[]>((resolve, reject) => {
			this.pending.set(requestId, {
				resolve,
				reject,
				timer: setTimeout(() => {
					// Stale timer of an already-replaced worker must not fail newer batches.
					if (this.worker !== worker) return;
					this.failAllPending(new AgentRegexFilterTimeoutError(this.timeoutMs));
					this.destroyWorker();
				}, this.timeoutMs),
			});
			worker.postMessage(request);
		});
	}

	/** Reject in-flight batches (destroyWorker alone would leave their timers dangling). */
	public dispose(): void {
		this.failAllPending(new AgentRegexFilterUnavailableError('filter disposed'));
		this.destroyWorker();
	}

	private ensureWorker(): Worker {
		if (this.worker != null) return this.worker;
		const worker = new Worker(AGENT_REGEX_WORKER_SOURCE, { eval: true });
		// An idle worker must never keep the event loop open during process shutdown.
		worker.unref();
		worker.on('message', (message: WorkerResponse) => {
			if (this.worker !== worker) return;
			if (typeof message?.requestId !== 'number') return;
			const entry = this.pending.get(message.requestId);
			if (entry == null) return;
			this.pending.delete(message.requestId);
			clearTimeout(entry.timer);
			if (message.error != null) {
				entry.reject(new AgentRegexFilterUnavailableError(message.error));
			} else if (Array.isArray(message.results)) {
				entry.resolve(message.results);
			} else {
				entry.reject(new AgentRegexFilterUnavailableError('worker returned a malformed response'));
			}
		});
		worker.on('error', (error) => {
			if (this.worker !== worker) return;
			this.failAllPending(new AgentRegexFilterUnavailableError(error instanceof Error ? error.message : String(error)));
			this.destroyWorker();
		});
		worker.on('exit', () => {
			if (this.worker !== worker) return;
			this.failAllPending(new AgentRegexFilterUnavailableError('worker exited unexpectedly'));
			this.destroyWorker();
		});
		this.worker = worker;
		return worker;
	}

	private failAllPending(error: Error): void {
		for (const [requestId, entry] of this.pending) {
			clearTimeout(entry.timer);
			entry.reject(error);
			this.pending.delete(requestId);
		}
	}

	private destroyWorker(): void {
		const worker = this.worker;
		this.worker = null;
		if (worker != null) {
			void worker.terminate().catch(() => {});
		}
	}
}
