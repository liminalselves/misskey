<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.grid">
	<ReportPanel title="成功率与失败" icon="ti ti-heartbeat" caption="成功率（左轴）· 失败/中断次数（右轴）" :loading="loading" :error="error" :hasData="series != null" @retry="emit('retry')">
		<LineChart
			v-if="series != null"
			:labels="labels"
			:titles="titles"
			:series="reliability"
			:yFormat="v => `${Math.round(v)}%`"
			:y1Format="v => fmtInt(v)"
			:yMax="100"
		/>
	</ReportPanel>
	<ReportPanel title="扣费" icon="ti ti-coins" caption="扣费额度（左轴）· 付费/免费次数（右轴）" :loading="loading" :error="error" :hasData="series != null" @retry="emit('retry')">
		<LineChart
			v-if="series != null"
			:labels="labels"
			:titles="titles"
			:series="billing"
			:yFormat="v => fmtCredits(v)"
			:y1Format="v => fmtInt(v)"
		/>
	</ReportPanel>
	<ReportPanel title="Token" icon="ti ti-text-size" caption="输入 / 输出堆叠" :loading="loading" :error="error" :hasData="series != null" @retry="emit('retry')">
		<LineChart
			v-if="series != null"
			:labels="labels"
			:titles="titles"
			:series="tokens"
			:stacked="true"
			:yFormat="v => fmtCompact(v)"
		/>
	</ReportPanel>
	<ReportPanel title="耗时" icon="ti ti-clock-bolt" caption="仅成功调用" :loading="loading" :error="error" :hasData="series != null" @retry="emit('retry')">
		<LineChart
			v-if="series != null"
			:labels="labels"
			:titles="titles"
			:series="latency"
			:yFormat="v => fmtMs(v)"
		/>
	</ReportPanel>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import ReportPanel from './ReportPanel.vue';
import LineChart from './LineChart.vue';
import { allSameBeijingDay, bucketLabel, bucketTitle, fmtCompact, fmtCredits, fmtInt, fmtMs, successRate } from './report-utils.js';
import { FIXED_COLORS } from './chart-theme.js';
import type { LineSeries } from './LineChart.vue';
import type { BucketUnit, ReportMetrics } from './report-utils.js';

const props = defineProps<{
	series: { t: string; m: ReportMetrics }[] | null;
	bucket: BucketUnit;
	loading: boolean;
	error: boolean;
}>();

const emit = defineEmits<{
	(ev: 'retry'): void;
}>();

const points = computed(() => props.series ?? []);
const labels = computed(() => {
	const isos = points.value.map(p => p.t);
	const sameDay = props.bucket === 'hour' && allSameBeijingDay(isos);
	return isos.map(t => bucketLabel(t, props.bucket, sameDay));
});
const titles = computed(() => points.value.map(p => bucketTitle(p.t, props.bucket)));

const reliability = computed<LineSeries[]>(() => [
	{ label: '成功率', data: points.value.map(p => successRate(p.m)), color: FIXED_COLORS.success },
	{ label: '失败', data: points.value.map(p => p.m.failed), color: FIXED_COLORS.failed, axis: 'y1' },
	{ label: '中断', data: points.value.map(p => p.m.aborted), color: FIXED_COLORS.aborted, axis: 'y1', dashed: true },
]);

const billing = computed<LineSeries[]>(() => [
	{ label: '扣费', data: points.value.map(p => p.m.credits), color: FIXED_COLORS.paid, fill: true },
	{ label: '付费次数', data: points.value.map(p => p.m.paidCalls), color: '#4e9af1', axis: 'y1' },
	{ label: '免费次数', data: points.value.map(p => p.m.freeCalls), color: FIXED_COLORS.free, axis: 'y1', dashed: true },
]);

const tokens = computed<LineSeries[]>(() => [
	{ label: '输入', data: points.value.map(p => p.m.promptTokens), color: '#4e9af1', fill: true },
	{ label: '输出', data: points.value.map(p => p.m.completionTokens), color: '#86b300', fill: true },
]);

const latency = computed<LineSeries[]>(() => [
	{ label: 'P50', data: points.value.map(p => p.m.p50Ms), color: '#4e9af1' },
	{ label: 'P95', data: points.value.map(p => p.m.p95Ms), color: '#ec6b56' },
	{ label: '均值', data: points.value.map(p => p.m.avgMs), color: '#9fb3c8', dashed: true },
]);
</script>

<style lang="scss" module>
.grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;

	@container (max-width: 820px) {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
