/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, reactive, watch } from 'vue';
import type { Reactive } from 'vue';
import { deepEqual } from '@/utility/deep-equal';

function copy<T>(v: T): T {
	return JSON.parse(JSON.stringify(v));
}

function unwrapReactive<T>(v: Reactive<T>): T {
	return JSON.parse(JSON.stringify(v));
}

export function useForm<T extends Record<string, any>>(initialState: T, save: (newState: T) => Promise<void>) {
	const currentState = reactive<T>(copy(initialState));
	const previousState = reactive<T>(copy(initialState));

	const modifiedStates = reactive<Record<keyof T, boolean>>((() => {
		const obj: Record<keyof T, boolean> = {} as Record<keyof T, boolean>;
		for (const key in initialState) {
			obj[key] = false;
		}
		return obj;
	})());
	const modified = computed(() => Object.values(modifiedStates).some(v => v));
	const modifiedCount = computed(() => Object.values(modifiedStates).filter(v => v).length);

	watch([currentState, previousState], () => {
		for (const key in modifiedStates) {
			(modifiedStates as any)[key] = !deepEqual(currentState[key], previousState[key]);
		}
	}, { deep: true });

	async function _save() {
		try {
			await save(unwrapReactive(currentState));
			for (const key in currentState) {
				previousState[key] = copy(currentState[key]);
			}
			return true;
		} catch (err) {
			// 校验或网络错误：保持 modified 状态以便重试，具体错误由 save 回调或调用方提示
			console.error('Failed to save form', err);
			return false;
		}
	}

	function discard() {
		for (const key in currentState) {
			currentState[key] = copy(previousState[key]);
		}
	}

	return {
		state: currentState,
		savedState: previousState,
		modifiedStates,
		modified,
		modifiedCount,
		save: _save,
		discard,
	};
}
