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

	const isEmpty = computed(() => items.value.length === 0 && !loading.value && error.value == null);

	async function load(reset = false): Promise<void> {
		if (loading.value) return;
		if (!reset && !hasMore.value && items.value.length > 0) return;

		loading.value = true;
		error.value = null;

		if (reset) {
			items.value = [];
			hasMore.value = false;
		}

		try {
			const untilId = reset ? null : items.value.at(-1)?.id ?? null;
			if (!reset && untilId == null) {
				hasMore.value = false;
				return;
			}
			const rows = await fetchFn(untilId);
			hasMore.value = rows.length > pageSize;
			const pageRows = rows.slice(0, pageSize);
			items.value = reset ? pageRows : [...items.value, ...pageRows];
		} catch (err) {
			error.value = err as Error;
		} finally {
			loading.value = false;
		}
	}

	function reset(): void {
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
