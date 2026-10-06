/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { throttle } from 'throttle-debounce';
import type { Directive } from 'vue';
import type { Awaitable } from '@/types/misc.js';

type AppearCallback = (() => Awaitable<void>) | null | undefined;

interface HTMLElementWithObserver extends HTMLElement {
	_observer_?: IntersectionObserver;
	_appearCallback_?: AppearCallback;
	_appearCheck_?: { cancel(): void };
}

function updateObserver(src: HTMLElementWithObserver, callback: AppearCallback) {
	src._appearCallback_ = callback;
	if (callback == null) {
		src._observer_?.disconnect();
		src._appearCheck_?.cancel();
		delete src._observer_;
		delete src._appearCheck_;
		return;
	}
	if (src._observer_) return;

	const check = throttle<IntersectionObserverCallback>(500, (entries) => {
		if (src.isConnected && entries.some(entry => entry.isIntersecting)) {
			src._appearCallback_?.();
		}
	});
	const observer = new IntersectionObserver(check);
	src._observer_ = observer;
	src._appearCheck_ = check;
	observer.observe(src);
}

export const appearDirective = {
	mounted(src, binding) {
		updateObserver(src, binding.value);
	},

	updated(src, binding) {
		updateObserver(src, binding.value);
	},

	unmounted(src) {
		updateObserver(src, null);
	},
} as Directive<HTMLElementWithObserver, AppearCallback>;
