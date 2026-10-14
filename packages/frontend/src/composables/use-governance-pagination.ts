/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref } from 'vue';
import type { Ref } from 'vue';

export type GovernancePaginationFetchFn<T> = (untilId: string | null) => Promise<T[]>;

export function useGovernancePagination<T extends { id: string }>(
	fetchFn: GovernancePaginationFetchFn<T>,
	options: { pageSize?: number } = {},
) {
	const pageSize = options.pageSize ?? 30;
	const items: Ref<T[]> = ref([]);
	const loading = ref(false);
	const hasMore = ref(false);
	const error: Ref<Error | null> = ref(null);

	// 世代令牌：每次显式 reset 递增，在途（旧筛选条件下的）响应按世代直接丢弃，不会污染新列表
	let epoch = 0;
	// 在途请求期间又收到显式 reset：不丢弃该请求，待当前请求落地后自动补发
	let queuedReset = false;

	const isEmpty = computed(() => items.value.length === 0 && !loading.value && error.value == null);

	async function load(reset = false): Promise<void> {
		if (loading.value) {
			if (reset) {
				// 立即作废在途响应（旧筛选的结果不再落地），并排队补发一次 reset 加载
				epoch++;
				queuedReset = true;
			}
			return;
		}
		if (!reset && !hasMore.value && items.value.length > 0) return;

		if (reset) {
			epoch++;
			items.value = [];
			hasMore.value = false;
		}

		loading.value = true;
		error.value = null;
		const myEpoch = epoch;
		try {
			const untilId = reset ? null : items.value.at(-1)?.id ?? null;
			if (!reset && untilId == null) {
				hasMore.value = false;
				return;
			}
			const rows = await fetchFn(untilId);
			if (myEpoch !== epoch) return; // 已被后续 reset 作废的旧响应
			const existingIds = new Set(items.value.map(item => item.id));
			const pageRows = rows.slice(0, pageSize).filter(item => {
				if (existingIds.has(item.id)) return false;
				existingIds.add(item.id);
				return true;
			});
			// 整页与现有条目重复（游标未推进，如后端忽略 untilId）时停止翻页，防止无限循环；
			// pageRows 非空说明游标明确推进（出现了新 id），才允许继续加载
			hasMore.value = rows.length > pageSize && pageRows.length > 0;
			items.value = reset ? pageRows : [...items.value, ...pageRows];
		} catch (err) {
			if (myEpoch !== epoch) return;
			error.value = err as Error;
		} finally {
			loading.value = false;
			if (queuedReset) {
				queuedReset = false;
				void load(true);
			}
		}
	}

	function reset(): void {
		// 显式 reset 同样作废在途响应；排队中的 reset 一并取消（调用方自行决定下一次加载时机）
		epoch++;
		queuedReset = false;
		items.value = [];
		hasMore.value = false;
		error.value = null;
	}

	return {
		items,
		loading,
		hasMore,
		error,
		isEmpty,
		load,
		reset,
	};
}
