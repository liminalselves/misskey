/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref, watch } from 'vue';

export type ReportMode = 'simple' | 'detailed';

/**
 * Per-report display mode ("simple" by default), remembered in localStorage under `storageKey`.
 * Each report passes its own key so the three reports stay independent.
 */
export function useReportMode(storageKey: string) {
	const mode = ref<ReportMode>((() => {
		try {
			return window.localStorage.getItem(storageKey) === 'detailed' ? 'detailed' : 'simple';
		} catch {
			return 'simple';
		}
	})());

	watch(mode, v => {
		try {
			window.localStorage.setItem(storageKey, v);
		} catch { /* storage disabled */ }
	});

	const simple = computed(() => mode.value === 'simple');

	return { mode, simple };
}
