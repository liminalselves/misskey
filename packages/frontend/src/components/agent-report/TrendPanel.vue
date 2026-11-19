<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<ReportPanel title="趋势" icon="ti ti-chart-bar" :caption="caption" :loading="loading" :error="error" :hasData="data != null" @retry="emit('retry')">
	<template #actions>
		<div v-if="metrics.length > 1" :class="[$style.seg, $style.scrollRow]" role="group" aria-label="指标">
			<button v-for="mk in metrics" :key="mk.key" type="button" class="_button" :class="[$style.segBtn, metric === mk.key ? $style.segBtnOn : null]" @click="emit('update:metric', mk.key)">{{ mk.label }}</button>
		</div>
		<div v-if="showBreakdown" :class="[$style.seg, $style.scrollRow]" role="group" aria-label="分组">
			<button v-for="bd in BREAKDOWNS" :key="bd.key" type="button" class="_button" :class="[$style.segBtn, breakdown === bd.key ? $style.segBtnOn : null]" @click="emit('update:breakdown', bd.key)">{{ bd.label }}</button>
		</div>
	</template>
	<TrendChart
		v-if="data != null"
		:buckets="data.buckets"
		:bucket="data.bucket"
		:groups="data.groups"
		:previous="data.previous"
		:breakdown="loadedBreakdown"
		:metric="metric"
		:modelName="modelName"
	/>
</ReportPanel>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import ReportPanel from './ReportPanel.vue';
import TrendChart from './TrendChart.vue';
import { BREAKDOWNS } from './use-report-filters.js';
import type { Breakdown, BucketUnit, MetricKey, ReportMetrics } from './report-utils.js';

export type TrendData = {
	buckets: string[];
	bucket: BucketUnit;
	groups: { key: string; total: number; points: ReportMetrics[] }[];
	previous: ReportMetrics[] | null;
};

/** Trend chart with its metric / grouping switches; shared by all three reports. */
const props = defineProps<{
	data: TrendData | null;
	loading: boolean;
	error: boolean;
	metrics: { key: MetricKey; label: string }[];
	metric: MetricKey;
	/** Grouping the displayed data was loaded with (the chart must not relabel old data). */
	loadedBreakdown: Breakdown;
	/** Selected grouping, only used when `showBreakdown`. */
	breakdown: Breakdown;
	showBreakdown: boolean;
	compare: boolean;
	modelName: (id: string) => string;
}>();

const emit = defineEmits<{
	(ev: 'update:metric', v: MetricKey): void;
	(ev: 'update:breakdown', v: Breakdown): void;
	(ev: 'retry'): void;
}>();

const caption = computed(() => {
	const bd = BREAKDOWNS.find(b => b.key === props.loadedBreakdown)?.label ?? '';
	return `${props.metrics.find(m => m.key === props.metric)?.label ?? ''}${props.loadedBreakdown !== 'none' ? ` · 按${bd}` : ''}${props.compare ? ' · 虚线为上一周期' : ''}`;
});
</script>

<style lang="scss" module>
.seg {
	display: inline-flex;
	padding: 2px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 7%, transparent);
}

.scrollRow {
	min-width: 0;
	max-width: 100%;
	flex-wrap: nowrap;
	overflow-x: auto;
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}

	> * {
		flex-shrink: 0;
	}
}

.segBtn {
	padding: 4px 10px;
	border-radius: 6px;
	font-size: 0.82em;
	white-space: nowrap;
	opacity: 0.72;

	&:hover {
		opacity: 1;
	}

	@media (pointer: coarse) {
		padding: 6px 12px;
	}
}

.segBtnOn {
	background: var(--MI_THEME-panel);
	opacity: 1;
	font-weight: 600;
	color: var(--MI_THEME-accent);
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
</style>
