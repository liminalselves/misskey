<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkResult v-if="isEmpty" type="empty" text="该时间范围内没有数据"/>
	<div v-show="!isEmpty" :class="$style.box"><canvas ref="canvasEl"></canvas></div>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { Chart } from 'chart.js';
import { cssColor, GRID_COLOR, withAlpha } from './chart-theme.js';
import type { ChartDataset } from 'chart.js';
import { initChart } from '@/utility/init-chart.js';

initChart();

export type LineSeries = {
	label: string;
	data: (number | null)[];
	/** Hex color. */
	color: string;
	axis?: 'y' | 'y1';
	dashed?: boolean;
	fill?: boolean;
};

const props = defineProps<{
	labels: string[];
	/** Tooltip title per point. */
	titles: string[];
	series: LineSeries[];
	stacked?: boolean;
	yFormat: (v: number) => string;
	y1Format?: (v: number) => string;
	yMax?: number;
}>();

const canvasEl = useTemplateRef('canvasEl');
let chart: Chart | null = null;

const isEmpty = computed(() => props.series.every(s => s.data.every(v => v == null || v === 0)));

function render() {
	if (canvasEl.value == null) return;
	if (chart != null && !chart.canvas.isConnected) {
		chart.destroy();
		chart = null;
	}
	const fg = cssColor('--MI_THEME-fg', '#5f6c7b');
	const hasY1 = props.series.some(s => s.axis === 'y1');
	const narrow = canvasEl.value.clientWidth < 420;
	const datasets: ChartDataset<'line', (number | null)[]>[] = props.series.map((s, i) => ({
		type: 'line',
		label: s.label,
		data: s.data,
		yAxisID: s.axis ?? 'y',
		borderColor: s.color,
		backgroundColor: s.fill === true ? withAlpha(s.color, 0.28) : s.color,
		borderWidth: 2,
		borderDash: s.dashed === true ? [5, 4] : undefined,
		pointRadius: 0,
		pointHoverRadius: 4,
		tension: 0.25,
		spanGaps: true,
		fill: s.fill === true ? (props.stacked === true && i > 0 ? '-1' : 'origin') : false,
	}));
	const options = {
		maintainAspectRatio: false,
		interaction: { mode: 'index' as const, intersect: false },
		scales: {
			x: { grid: { display: false }, ticks: { color: fg, maxTicksLimit: narrow ? 5 : 8, maxRotation: 0, autoSkip: true } },
			y: {
				stacked: props.stacked === true,
				beginAtZero: true,
				max: props.yMax,
				grid: { color: GRID_COLOR },
				ticks: { color: fg, maxTicksLimit: 6, callback: (v: string | number) => props.yFormat(Number(v)) },
			},
			...(hasY1 ? {
				y1: {
					position: 'right' as const,
					beginAtZero: true,
					grid: { drawOnChartArea: false },
					ticks: { color: fg, maxTicksLimit: 6, callback: (v: string | number) => (props.y1Format ?? props.yFormat)(Number(v)) },
				},
			} : {}),
		},
		plugins: {
			legend: { position: 'bottom' as const, labels: { color: fg, boxWidth: 10, usePointStyle: true } },
			tooltip: {
				callbacks: {
					title: (items: { dataIndex: number }[]) => (items.length > 0 ? props.titles[items[0].dataIndex] ?? '' : ''),
					label: (ctx: { datasetIndex: number; dataset: { label?: string }; parsed: { y: number | null } }) => {
						const s = props.series[ctx.datasetIndex] as LineSeries | undefined;
						const fmt = s?.axis === 'y1' ? (props.y1Format ?? props.yFormat) : props.yFormat;
						return ` ${ctx.dataset.label}: ${ctx.parsed.y == null ? '—' : fmt(ctx.parsed.y)}`;
					},
				},
			},
		},
	};
	if (chart == null) {
		chart = new Chart(canvasEl.value, { type: 'line', data: { labels: props.labels, datasets }, options });
	} else {
		chart.data.labels = props.labels;
		chart.data.datasets = datasets;
		chart.options = options;
		chart.update();
	}
}

watch(() => [props.labels, props.series, props.stacked, props.yMax], () => {
	void nextTick(render);
});

onMounted(() => {
	void nextTick(render);
});

onBeforeUnmount(() => {
	chart?.destroy();
	chart = null;
});
</script>

<style lang="scss" module>
.root {
	min-width: 0;
}

.box {
	position: relative;
	width: 100%;
	height: 240px;

	@container (max-width: 560px) {
		height: 200px;
	}
}
</style>
