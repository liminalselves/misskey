/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getVisualViewportBottomInset } from '@/utility/visual-viewport-bottom-inset.js';

const BOTTOM_INSET_NOISE_THRESHOLD = 4;

export function useVisualViewportBottomInset() {
	const bottomInset = ref(0);
	let layoutViewportHeight = 0;
	let lastViewportWidth = 0;
	let rafId = 0;

	function updateBottomInset() {
		if (typeof window === 'undefined') return;

		const viewport = window.visualViewport;
		if (viewport == null) {
			bottomInset.value = 0;
			return;
		}

		const visibleViewportBottom = viewport.height + viewport.offsetTop;
		const viewportWidth = viewport.width;

		if (layoutViewportHeight === 0 || Math.abs(viewportWidth - lastViewportWidth) > 1) {
			layoutViewportHeight = Math.max(window.innerHeight, visibleViewportBottom);
		} else {
			layoutViewportHeight = Math.max(layoutViewportHeight, window.innerHeight, visibleViewportBottom);
		}

		lastViewportWidth = viewportWidth;

		const nextInset = getVisualViewportBottomInset({
			layoutViewportHeight,
			visibleViewportHeight: viewport.height,
			visibleViewportOffsetTop: viewport.offsetTop,
		});

		bottomInset.value = nextInset <= BOTTOM_INSET_NOISE_THRESHOLD ? 0 : nextInset;
	}

	function scheduleUpdateBottomInset() {
		if (rafId !== 0) {
			cancelAnimationFrame(rafId);
		}

		rafId = requestAnimationFrame(() => {
			rafId = 0;
			updateBottomInset();
		});
	}

	onMounted(() => {
		scheduleUpdateBottomInset();

		const viewport = window.visualViewport;
		viewport?.addEventListener('resize', scheduleUpdateBottomInset);
		viewport?.addEventListener('scroll', scheduleUpdateBottomInset);
		window.addEventListener('resize', scheduleUpdateBottomInset);
		window.addEventListener('orientationchange', scheduleUpdateBottomInset);
	});

	onBeforeUnmount(() => {
		if (rafId !== 0) {
			cancelAnimationFrame(rafId);
			rafId = 0;
		}

		const viewport = window.visualViewport;
		viewport?.removeEventListener('resize', scheduleUpdateBottomInset);
		viewport?.removeEventListener('scroll', scheduleUpdateBottomInset);
		window.removeEventListener('resize', scheduleUpdateBottomInset);
		window.removeEventListener('orientationchange', scheduleUpdateBottomInset);
	});

	return {
		bottomInset,
		bottomInsetPx: computed(() => `${Math.round(bottomInset.value)}px`),
	};
}
