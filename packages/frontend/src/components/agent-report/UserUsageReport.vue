<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<ReportFilterBar :state="filterState" :catalog="catalog" :modelName="modelName" :loading="report.loading.value" exportable @refresh="reloadAll" @export="exportCsv"/>

	<!-- 概览 -->
	<ReportPanel title="概览" icon="ti ti-layout-dashboard" caption="点击卡片切换下方趋势图指标" :loading="report.loading.value" :error="report.error.value" :hasData="data != null" @retry="report.load">
		<KpiCards
			v-if="data != null"
			:current="data.current"
			:previous="data.previous"
			:series="data.series.map(s => s.m)"
			:active="metric"
			:hide="['users']"
			:balance="data.creditBalance"
			@select="metric = $event"
		/>
	</ReportPanel>

	<slot name="afterOverview"></slot>

	<!-- 趋势 -->
	<ReportPanel title="趋势" icon="ti ti-chart-bar" :caption="trendCaption" :loading="report.loading.value" :error="report.error.value" :hasData="data != null" @retry="report.load">
		<template #actions>
			<div :class="[$style.seg, $style.scrollRow]" role="group" aria-label="指标">
				<button v-for="mk in METRICS" :key="mk.key" type="button" class="_button" :class="[$style.segBtn, metric === mk.key ? $style.segBtnOn : null]" @click="metric = mk.key">{{ mk.label }}</button>
			</div>
			<div :class="[$style.seg, $style.scrollRow]" role="group" aria-label="分组">
				<button v-for="bd in BREAKDOWNS" :key="bd.key" type="button" class="_button" :class="[$style.segBtn, filters.breakdown === bd.key ? $style.segBtnOn : null]" @click="filters.breakdown = bd.key">{{ bd.label }}</button>
			</div>
		</template>
		<TrendChart
			v-if="data != null"
			:buckets="data.trend.buckets"
			:bucket="data.bucket"
			:groups="data.trend.groups"
			:previous="data.trend.previous"
			:breakdown="loadedBreakdown"
			:metric="metric"
			:modelName="modelName"
		/>
	</ReportPanel>

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

	<!-- 流水不受筛选影响（与时间范围无关的完整明细） -->
	<section v-panel :class="$style.logs">
		<UsageLogTables ref="logTables" :billingEndpoint="billingEndpoint" :logsEndpoint="logsEndpoint" :params="baseParams"/>
	</section>
</div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, shallowRef, useTemplateRef, watch } from 'vue';
import ReportFilterBar from './ReportFilterBar.vue';
import ReportPanel from './ReportPanel.vue';
import KpiCards from './KpiCards.vue';
import TrendChart from './TrendChart.vue';
import MetricLineCharts from './MetricLineCharts.vue';
import BreakdownPanels from './BreakdownPanels.vue';
import ModelTable from './ModelTable.vue';
import DimensionTable from './DimensionTable.vue';
import UsageLogTables from './UsageLogTables.vue';
import { reportApi, useReportSection } from './use-report-section.js';
import { BREAKDOWNS, useDebouncedApply, useReportFilters } from './use-report-filters.js';
import { beijingDateString, cacheHitRate, downloadText, successRate, toCsv, CATEGORY_LABELS } from './report-utils.js';
import type { BreakdownsData } from './BreakdownPanels.vue';
import type { Breakdown, BucketUnit, CatalogEntry, MetricKey, RangePreset, ReportMetrics } from './report-utils.js';

/**
 * Per-user usage report: the same filters, metric definitions and charts as the site-wide model
 * report, scoped to one user. Used by "我的用量" and by the moderator user page.
 */
const props = defineProps<{
	reportEndpoint: string;
	billingEndpoint: string;
	logsEndpoint: string;
	/** Extra params on every call (the moderator page passes userId). */
	baseParams: Record<string, unknown>;
	/** localStorage key prefix; filters persist per page kind, not per viewed user. */
	storageKey: string;
	defaultRange?: RangePreset;
}>();

type NamedPage = { items: { id: string; name: string | null; m: ReportMetrics }[]; total: number; page: number; pageSize: number };
type ReportRes = BreakdownsData & {
	creditBalance: number;
	since: string;
	until: string;
	bucket: BucketUnit;
	current: ReportMetrics;
	previous: ReportMetrics;
	series: { t: string; m: ReportMetrics }[];
	trend: { buckets: string[]; groups: { key: string; total: number; points: ReportMetrics[] }[]; previous: ReportMetrics[] | null };
	catalog: CatalogEntry[];
	models: { modelId: string; m: ReportMetrics }[];
	characters: NamedPage;
	styles: NamedPage;
};

const METRICS: { key: MetricKey; label: string }[] = [
	{ key: 'total', label: '请求' },
	{ key: 'successRate', label: '成功率' },
	{ key: 'credits', label: '扣费' },
	{ key: 'tokens', label: 'Token' },
	{ key: 'latency', label: '耗时' },
];

const DIM_PAGE_SIZE = 10;

const catalog = shallowRef<CatalogEntry[]>([]);
const catalogMap = computed(() => new Map(catalog.value.map(m => [m.id, m])));

function modelName(id: string): string {
	return catalogMap.value.get(id)?.name ?? id;
}

// Storage keys and default range are fixed for the component's lifetime.
// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const { storageKey, defaultRange } = props;
const filterState = useReportFilters({
	storageKey: `${storageKey}:filters`,
	collapseKey: `${storageKey}:collapsed`,
	defaultRange: defaultRange ?? '30d',
	modelName,
});
const filters = filterState.filters;

const metric = ref<MetricKey>('total');
const characterPage = ref(1);
const stylePage = ref(1);
// Breakdown of the response on screen, so old data is never relabeled with a new breakdown.
const loadedBreakdown = ref<Breakdown>(filters.breakdown);

const report = useReportSection(async () => {
	const breakdown = filters.breakdown;
	const res = await reportApi<ReportRes>(props.reportEndpoint, {
		...props.baseParams,
		...filterState.params(),
		bucket: filterState.bucketUnit.value,
		breakdown,
		compare: filters.compare,
		characterPage: characterPage.value,
		stylePage: stylePage.value,
		dimensionPageSize: DIM_PAGE_SIZE,
	});
	loadedBreakdown.value = breakdown;
	return res;
});
const data = computed(() => report.data.value);

watch(data, d => {
	if (d != null) catalog.value = d.catalog;
});

const trendCaption = computed(() => {
	const bd = BREAKDOWNS.find(b => b.key === loadedBreakdown.value)?.label ?? '';
	return `${METRICS.find(m => m.key === metric.value)?.label ?? ''}${loadedBreakdown.value !== 'none' ? ` · 按${bd}` : ''}${filters.compare ? ' · 虚线为上一周期' : ''}`;
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

load(true);

defineExpose({ reloadAll });

onBeforeUnmount(() => {
	apply.cancel();
});

function exportCsv() {
	const d = data.value;
	if (d == null) return;
	const head = ['模型', '分类', '请求', '成功', '失败', '中断', '成功率%', '免费', '付费', '扣费', '输入Token', '输出Token', '缓存命中率%', 'P50ms', 'P95ms'];
	const rows = d.models.map(r => {
		const entry = catalogMap.value.get(r.modelId);
		const m = r.m;
		return [
			entry?.name ?? r.modelId, entry != null ? CATEGORY_LABELS[entry.category] : '',
			m.total, m.success, m.failed, m.aborted, successRate(m)?.toFixed(2) ?? '', m.freeCalls, m.paidCalls, m.credits.toFixed(4),
			m.promptTokens, m.completionTokens, cacheHitRate(m)?.toFixed(2) ?? '',
			m.p50Ms != null ? Math.round(m.p50Ms) : '', m.p95Ms != null ? Math.round(m.p95Ms) : '',
		];
	});
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
