/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { throttle } from 'throttle-debounce';
import { nextTick, onActivated, onDeactivated, onUnmounted, watch } from 'vue';
import type { Ref } from 'vue';

export function useScrollPositionKeeper(scrollContainerRef: Ref<HTMLElement | null | undefined>): void {
	let anchorId: string | null = null;
	let anchorOffset = 0;
	let scrollTop = 0;
	let scrollLeft = 0;
	let ready = true;
	let active = true;
	let wasDeactivated = false;
	let restoreTimer: number | null = null;

	watch(scrollContainerRef, (el, _, onCleanup) => {
		if (!el) return;

		const captureAnchor = throttle(1000, () => {
			if (!ready || !el.isConnected) return;
			anchorId = null;
			if (Math.abs(el.scrollTop) < 100) return;

			const containerRect = el.getBoundingClientRect();
			const viewPosition = containerRect.top + containerRect.height / 2;
			const anchors = el.querySelectorAll<HTMLElement>('[data-scroll-anchor]');
			for (let i = anchors.length - 1; i >= 0; i--) {
				const rect = anchors[i].getBoundingClientRect();
				if (rect.top <= viewPosition && rect.bottom >= viewPosition) {
					anchorId = anchors[i].getAttribute('data-scroll-anchor');
					anchorOffset = rect.top - containerRect.top;
					break;
				}
			}
		});
		const onScroll = () => {
			if (!ready || !el.isConnected) return;
			anchorOffset -= el.scrollTop - scrollTop;
			scrollTop = el.scrollTop;
			scrollLeft = el.scrollLeft;
			if (Math.abs(scrollTop) < 100) anchorId = null;
			captureAnchor();
		};
		el.addEventListener('scroll', onScroll, { passive: true });
		onCleanup(() => {
			el.removeEventListener('scroll', onScroll);
			captureAnchor.cancel();
		});
	}, { immediate: true, flush: 'post' });

	const restore = () => {
		const el = scrollContainerRef.value;
		if (!active || !el?.isConnected) return;
		el.scrollTo({ top: scrollTop, left: scrollLeft, behavior: 'instant' });
		if (anchorId == null) return;
		const anchor = Array.from(el.querySelectorAll<HTMLElement>('[data-scroll-anchor]'))
			.find(candidate => candidate.getAttribute('data-scroll-anchor') === anchorId);
		if (anchor) {
			el.scrollTo({
				top: el.scrollTop + anchor.getBoundingClientRect().top - el.getBoundingClientRect().top - anchorOffset,
				left: scrollLeft,
				behavior: 'instant',
			});
		}
	};

	const stopRestoring = () => {
		active = false;
		wasDeactivated = true;
		ready = false;
		if (restoreTimer != null) window.clearTimeout(restoreTimer);
		restoreTimer = null;
	};
	onDeactivated(stopRestoring);
	onUnmounted(stopRestoring);
	onActivated(() => {
		active = true;
		if (!wasDeactivated) return;
		ready = false;
		restore();
		nextTick(() => {
			if (!active) return;
			restore();
			restoreTimer = window.setTimeout(() => {
				restoreTimer = null;
				restore();
				ready = active;
			}, 100);
		});
	});
}
