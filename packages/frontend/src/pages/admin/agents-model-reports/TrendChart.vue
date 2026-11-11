<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkResult v-if="isEmpty" type="empty" text="该时间范围内没有调用记录"/>
	<div v-show="!isEmpty" :class="$style.box"><canvas ref="canvasEl"></canvas></div>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { Chart } from 'chart.js';
import {
	allSameBeijingDay, bucketLabel, bucketTitle, fmtMetric, isAdditiveMetric, metricValue,
	BILLING_LABELS, OTHER_KEY, STATUS_LABELS, USAGE_KIND_LABELS,
} from './report-utils.js';
import type { Breakdown, BucketUnit, MetricKey, ReportMetrics } from './report-utils.js';
import type { ChartDataset } from 'chart.js';
import { initChart } from '@/utility/init-chart.js';

initChart();

const props = defineProps<{
	buckets: string[];
	bucket: BucketUnit;
	groups: { key: string; total: number; points: ReportMetrics[] }[];
	previous: ReportMetrics[] | null;
	breakdown: Breakdown;
	metric: MetricKey;
	modelName: (id: string) => string;
}>();

const canvasEl = useTemplateRef('canvasEl');
let chart: Chart | null = null;

const isEmpty = computed(() => props.groups.every(g => g.total === 0) && (props.previous == null || props.previous.every(m => m.total === 0)));

const PALETTE = ['#4e9af1', '#86b300', '#f2a03d', '#b085cc', '#4db6ac', '#ec6b56', '#e2c044', '#7f8fa6', '#d97ab8', '#9fb3c8'];
const FIXED_COLORS: Record<string, string> = {
	success: '#4caf50', failed: '#ec4137', aborted: '#ecb637', pending: '#9fb3c8',
	paid: '#f2a03d', free: '#4caf50', zeroPriced: '#4db6ac', byok: '#64b5f6', unassigned: '#b085cc',
	[OTHER_KEY]: '#9fb3c8',
};

function groupLabel(key: string): string {
	if (key === 'all') return metricTitle(props.metric);
	if (key === OTHER_KEY) return '其他';
	switch (props.breakdown) {
		case 'status': return STATUS_LABELS[key] ?? key;
		case 'billing': return key === 'failed' ? '失败' : (BILLING_LABELS[key] ?? key);
		case 'usageKind': return USAGE_KIND_LABELS[key] ?? key;
		case 'model': return props.modelName(key);
		default: return key;
	}
}

function metricTitle(key: MetricKey): string {
	const titles: Record<MetricKey, string> = { total: '请求数', successRate: '成功率', credits: '扣费额度', users: '活跃用户', tokens: 'Token', latency: '耗时 P50' };
	return titles[key];
}

function cssColor(name: string, fallback: string): string {
	return getComputedStyle(window.document.documentElement).getPropertyValue(name).trim() || fallback;
}

function render() {
	if (canvasEl.value == null) return;
	if (chart != null && !chart.canvas.isConnected) {
		chart.destroy();
		chart = null;
	}
	const fg = cssColor('--MI_THEME-fg', '#5f6c7b');
	const accent = cssColor('--MI_THEME-accent', '#86b300');
	const grid = 'rgba(128, 128, 128, 0.15)';
	const additive = isAdditiveMetric(props.metric);
	// Status / billing groups only make sense for counts; other metrics are per group lines.
	const stacked = additive && props.breakdown !== 'none';
	const sameDay = props.bucket === 'hour' && allSameBeijingDay(props.buckets);
	const labels = props.buckets.map(b => bucketLabel(b, props.bucket, sameDay));

	const datasets: ChartDataset<'bar' | 'line', (number | null)[]>[] = props.groups.map((g, i) => {
		const color = props.breakdown === 'none' ? accent : (FIXED_COLORS[g.key] ?? PALETTE[i % PALETTE.length]);
		const data = g.points.map(m => metricValue(m, props.metric));
		return additive
			? { type: 'bar', label: groupLabel(g.key), data, backgroundColor: color, stack: 'main', borderRadius: stacked ? 0 : 3, maxBarThickness: 36 }
			: { type: 'line', label: groupLabel(g.key), data, borderColor: color, backgroundColor: color, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2, tension: 0.25, spanGaps: true };
	});
	if (props.previous != null) {
		datasets.push({
			type: 'line',
			label: '上一周期',
			data: props.previous.map(m => metricValue(m, props.metric)),
			borderColor: fg,
			backgroundColor: fg,
			borderDash: [5, 4],
			borderWidth: 1.5,
			pointRadius: 0,
			pointHoverRadius: 3,
			tension: 0.25,
			spanGaps: true,
			order: -1,
		});
	}

	const yMax = props.metric === 'successRate' ? 100 : undefined;
	const options = {
		maintainAspectRatio: false,
		interaction: { mode: 'index' as const, intersect: false },
		scales: {
			x: { stacked, grid: { display: false }, ticks: { color: fg, maxTicksLimit: 12, maxRotation: 0, autoSkip: true } },
			y: {
				stacked,
				beginAtZero: true,
				max: yMax,
				grid: { color: grid },
				ticks: { color: fg, callback: (v: string | number) => fmtMetric(props.metric, Number(v)) },
			},
		},
		plugins: {
			legend: { display: datasets.length > 1, position: 'bottom' as const, labels: { color: fg, boxWidth: 10, usePointStyle: true } },
			tooltip: {
				callbacks: {
					title: (items: { dataIndex: number }[]) => (items.length > 0 ? bucketTitle(props.buckets[items[0].dataIndex], props.bucket) : ''),
					label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => ` ${ctx.dataset.label}: ${fmtMetric(props.metric, ctx.parsed.y)}`,
				},
			},
		},
	};

	if (chart == null) {
		chart = new Chart(canvasEl.value, { type: 'bar', data: { labels, datasets }, options });
	} else {
		chart.data.labels = labels;
		chart.data.datasets = datasets;
		chart.options = options;
		chart.update();
	}
}

watch(() => [props.groups, props.previous, props.metric, props.breakdown, props.buckets], () => {
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
	height: 320px;

	@container (max-width: 560px) {
		height: 240px;
	}
}
</style>
