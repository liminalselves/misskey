/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference lib="esnext" />
/// <reference lib="webworker" />

type WorkerRequest = {
	requestId: number;
	rules: Array<{ pattern: string; targets: string[]; effects: string[] }>;
	effect: string;
	items: Array<{ role: string; text: string }>;
};

type WorkerResponse = {
	requestId: number;
	results?: string[];
	error?: string;
};

// Full JavaScript regex semantics ('gu' flags, lookbehind, backreferences); invalid
// legacy rules stay ignored, matching the server-side worker behavior.
onmessage = (event: MessageEvent<WorkerRequest>) => {
	const req = event.data;
	if (req == null || typeof req.requestId !== 'number') return;
	try {
		// Compile the rule set once per batch (invalid compiles ignored once);
		// String.replace resets lastIndex on global regexes, so compiled instances
		// are reused across items with identical /gu semantics.
		const compiled: Array<{ regex: RegExp; targets: string[] }> = [];
		for (const rule of req.rules) {
			if (!rule.effects.includes(req.effect)) continue;
			try {
				compiled.push({ regex: new RegExp(rule.pattern, 'gu'), targets: rule.targets });
			} catch {
				// Invalid legacy rules are ignored.
			}
		}
		const results: string[] = [];
		for (const item of req.items) {
			let text = item.text;
			for (const entry of compiled) {
				if (!entry.targets.includes(item.role)) continue;
				text = text.replace(entry.regex, '');
			}
			results.push(text);
		}
		const response: WorkerResponse = { requestId: req.requestId, results };
		postMessage(response);
	} catch (err) {
		const response: WorkerResponse = { requestId: req.requestId, error: String(err) };
		postMessage(response);
	}
};
