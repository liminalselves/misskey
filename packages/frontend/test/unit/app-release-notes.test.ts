/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import {
	detectClientPlatform,
	formatBytes,
	formatReleaseDate,
	isSafeHttpUrl,
	parseReleaseNotes,
	shortenSha256,
} from '@/utility/app-release-notes.js';

describe('parseReleaseNotes', () => {
	test('parses summary, headings, lists, and inline markdown tokens', () => {
		const md = [
			'<!-- min-version: v1.0.5 -->',
			'首个正式版本，支持 **消息推送** 与 `WebSocket` 连接。',
			'',
			'### 新增',
			'- 支持 [官网](https://example.com) 打开',
			'',
			'### 变更',
			'* 优化图片加载',
			'',
			'### 修复',
			'- 修复闪退问题 (`NullPointerException`)',
		].join('\r\n');

		const parsed = parseReleaseNotes(md);
		expect(parsed.minVersion).toBe('1.0.5');
		expect(parsed.summary).toEqual([
			{
				type: 'paragraph',
				tokens: [
					{ type: 'text', text: '首个正式版本，支持 ' },
					{ type: 'strong', text: '消息推送' },
					{ type: 'text', text: ' 与 ' },
					{ type: 'code', text: 'WebSocket' },
					{ type: 'text', text: ' 连接。' },
				],
			},
		]);
		expect(parsed.sections).toHaveLength(3);
		expect(parsed.sections[0]).toEqual({
			title: '新增',
			kind: 'add',
			blocks: [
				{
					type: 'list',
					items: [[
						{ type: 'text', text: '支持 ' },
						{ type: 'link', text: '官网', href: 'https://example.com' },
						{ type: 'text', text: ' 打开' },
					]],
				},
			],
		});
		expect(parsed.sections[1].kind).toBe('imp');
		expect(parsed.sections[2].kind).toBe('fix');
	});

	test('strips GitHub auto-generated noise lines and unsafe links', () => {
		const md = [
			'## What\'s Changed',
			'- feat: add dark mode by @alice in https://github.com/org/repo/pull/1',
			'',
			'### 修复',
			'- 忽略 [xss](javascript:alert(1)) 链接',
			'',
			'## New Contributors',
			'- @bob made their first contribution in https://github.com/org/repo/pull/2',
			'',
			'**Full Changelog**: https://github.com/org/repo/compare/v1.0.0...v1.1.0',
		].join('\n');

		const parsed = parseReleaseNotes(md);
		expect(parsed.summary).toEqual([]);
		expect(parsed.sections).toHaveLength(1);
		expect(parsed.sections[0].title).toBe('修复');
		expect(parsed.sections[0].blocks).toEqual([
			{
				type: 'list',
				items: [[
					{ type: 'text', text: '忽略 [xss](javascript:alert(1)) 链接' },
				]],
			},
		]);
	});
});

describe('detectClientPlatform', () => {
	test('detects Android, iOS, iPadOS, desktop, and unknown', () => {
		expect(detectClientPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36')).toBe('android');
		expect(detectClientPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)')).toBe('ios');
		expect(detectClientPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
		expect(detectClientPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('desktop');
		expect(detectClientPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
		expect(detectClientPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('desktop');
		expect(detectClientPlatform('Mozilla/5.0 (HarmonyOS; OpenHarmony 4.0)')).toBe('unknown');
		expect(detectClientPlatform('')).toBe('unknown');
	});
});

describe('formatters & validators', () => {
	test('formatBytes formats sizes cleanly', () => {
		expect(formatBytes(null)).toBe('');
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(1536)).toBe('1.5 KB');
		expect(formatBytes(1410991)).toBe('1.35 MB');
		expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
	});

	test('formatReleaseDate formats ISO strings without timezone shift', () => {
		expect(formatReleaseDate('2026-11-22T23:59:59Z')).toBe('2026 年 11 月 22 日');
		expect(formatReleaseDate('2026-01-05')).toBe('2026 年 1 月 5 日');
		expect(formatReleaseDate('')).toBe('');
		expect(formatReleaseDate('not-a-date')).toBe('');
	});

	test('shortenSha256 and isSafeHttpUrl', () => {
		expect(shortenSha256('e3f86c80ed2c217fed23d6545b3c8c17eb4d9d460910afd898d6781581ac7936')).toBe('e3f86c80ed2c…81ac7936');
		expect(shortenSha256('short')).toBe('short');
		expect(isSafeHttpUrl('https://github.com/liminalselves/liminalselves_app/releases/download/v1.1.0/app.apk')).toBe(true);
		expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
		expect(isSafeHttpUrl('')).toBe(false);
	});
});
