/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseForkChangelog } from '../lib/fork-changelog.js';

const sample = `## unreleased

## 2026.10.0-liminalselves.1

[#misskey](https://misskey.liminalselves.top/tags/misskey)

- 合并上游至 2026.10.0，保留本站定制功能。

### 修复
- 修复 A。
- 修复 \`B\` 的问题。

## 2026.10.0

### General
- Enhance: upstream only

## 2025.12.2-liminalselves.2

更新
- 新功能甲

修复
- 修复乙

部署须执行数据库迁移：\`1784900000000-Foo\`。

## 2025.12.2-liminalselves.1

### 智能体功能全面更新上线

- Enhance: 会话改版
  - 子条目一
  - 子条目二
- Fix: 修复丙
- 部署须执行数据库迁移：\`1771470000000-Bar\`
`;

describe('parseForkChangelog', () => {
	const releases = parseForkChangelog(sample);

	test('keeps only fork releases, newest first, skipping upstream and unreleased', () => {
		expect(releases.map(r => r.version)).toEqual(['2026.10.0-liminalselves.1', '2025.12.2-liminalselves.2', '2025.12.2-liminalselves.1']);
		expect(releases[0]).toMatchObject({ baseVersion: '2026.10.0', forkRevision: 1 });
	});

	test('drops hashtag links and collects ungrouped bullets', () => {
		const r = releases[0];
		expect(r.notes).toEqual([]);
		expect(r.groups.map(g => [g.title, g.kind, g.items.length])).toEqual([['更新内容', 'other', 1], ['修复', 'fix', 2]]);
		expect(r.groups[1].items[1].text).toBe('修复 `B` 的问题。');
	});

	test('recognizes plain-text group titles and hides operator-only notes', () => {
		const r = releases[1];
		expect(r.groups.map(g => [g.title, g.kind])).toEqual([['更新', 'feature'], ['修复', 'fix']]);
		expect(r.notes).toEqual([]);
	});

	test('parses Enhance/Fix prefixes and nested children', () => {
		const items = releases[2].groups[0].items;
		expect(items.map(i => [i.kind, i.text])).toEqual([['improve', '会话改版'], ['fix', '修复丙']]);
		expect(items[0].children).toEqual(['子条目一', '子条目二']);
	});

	test('parses the real repository changelog without losing fork releases', () => {
		const markdown = readFileSync(path.resolve(__dirname, '../../../CHANGELOG.md'), 'utf8');
		const real = parseForkChangelog(markdown);
		const headings = [...markdown.matchAll(/^## (\S+-liminalselves\.\d+)$/gm)].map(m => m[1]);
		expect(real.map(r => r.version)).toEqual(headings);
		for (const r of real) {
			expect(r.groups.length).toBeGreaterThan(0);
			for (const g of r.groups) for (const i of g.items) expect(i.text).not.toMatch(/^[-*]\s/);
		}
	});
});
