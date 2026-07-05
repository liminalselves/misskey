/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { agentSegmentDelayMs, splitAgentMessageIntoSegments } from './agent-message-segments.js';

describe('splitAgentMessageIntoSegments', () => {
	test('splits ordinary non-empty lines and ignores empty lines', () => {
		expect(splitAgentMessageIntoSegments('第一段\n\n第二段')).toEqual(['第一段', '第二段']);
	});

	test('keeps fenced code, tables, lists, quotes, HTML and draw syntax intact', () => {
		const source = [
			'开头',
			'```ts',
			'const value = 1;',
			'```',
			'| A | B |',
			'| --- | --- |',
			'| 1 | 2 |',
			'- one',
			'  continuation',
			'- two',
			'> quote one',
			'> quote two',
			'<div>',
			'<span>content</span>',
			'</div>',
			'[[agent_draw size=portrait tag=girl,',
			'park]]',
			'结尾',
		].join('\n');
		expect(splitAgentMessageIntoSegments(source)).toEqual([
			'开头',
			'```ts\nconst value = 1;\n```',
			'| A | B |\n| --- | --- |\n| 1 | 2 |',
			'- one\n  continuation\n- two',
			'> quote one\n> quote two',
			'<div>\n<span>content</span>\n</div>',
			'[[agent_draw size=portrait tag=girl,\npark]]',
			'结尾',
		]);
	});

	test('keeps each image placeholder as a segment and does not rewrite invalid syntax', () => {
		expect(splitAgentMessageIntoSegments([
			'[[agent_draw size=portrait tag=first]]',
			'[[gent_draw size=portrait tag=intentionally invalid]]',
			'[[agent_draw size=landscape tag=second]]',
		].join('\n'))).toEqual([
			'[[agent_draw size=portrait tag=first]]',
			'[[gent_draw size=portrait tag=intentionally invalid]]',
			'[[agent_draw size=landscape tag=second]]',
		]);
	});

	test('splits a prose paragraph followed by an image placeholder', () => {
		const text = '嘿嘿，谢谢你呀。看到这些小花开得这么好，我整个人都觉得充满了干劲。\n\n[[agent_draw size=portrait tag=1girl, solo, holding a small yellow flower]]';
		expect(splitAgentMessageIntoSegments(text)).toEqual([
			'嘿嘿，谢谢你呀。看到这些小花开得这么好，我整个人都觉得充满了干劲。',
			'[[agent_draw size=portrait tag=1girl, solo, holding a small yellow flower]]',
		]);
	});
});

describe('splitAgentMessageIntoSegments markdown presentation cleanup', () => {
	test('skips standalone markdown thematic breaks without breaking rich blocks', () => {
		const text = [
			'first paragraph',
			'',
			'---',
			'',
			'### Heading',
			'body line',
			'',
			'* item one',
			'* item two',
			'',
			'> quote',
			'',
			'| A | B |',
			'| :--- | :--- |',
			'| 1 | 2 |',
			'',
			'[[agent_draw size=landscape tag=test]]',
			'',
			'***',
			'last line',
		].join('\n');
		expect(splitAgentMessageIntoSegments(text)).toEqual([
			'first paragraph',
			'### Heading',
			'body line',
			'* item one\n* item two',
			'> quote',
			'| A | B |\n| :--- | :--- |\n| 1 | 2 |',
			'[[agent_draw size=landscape tag=test]]',
			'last line',
		]);
	});
});

describe('agentSegmentDelayMs', () => {
	test('stays between one and three seconds', () => {
		expect(agentSegmentDelayMs('短')).toBeGreaterThanOrEqual(1000);
		expect(agentSegmentDelayMs('x'.repeat(1000))).toBe(3000);
	});
});
