/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { appendCursorPage, mergeCursorTopPage, takeCursorFirstPage } from '@/utility/cursor-page.js';

const rows = (count: number, start = 0, prefix = '') => Array.from({ length: count }, (_, i) => ({
	id: `${prefix}${String(start + i).padStart(4, '0')}`,
}));

describe('cursor page merging (limit/untilId bare-array lists)', () => {
	test('first page strips the probe row and reports hasMore', () => {
		expect(takeCursorFirstPage(rows(31), 30)).toEqual({ items: rows(30), hasMore: true });
		expect(takeCursorFirstPage(rows(30), 30)).toEqual({ items: rows(30), hasMore: false });
	});

	test('append dedupes by id so overlapping or reordered pages stay stable', () => {
		const existing = rows(2);
		// 返回页含 1 条重叠（0001）+ 2 条新行，pageSize=2 只取前 2 条（0001 去重、0002 追加）
		const merged = appendCursorPage(existing, [...rows(1, 1), ...rows(2, 2)], 2);
		expect(merged.items.map(item => item.id)).toEqual(['0000', '0001', '0002']);
		expect(merged.hasMore).toBe(true);
	});

	// 后端暂不支持 untilId（或排序不稳定）时整页重复：游标未推进必须停止翻页，防止无限加载
	test('a fully duplicate page stops further paging', () => {
		const existing = rows(30);
		const merged = appendCursorPage(existing, rows(31), 30);
		expect(merged.items).toHaveLength(30);
		expect(merged.hasMore).toBe(false);
	});

	test('top refresh prepends new rows, refreshes overlapped rows, and keeps deeper pages', () => {
		const loaded = [...rows(2, 5), ...rows(2, 0)]; // 深页 5,6 + 首页 0,1（倒序状态）
		const merged = mergeCursorTopPage(loaded, [...rows(1, 7), ...rows(2, 0)], 3, true);
		expect(merged.items.map(item => item.id)).toEqual(['0007', '0000', '0001', '0005', '0006']);
		expect(merged.hasMore).toBe(true);
		expect(mergeCursorTopPage(loaded, rows(3), 3, false).hasMore).toBe(false);
	});
});
