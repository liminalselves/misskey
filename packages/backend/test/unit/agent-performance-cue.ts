/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	buildPerformanceSystemBlock,
	enforcePerformanceCues,
	normalizePerformanceCapabilities,
	performanceAllowedNames,
	stripPerformanceCues,
} from '@/core/agent-performance-cue.js';

describe('agent-performance-cue', () => {
	const caps = normalizePerformanceCapabilities({
		expressions: [{ name: 'happy', hint: '开心' }, { name: 'shy', hint: '害羞' }],
		actions: [{ name: 'wave', hint: '挥手' }],
	})!;

	describe('normalizePerformanceCapabilities', () => {
		test('returns null for missing / non-object / empty lists', () => {
			expect(normalizePerformanceCapabilities(undefined)).toBeNull();
			expect(normalizePerformanceCapabilities(null)).toBeNull();
			expect(normalizePerformanceCapabilities('happy')).toBeNull();
			expect(normalizePerformanceCapabilities({ expressions: [], actions: [] })).toBeNull();
			expect(normalizePerformanceCapabilities({ expressions: [{ name: '' }], actions: [] })).toBeNull();
		});

		test('lowercases, dedupes and trims hints', () => {
			const normalized = normalizePerformanceCapabilities({
				expressions: [{ name: ' Happy ', hint: '  开心  ' }, { name: 'happy', hint: '重复' }, { name: 'shy' }],
				actions: [{ name: 'WAVE', hint: '挥手' }],
			})!;
			expect(normalized.expressions).toEqual([
				{ name: 'happy', hint: '开心' },
				{ name: 'shy', hint: '' },
			]);
			expect(normalized.actions).toEqual([{ name: 'wave', hint: '挥手' }]);
		});
	});

	describe('stripPerformanceCues', () => {
		test('removes own-line cues together with their newline', () => {
			expect(stripPerformanceCues('你好\n[[agent_cue express=happy]]\n再见')).toBe('你好\n再见');
			expect(stripPerformanceCues('你好\r\n[[agent_cue play=wave]]\r\n再见')).toBe('你好\r\n再见');
		});

		test('removes consecutive cue lines without leaving blank lines', () => {
			expect(stripPerformanceCues('a\n[[agent_cue express=happy]]\n[[agent_cue play=wave]]\nb')).toBe('a\nb');
		});

		test('strips inline residues and collapses blank lines', () => {
			expect(stripPerformanceCues('x [[agent_cue express=happy]] y')).toBe('x  y');
			expect(stripPerformanceCues('a\n\n\n[[agent_cue express=shy]]\n\n\nb')).toBe('a\n\nb');
		});

		test('removes malformed variants', () => {
			expect(stripPerformanceCues('[[agent_cue]]\n[[agent_cue foo=bar]]\n[[agent_cue express=Not Valid]]\ntext')).toBe('text');
		});

		test('passes through untouched when no cue present', () => {
			expect(stripPerformanceCues('')).toBe('');
			expect(stripPerformanceCues('普通文本 [[agent_draw size=portrait tag=x]] :30:')).toBe('普通文本 [[agent_draw size=portrait tag=x]] :30:');
		});
	});

	describe('enforcePerformanceCues', () => {
		const allowed = performanceAllowedNames(caps);

		test('null allowed strips everything', () => {
			const text = '你好\n[[agent_cue express=happy play=wave]]\n再见';
			expect(enforcePerformanceCues(text, null)).toBe('你好\n再见');
		});

		test('keeps whitelisted cues and drops unknown names', () => {
			const text = '你好\n[[agent_cue express=happy]]\n[[agent_cue express=fake]]\n[[agent_cue play=wave]]\n[[agent_cue play=nope]]\n再见';
			expect(enforcePerformanceCues(text, allowed)).toBe('你好\n[[agent_cue express=happy]]\n[[agent_cue play=wave]]\n再见');
		});

		test('keeps combined express+play only when both names are whitelisted', () => {
			expect(enforcePerformanceCues('[[agent_cue express=happy play=wave]]', allowed)).toBe('[[agent_cue express=happy play=wave]]');
			expect(enforcePerformanceCues('a [[agent_cue express=happy play=nope]] b', allowed)).toBe('a  b');
		});

		test('drops malformed syntax', () => {
			expect(enforcePerformanceCues('a [[agent_cue]] b', allowed)).toBe('a  b');
			expect(enforcePerformanceCues('a [[agent_cue express]] b', allowed)).toBe('a  b');
		});

		test('passes through untouched when no cue present', () => {
			expect(enforcePerformanceCues('普通文本', allowed)).toBe('普通文本');
		});
	});

	describe('buildPerformanceSystemBlock', () => {
		test('contains syntax, cue-before-line rule, whitelists and example', () => {
			const block = buildPerformanceSystemBlock(caps);
			expect(block.startsWith('<agent_performance_protocol>')).toBe(true);
			expect(block.endsWith('</agent_performance_protocol>')).toBe(true);
			expect(block).toContain('[[agent_cue express=表情名 play=动作名]]');
			expect(block).toContain('回复必须以指令行开头');
			expect(block).toContain('指令行必须先于它所驱动的台词出现');
			expect(block).toContain('同样的表情连续使用时不需重复切换');
			expect(block).toContain('长期保持');
			expect(block).toContain('只播放一次');
			expect(block).toContain('- happy —— 开心');
			expect(block).toContain('- shy —— 害羞');
			expect(block).toContain('- wave —— 挥手');
			// 示例必须示范用户期望的节奏：开场指令→解说句→切下一表情→结尾不重复切换
			expect(block).toContain('示例：\n[[agent_cue express=happy play=wave]]\n你想看表情？好呀，那我一个一个给你变');
			expect(block).toContain('这个是开心的。\n[[agent_cue express=shy]]');
			expect(block).toContain('这个是害羞的。\n[[agent_cue express=angry play=shake]]');
			expect(block).toContain('看完了没有？可要记得，我最想让你记住的是最后一个。');
		});

		test('omits empty sections', () => {
			const block = buildPerformanceSystemBlock({ expressions: [], actions: [{ name: 'wave', hint: '挥手' }] });
			expect(block).not.toContain('<expressions>');
			expect(block).toContain('<actions>');
		});

		test('appends extra prompt inside the block and escapes XML characters', () => {
			const block = buildPerformanceSystemBlock(caps, '你是<windows>&桌宠');
			expect(block).toContain('<pet_custom_instructions>\n你是&lt;windows&gt;&amp;桌宠\n</pet_custom_instructions>');
			expect(block.indexOf('<pet_custom_instructions>')).toBeGreaterThan(block.indexOf('示例：'));
			expect(block.endsWith('</agent_performance_protocol>')).toBe(true);
		});

		test('omits extra prompt section when blank or absent', () => {
			expect(buildPerformanceSystemBlock(caps, '')).not.toContain('<pet_custom_instructions>');
			expect(buildPerformanceSystemBlock(caps, '   \n ')).not.toContain('<pet_custom_instructions>');
			expect(buildPerformanceSystemBlock(caps)).not.toContain('<pet_custom_instructions>');
			expect(buildPerformanceSystemBlock(caps, null)).not.toContain('<pet_custom_instructions>');
		});
	});
});
