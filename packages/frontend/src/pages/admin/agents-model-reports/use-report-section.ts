/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref, shallowRef } from 'vue';
import { misskeyApi } from '@/utility/misskey-api.js';

/** Report endpoints are not in the generated misskey-js types; call them untyped. */
export const reportApi = misskeyApi as unknown as <T>(endpoint: string, data: Record<string, unknown>) => Promise<T>;

/**
 * One independently loaded report section. Late responses are dropped by sequence number,
 * and a failed reload keeps the previous data (error flag set, data untouched).
 */
export function useReportSection<T>(fetcher: () => Promise<T>) {
	const data = shallowRef<T | null>(null);
	const loading = ref(false);
	const error = ref(false);
	let seq = 0;

	async function load(): Promise<void> {
		const mine = ++seq;
		loading.value = true;
		try {
			const res = await fetcher();
			if (mine !== seq) return;
			data.value = res;
			error.value = false;
		} catch {
			if (mine !== seq) return;
			error.value = true;
		} finally {
			if (mine === seq) loading.value = false;
		}
	}

	return { data, loading, error, load };
}
