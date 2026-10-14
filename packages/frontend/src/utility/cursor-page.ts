/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * limit/untilId 页面游标列表（裸数组 + (updatedAt,id) 复合游标）的通用页合并。
 * 约定：请求方按 limit = pageSize + 1 探测下一页是否存在。
 */

export type CursorPageMerge<T> = { items: T[]; hasMore: boolean };

/** 首页：截掉探测行，hasMore 由探测行决定 */
export function takeCursorFirstPage<T extends { id: string }>(rows: T[], pageSize: number): CursorPageMerge<T> {
	return {
		items: rows.slice(0, pageSize),
		hasMore: rows.length > pageSize,
	};
}

/** 追加页：按 id 去重追加。整页重复（后端忽略 untilId 或排序不稳定）意味着游标未推进，停止翻页防循环 */
export function appendCursorPage<T extends { id: string }>(existing: T[], rows: T[], pageSize: number): CursorPageMerge<T> {
	const existingIds = new Set(existing.map(item => item.id));
	const pageRows = rows.slice(0, pageSize).filter(item => {
		if (existingIds.has(item.id)) return false;
		existingIds.add(item.id);
		return true;
	});
	return {
		items: [...existing, ...pageRows],
		hasMore: rows.length > pageSize && pageRows.length > 0,
	};
}

/** 顶部刷新（实时事件）：重拉首页并与已加载深页按 id 合并——新条目置顶、旧条目保留，不整页重置 */
export function mergeCursorTopPage<T extends { id: string }>(existing: T[], rows: T[], pageSize: number, hasMore: boolean): CursorPageMerge<T> {
	const top = rows.slice(0, pageSize);
	const topIds = new Set(top.map(item => item.id));
	return {
		items: [...top, ...existing.filter(item => !topIds.has(item.id))],
		hasMore: hasMore || rows.length > pageSize,
	};
}
