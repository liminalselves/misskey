<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<ReportModeSwitch v-model="mode"/>

	<ReportFilterBar :state="filterState" :catalog="catalog" :modelName="modelName" :loading="report.loading.value" :simple="simple" exportable @refresh="reloadAll" @export="exportCsv"/>

	<!-- 概览 -->
	<ReportPanel title="概览" icon="ti ti-layout-dashboard" caption="点击卡片切换下方趋势图指标" :loading="report.loading.value" :error="report.error.value" :hasData="data != null" @retry="report.load">
		<KpiCards
			v-if="data != null"
			:current="data.current"
			:previous="data.previous"
			:series="data.series.map(s => s.m)"
			:active="metric"
			:hide="['users']"
			:only="simple ? SIMPLE_METRIC_KEYS : undefined"
			:balance="data.creditBalance"
			@select="metric = $event"
		/>
	</ReportPanel>

	<slot name="afterOverview"></slot>

	<!-- 趋势 -->
	<TrendPanel
		v-model:metric="metric"
		:breakdown="filters.breakdown"
		:data="trendData"
		:loading="report.loading.value"
		:error="report.error.value"
		:metrics="simple ? SIMPLE_METRICS : USER_METRICS"
		:loadedBreakdown="loadedBreakdown"
		:showBreakdown="!simple"
		:compare="!simple && filters.compare"
		:modelName="modelName"
		@update:breakdown="filters.breakdown = $event"
		@retry="report.load"
	/>

	<!-- 简洁模式：模型排行 -->
	<ReportPanel v-if="simple" title="模型排行" icon="ti ti-podium" caption="按请求数" :loading="report.loading.value" :error="report.error.value" :hasData="data != null" @retry="report.load">
		<SimpleModelList v-if="data != null" :rows="data.models" :catalog="catalogMap"/>
	</ReportPanel>

	<!-- 详细模式 -->
	<template v-else>
		<MetricLineCharts :series="data?.series ?? null" :bucket="data?.bucket ?? filterState.bucketUnit.value" :loading="report.loading.value" :error="report.error.value" @retry="report.load"/>

		<BreakdownPanels
			:data="data"
			:loading="report.loading.value"
			:error="report.error.value"
			:modelRows="data?.models ?? null"
			:modelsLoading="report.loading.value"
			:modelsError="report.error.value"
			:modelName="modelName"
			:selectedModels="filters.modelIds"
			singleUser
			@retry="report.load"
			@retryModels="report.load"
		/>

		<ReportPanel title="模型明细" icon="ti ti-table" caption="耗时只统计成功调用" :loading="report.loading.value" :error="report.error.value" :hasData="data != null" @retry="report.load">
			<ModelTable
				v-if="data != null"
				:rows="data.models"
				:catalog="catalogMap"
				:selected="filters.modelIds"
				:hideColumns="['users']"
				@toggleModel="filterState.toggleModel"
			/>
		</ReportPanel>

		<div :class="$style.pair">
			<ReportPanel title="角色" icon="ti ti-users" caption="按会话角色" :loading="report.loading.value" :error="report.error.value" :hasData="data != null" @retry="report.load">
				<DimensionTable
					v-if="data != null"
					:items="data.characters.items"
					:total="data.characters.total"
					:page="characterPage"
					:pageSize="DIM_PAGE_SIZE"
					:loading="report.loading.value"
					:grandTotal="data.current.total"
					nameLabel="角色"
					emptyText="该范围内没有角色会话"
					@update:page="p => { characterPage = p; void report.load(); }"
				/>
			</ReportPanel>
			<ReportPanel title="文风" icon="ti ti-message-cog" caption="按会话文风" :loading="report.loading.value" :error="report.error.value" :hasData="data != null" @retry="report.load">
				<DimensionTable
					v-if="data != null"
					:items="data.styles.items"
					:total="data.styles.total"
					:page="stylePage"
					:pageSize="DIM_PAGE_SIZE"
					:loading="report.loading.value"
					:grandTotal="data.current.total"
					nameLabel="文风"
					emptyText="该范围内没有使用文风"
					@update:page="p => { stylePage = p; void report.load(); }"
				/>
			</ReportPanel>
		</div>
	</template>

	<!-- 流水不受筛选影响（与时间范围无关的完整明细），两种模式都保留 -->
	<section v-panel :class="$style.logs">
		<UsageLogTables ref="logTables" billingEndpoint="agents/billing-logs" logsEndpoint="agents/usage/logs" :params="{}"/>
	</section>
</div>
</template>

<script lang="ts" setup>
/**
 * "我的用量" (用户侧 → 智能体 → 我的用量). Owns its endpoints, storage keys and layout; shares only the
 * generic building blocks in `components/agent-report/` and the response types in `user-report-shared.ts`.
 */
import { computed, onBeforeUnmount, ref, shallowRef, useTemplateRef, watch } from 'vue';
import ReportFilterBar from '../ReportFilterBar.vue';
import ReportPanel from '../ReportPanel.vue';
import KpiCards from '../KpiCards.vue';
import TrendPanel from '../TrendPanel.vue';
import MetricLineCharts from '../MetricLineCharts.vue';
import BreakdownPanels from '../BreakdownPanels.vue';
import ModelTable from '../ModelTable.vue';
import SimpleModelList from '../SimpleModelList.vue';
import DimensionTable from '../DimensionTable.vue';
import UsageLogTables from '../UsageLogTables.vue';
import ReportModeSwitch from '../ReportModeSwitch.vue';
import { reportApi, useReportSection } from '../use-report-section.js';
import { useDebouncedApply, useReportFilters } from '../use-report-filters.js';
import { useReportMode } from '../use-report-mode.js';
import { USER_METRICS, userModelsCsv } from '../user-report-shared.js';
import { beijingDateString, downloadText, toCsv } from '../report-utils.js';
import type { TrendData } from '../TrendPanel.vue';
import type { UserReportRes } from '../user-report-shared.js';
import type { Breakdown, CatalogEntry, MetricKey } from '../report-utils.js';

const SIMPLE_METRICS = USER_METRICS.filter(m => ['total', 'successRate', 'credits'].includes(m.key));
const SIMPLE_METRIC_KEYS = SIMPLE_METRICS.map(m => m.key);

const DIM_PAGE_SIZE = 10;
const STORAGE_KEY = 'agentsMyUsage';

const { mode, simple } = useReportMode(`${STORAGE_KEY}:mode`);

const catalog = shallowRef<CatalogEntry[]>([]);
const catalogMap = computed(() => new Map(catalog.value.map(m => [m.id, m])));

function modelName(id: string): string {
	return catalogMap.value.get(id)?.name ?? id;
}

const filterState = useReportFilters({
	storageKey: `${STORAGE_KEY}:filters`,
	collapseKey: `${STORAGE_KEY}:collapsed`,
	defaultRange: '30d',
	modelName,
	simple,
});
const filters = filterState.filters;

const metric = ref<MetricKey>('total');
const characterPage = ref(1);
const stylePage = ref(1);
// Breakdown of the response on screen, so old data is never relabeled with a new breakdown.
const loadedBreakdown = ref<Breakdown>('none');

const report = useReportSection(async () => {
	// Simple mode never groups or compares, whatever detailed mode left in the stored filters.
	const breakdown = simple.value ? 'none' : filters.breakdown;
	const res = await reportApi<UserReportRes>('agents/usage/report', {
		...filterState.params(),
		bucket: filterState.bucketUnit.value,
		breakdown,
		compare: !simple.value && filters.compare,
		characterPage: characterPage.value,
		stylePage: stylePage.value,
		dimensionPageSize: DIM_PAGE_SIZE,
	});
	loadedBreakdown.value = breakdown;
	return res;
});
const data = computed(() => report.data.value);
const trendData = computed<TrendData | null>(() => (data.value != null ? { ...data.value.trend, bucket: data.value.bucket } : null));

watch(data, d => {
	if (d != null) catalog.value = d.catalog;
});

// The per-user page shows no "active users" metric; fall back if a stale value lingers.
if (metric.value === 'users') metric.value = 'total';

function load(resetPages: boolean) {
	if (resetPages) {
		characterPage.value = 1;
		stylePage.value = 1;
	}
	filterState.refreshWindow();
	void report.load();
}

const logTables = useTemplateRef('logTables');

function reloadAll() {
	load(false);
	logTables.value?.reload();
}

const apply = useDebouncedApply();
watch(filterState.windowKey, () => apply.schedule(() => load(true)));
watch(() => [filters.bucket, filters.breakdown, filters.compare], () => apply.schedule(() => load(false)));
watch(simple, s => {
	if (s && !SIMPLE_METRIC_KEYS.includes(metric.value)) metric.value = 'total';
	apply.schedule(() => load(true));
});

load(true);

defineExpose({ reloadAll });

onBeforeUnmount(() => {
	apply.cancel();
});

function exportCsv() {
	const d = data.value;
	if (d == null) return;
	const { head, rows } = userModelsCsv(d.models, catalogMap.value);
	const from = beijingDateString(filterState.windowRange.value.since);
	const to = beijingDateString(filterState.windowRange.value.until - 1);
	downloadText(`agent-usage_${from}_${to}.csv`, toCsv(head, rows));
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 12px;
	min-width: 0;
	container-type: inline-size;

	@container (max-width: 560px) {
		gap: 10px;
	}
}

.pair {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;

	@container (max-width: 820px) {
		grid-template-columns: minmax(0, 1fr);
	}
}

.logs {
	box-sizing: border-box;
	min-width: 0;
	padding: 16px;
	border-radius: var(--MI-radius);

	@container (max-width: 560px) {
		padding: 12px;
	}
}
</style>
