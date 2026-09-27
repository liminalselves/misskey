/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	Chart,
	ArcElement,
	LineElement,
	BarElement,
	PointElement,
	BarController,
	LineController,
	DoughnutController,
	CategoryScale,
	LinearScale,
	TimeScale,
	Legend,
	Title,
	Tooltip,
	SubTitle,
	Filler,
} from 'chart.js';
import type { Plugin } from 'chart.js';
import gradient from 'chartjs-plugin-gradient';
import zoomPlugin from 'chartjs-plugin-zoom';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { store } from '@/store.js';
import 'chartjs-adapter-date-fns';

const visibilityObservers = new WeakMap<Chart, IntersectionObserver>();

// 部分 WebView 会漏掉隐藏容器重新显示时的 ResizeObserver 通知，进入视口后主动校尺寸并补绘。
const visibilityResizePlugin: Plugin = {
	id: 'visibilityResize',
	afterInit(chart) {
		if (typeof IntersectionObserver === 'undefined') return;

		const observer = new IntersectionObserver((entries) => {
			if (!entries.some(entry => entry.isIntersecting)) return;
			requestAnimationFrame(() => {
				if (!chart.canvas.isConnected) return;
				chart.resize();
				chart.update('none');
			});
		});
		observer.observe(chart.canvas);
		visibilityObservers.set(chart, observer);
	},
	afterDestroy(chart) {
		visibilityObservers.get(chart)?.disconnect();
		visibilityObservers.delete(chart);
	},
};

export function initChart() {
	Chart.register(
		ArcElement,
		LineElement,
		BarElement,
		PointElement,
		BarController,
		LineController,
		DoughnutController,
		CategoryScale,
		LinearScale,
		TimeScale,
		Legend,
		Title,
		Tooltip,
		SubTitle,
		Filler,
		MatrixController, MatrixElement,
		zoomPlugin,
		gradient,
		visibilityResizePlugin,
	);

	// フォントカラー
	Chart.defaults.color = getComputedStyle(window.document.documentElement).getPropertyValue('--MI_THEME-fg');

	Chart.defaults.borderColor = store.s.darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

	Chart.defaults.animation = false;
}
