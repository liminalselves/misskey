<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkResult v-if="total === 0" type="empty" :text="emptyText ?? '暂无数据'"/>
	<div v-show="total > 0" :class="$style.body">
		<div :class="$style.chartBox"><canvas ref="canvasEl"></canvas></div>
		<div :class="$style.legend">
			<div v-for="s in visible" :key="s.key" :class="$style.row">
				<span :class="$style.dot" :style="{ background: s.color }"></span>
				<span :class="$style.label">{{ s.label }}</span>
				<span :class="$style.pct">{{ fmtPct(share(s.value, total)) }}</span>
				<span :class="$style.val">{{ format(s.value) }}</span>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { Chart } from 'chart.js';
import { fmtPct, share } from './report-utils.js';
import { cssColor } from './chart-theme.js';
import type { Plugin } from 'chart.js';
import { initChart } from '@/utility/init-chart.js';

initChart();

export type DoughnutSegment = { key: string; label: string; value: number; color: string };

const props = defineProps<{
	segments: DoughnutSegment[];
	format: (v: number) => string;
	centerLabel: string;
	emptyText?: string;
}>();

const canvasEl = useTemplateRef('canvasEl');
let chart: Chart<'doughnut'> | null = null;

const visible = computed(() => props.segments.filter(s => s.value > 0));
const total = computed(() => visible.value.reduce((s, x) => s + x.value, 0));

// Read through closures so the plugin always draws the current total.
const centerText: Plugin<'doughnut'> = {
	id: 'reportDoughnutCenter',
	afterDraw(c) {
		const first = c.getDatasetMeta(0).data[0] as { x: number; y: number } | undefined;
		if (first == null) return;
		const ctx = c.ctx;
		ctx.save();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = cssColor('--MI_THEME-fg', '#5f6c7b');
		ctx.font = '700 15px sans-serif';
		ctx.fillText(props.format(total.value), first.x, first.y - 6);
		ctx.globalAlpha = 0.56;
		ctx.font = '11px sans-serif';
		ctx.fillText(props.centerLabel, first.x, first.y + 11);
		ctx.restore();
	},
};

function render() {
	if (canvasEl.value == null) return;
	if (chart != null && !chart.canvas.isConnected) {
		chart.destroy();
		chart = null;
	}
	const labels = visible.value.map(s => s.label);
	const data = visible.value.map(s => s.value);
	const colors = visible.value.map(s => s.color);
	if (chart == null) {
		chart = new Chart(canvasEl.value, {
			type: 'doughnut',
			data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
			options: {
				maintainAspectRatio: false,
				cutout: '64%',
				plugins: {
					legend: { display: false },
					tooltip: {
						callbacks: {
							label: (ctx) => ` ${ctx.label}: ${props.format(Number(ctx.parsed))}（${fmtPct(share(Number(ctx.parsed), total.value))}）`,
						},
					},
				},
			},
			plugins: [centerText],
		});
	} else {
		chart.data.labels = labels;
		chart.data.datasets[0].data = data;
		chart.data.datasets[0].backgroundColor = colors;
		chart.update();
	}
}

watch(() => props.segments, () => {
	void nextTick(render);
}, { deep: true });

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
	container-type: inline-size;
	min-width: 0;
}

.body {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 12px;
}

.chartBox {
	position: relative;
	box-sizing: border-box;
	width: 100%;
	max-width: 170px;
	aspect-ratio: 1;
	margin: 0 auto;
}

.legend {
	display: grid;
	grid-template-columns: 10px minmax(0, 1fr) auto auto;
	gap: 6px 10px;
	align-items: center;
	min-width: 0;
	font-size: 0.82em;
	font-variant-numeric: tabular-nums;
}

/* Wide enough: chart on the left, legend beside it (phones, two-column desktop). */
@container (min-width: 300px) {
	.body {
		flex-direction: row;
		align-items: center;
	}

	.chartBox {
		flex-shrink: 0;
		width: 130px;
		margin: 0;
	}

	.legend {
		flex: 1;
	}
}

.row {
	display: contents;
}

.dot {
	width: 10px;
	height: 10px;
	border-radius: 3px;
}

.label {
	min-width: 0;
	overflow-wrap: anywhere;
	font-weight: 600;
}

.pct {
	text-align: right;
	white-space: nowrap;
}

.val {
	text-align: right;
	white-space: nowrap;
	opacity: 0.6;
}
</style>
