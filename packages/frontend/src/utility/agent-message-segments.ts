/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const LIST_RE = /^\s*(?:[-+*]|\d+[.)])\s+/;
const QUOTE_RE = /^\s*>/;
const THEMATIC_BREAK_RE = /^\s{0,3}(?:(?:-{3,})|(?:_{3,})|(?:\*{3,}))\s*$/;
const TABLE_SEPARATOR_RE = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/;
const VOID_HTML_TAGS = new Set([
	'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
	'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/**
 * Split a stored assistant reply into presentation-only bubbles.
 * The database message remains unchanged. Newlines are boundaries except while
 * a Markdown/HTML structure is still open.
 */
export function splitAgentMessageIntoSegments(source: string): string[] {
	const normalized = source.replace(/\r\n?/g, '\n');
	const lines = normalized.split('\n');
	const segments: string[] = [];
	let i = 0;

	const push = (from: number, to: number) => {
		const text = lines.slice(from, to).join('\n').trim();
		if (text !== '') segments.push(text);
	};

	while (i < lines.length) {
		if (lines[i]!.trim() === '') {
			i++;
			continue;
		}

		if (THEMATIC_BREAK_RE.test(lines[i]!)) {
			i++;
			continue;
		}

		const start = i;
		const fence = lines[i]!.match(FENCE_RE)?.[1];
		if (fence) {
			i++;
			while (i < lines.length && !new RegExp(`^\\s*${escapeRegExp(fence[0]!)}{${fence.length},}\\s*$`).test(lines[i]!)) i++;
			if (i < lines.length) i++;
			push(start, i);
			continue;
		}

		if (lines[i]!.includes('[[agent_draw') && !lines[i]!.includes(']]', lines[i]!.indexOf('[[agent_draw'))) {
			i++;
			while (i < lines.length && !lines[i]!.includes(']]')) i++;
			if (i < lines.length) i++;
			push(start, i);
			continue;
		}

		if (i + 1 < lines.length && lines[i]!.includes('|') && TABLE_SEPARATOR_RE.test(lines[i + 1]!)) {
			i += 2;
			while (i < lines.length && lines[i]!.trim() !== '' && lines[i]!.includes('|')) i++;
			push(start, i);
			continue;
		}

		if (LIST_RE.test(lines[i]!)) {
			i++;
			while (i < lines.length) {
				const line = lines[i]!;
				if (LIST_RE.test(line) || /^\s{2,}\S/.test(line)) {
					i++;
					continue;
				}
				break;
			}
			push(start, i);
			continue;
		}

		if (QUOTE_RE.test(lines[i]!)) {
			i++;
			while (i < lines.length && QUOTE_RE.test(lines[i]!)) i++;
			push(start, i);
			continue;
		}

		const htmlStack: string[] = [];
		let sawHtml = false;
		do {
			sawHtml = updateHtmlStack(lines[i]!, htmlStack) || sawHtml;
			i++;
		} while (sawHtml && htmlStack.length > 0 && i < lines.length);
		push(start, i);
	}

	return segments.length > 0 ? segments : (source.trim() === '' ? [] : [source.trim()]);
}

export function agentSegmentDelayMs(segment: string): number {
	const visibleChars = segment.replace(/<[^>]*>|\s+/g, '').length;
	return Math.max(1000, Math.min(3000, 1000 + visibleChars * 20));
}

function updateHtmlStack(line: string, stack: string[]): boolean {
	let sawHtml = false;
	for (const match of line.matchAll(/<!--[\s\S]*?-->|<\/?([A-Za-z][\w:-]*)(?:\s[^<>]*?)?\/?>/g)) {
		if (match[0].startsWith('<!--')) {
			sawHtml = true;
			continue;
		}
		const name = match[1]!.toLowerCase();
		sawHtml = true;
		if (match[0].startsWith('</')) {
			const index = stack.lastIndexOf(name);
			if (index !== -1) stack.splice(index);
		} else if (!match[0].endsWith('/>') && !VOID_HTML_TAGS.has(name)) {
			stack.push(name);
		}
	}
	return sawHtml;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
