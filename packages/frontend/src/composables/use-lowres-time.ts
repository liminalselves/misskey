/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref, readonly, computed } from 'vue';

const time = ref(Date.now());

export const TIME_UPDATE_INTERVAL = 10000; // 10秒

/**
 * 精度が求められないが定期的に更新しないといけない時計で使用（10秒に一度更新）。
 * tickを各コンポーネントで行うのではなく、ここで一括して行うことでパフォーマンスを改善する。
 *
 * ※ マウント前の時刻を返す可能性があるため、通常は`useLowresTime`を使用する
*/
export const lowresTime = readonly(time);

/**
 * 精度が求められないが定期的に更新しないといけない時計で使用（10秒に一度更新）。
 * tickを各コンポーネントで行うのではなく、ここで一括して行うことでパフォーマンスを改善する。
 *
 * 必ず現在時刻以降を返すことを保証するコンポーサブル
 */
export function useLowresTime() {
	// lowresTime自体はマウント前の時刻を返す可能性があるため、必ず現在時刻以降を返すことを保証する
	const now = Date.now();
	return computed(() => Math.max(time.value, now));
}

window.setInterval(() => {
	time.value = Date.now();
}, TIME_UPDATE_INTERVAL);

// 后台时 setInterval 会被浏览器降频（极端情况对齐到分钟级唤醒），恢复前台时立即补一跳，
// 否则相对时间最长要等一个降频周期才刷新
window.document.addEventListener('visibilitychange', () => {
	if (!window.document.hidden) {
		time.value = Date.now();
	}
});
