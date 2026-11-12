<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<ReportFilterBar :state="filterState" :catalog="catalog" :modelName="modelName" :loading="anyLoading" exportable @refresh="loadAll" @export="exportCsv"/>

	<!-- KPI -->
	<ReportPanel title="概览" icon="ti ti-layout-dashboard" caption="点击卡片切换下方趋势图指标" :loading="summary.loading.value" :error="summary.error.value" :hasData="summary.data.value != null" @retry="summary.load">
		<KpiCards
			v-if="summary.data.value != null"
			:current="summary.data.value.current"
			:previous="summary.data.value.previous"
			:series="summary.data.value.series.map(s => s.m)"
			:active="metric"
			@select="metric = $event"
		/>
	</ReportPanel>

	<!-- 趋势 -->
	<ReportPanel title="趋势" icon="ti ti-chart-bar" :caption="trendCaption" :loading="trend.loading.value" :error="trend.error.value" :hasData="trend.data.value != null" @retry="trend.load">
		<template #actions>
			<div :class="[$style.seg, $style.scrollRow]" role="group" aria-label="指标">
				<button v-for="mk in METRICS" :key="mk.key" type="button" class="_button" :class="[$style.segBtn, metric === mk.key ? $style.segBtnOn : null]" @click="metric = mk.key">{{ mk.label }}</button>
			</div>
			<div :class="[$style.seg, $style.scrollRow]" role="group" aria-label="分组">
				<button v-for="bd in BREAKDOWNS" :key="bd.key" type="button" class="_button" :class="[$style.segBtn, filters.breakdown === bd.key ? $style.segBtnOn : null]" @click="filters.breakdown = bd.key">{{ bd.label }}</button>
			</div>
		</template>
		<TrendChart
			v-if="trend.data.value != null"
			:buckets="trend.data.value.buckets"
			:bucket="trend.data.value.bucket"
			:groups="trend.data.value.groups"
			:previous="trend.data.value.previous"
			:breakdown="trendBreakdown"
			:metric="metric"
			:modelName="modelName"
		/>
	</ReportPanel>

	<!-- 分指标折线 -->
	<MetricLineCharts :series="summary.data.value?.series ?? null" :bucket="summary.data.value?.bucket ?? bucketUnit" :loading="summary.loading.value" :error="summary.error.value" @retry="summary.load"/>

	<!-- 构成（进入视口才加载） -->
	<div v-appear="breakdownsSeen ? null : onBreakdownsAppear" :class="$style.lazySlot">
		<BreakdownPanels
			:data="breakdowns.data.value"
			:loading="breakdowns.loading.value"
			:error="breakdowns.error.value"
			:modelRows="models.data.value?.rows ?? null"
			:modelsLoading="models.loading.value"
			:modelsError="models.error.value"
			:modelName="modelName"
			:selectedModels="filters.modelIds"
			@retry="breakdowns.load"
			@retryModels="models.load"
		/>
	</div>

	<!-- 模型明细 -->
	<ReportPanel title="模型明细" icon="ti ti-table" caption="耗时只统计成功调用" :loading="models.loading.value" :error="models.error.value" :hasData="models.data.value != null" @retry="models.load">
		<ModelTable
			v-if="models.data.value != null"
			:rows="models.data.value.rows"
			:catalog="catalogMap"
			:selected="filters.modelIds"
			@toggleModel="toggleModel"
		/>
	</ReportPanel>

	<!-- 用户排行（进入视口才加载） -->
	<div v-appear="usersSeen ? null : onUsersAppear" :class="$style.lazySlot">
		<ReportPanel title="用户排行" icon="ti ti-podium" caption="点击行查看该用户的模型用量" :loading="users.loading.value" :error="users.error.value" :hasData="users.data.value != null" @retry="users.load">
			<UserTable
				v-if="users.data.value != null"
				:items="users.data.value.items"
				:total="users.data.value.total"
				:page="userPage"
				:pageSize="userPrefs.pageSize"
				:sort="userPrefs.sort"
				:loading="users.loading.value"
				@update:page="setUserPage"
				@update:pageSize="userPrefs.pageSize = $event"
				@update:sort="userPrefs.sort = $event"
			/>
		</ReportPanel>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import UserTable from './UserTable.vue';
import type { Breakdown, BucketUnit, CatalogEntry, MetricKey, ReportMetrics, UserSort } from '@/components/agent-report/report-utils.js';
import type { BreakdownsData } from '@/components/agent-report/BreakdownPanels.vue';
import ReportPanel from '@/components/agent-report/ReportPanel.vue';
import KpiCards from '@/components/agent-report/KpiCards.vue';
import TrendChart from '@/components/agent-report/TrendChart.vue';
import BreakdownPanels from '@/components/agent-report/BreakdownPanels.vue';
import MetricLineCharts from '@/components/agent-report/MetricLineCharts.vue';
import ModelTable from '@/components/agent-report/ModelTable.vue';
import ReportFilterBar from '@/components/agent-report/ReportFilterBar.vue';
import { reportApi, useReportSection } from '@/components/agent-report/use-report-section.js';
import { BREAKDOWNS, useDebouncedApply, useReportFilters } from '@/components/agent-report/use-report-filters.js';
import { beijingDateString, cacheHitRate, downloadText, successRate, toCsv, CATEGORY_LABELS } from '@/components/agent-report/report-utils.js';

const METRICS: { key: MetricKey; label: string }[] = [
	{ key: 'total', label: '请求' },
	{ key: 'successRate', label: '成功率' },
	{ key: 'credits', label: '扣费' },
	{ key: 'users', label: '用户' },
	{ key: 'tokens', label: 'Token' },
	{ key: 'latency', label: '耗时' },
];

// Catalog keeps the last known value so the picker and chips stay labeled while reloading.
const catalog = ref<CatalogEntry[]>([]);
const catalogMap = computed(() => new Map(catalog.value.map(m => [m.id, m])));

function modelName(id: string): string {
	return catalogMap.value.get(id)?.name ?? id;
}

// Restored before any watcher is registered so the first load already uses saved filters.
const filterState = useReportFilters({
	storageKey: 'adminAgentModelReportFilters:v2',
	collapseKey: 'adminAgentModelReportFilterCollapsed',
	defaultRange: '7d',
	modelName,
});
const filters = filterState.filters;
const bucketUnit = filterState.bucketUnit;

// User ranking options are page-local, persisted separately from the shared filters.
const USER_PREFS_KEY = 'adminAgentModelReportUserPrefs';
const userPrefs = reactive<{ sort: UserSort; pageSize: number }>((() => {
	try {
		const saved = JSON.parse(window.localStorage.getItem(USER_PREFS_KEY) ?? '{}') as Partial<{ sort: UserSort; pageSize: number }>;
		return {
			sort: (['credits', 'total', 'tokens', 'failed'] as const).includes(saved.sort as UserSort) ? saved.sort as UserSort : 'credits',
			pageSize: [10, 20, 50].includes(Number(saved.pageSize)) ? Number(saved.pageSize) : 10,
		};
	} catch {
		return { sort: 'credits' as UserSort, pageSize: 10 };
	}
})());
watch(() => [userPrefs.sort, userPrefs.pageSize], () => {
	try {
		window.localStorage.setItem(USER_PREFS_KEY, JSON.stringify(userPrefs));
	} catch { /* storage disabled */ }
});

const metric = ref<MetricKey>('total');
const userPage = ref(1);
const filterParams = filterState.params;

type SummaryRes = { since: string; until: string; bucket: BucketUnit; current: ReportMetrics; previous: ReportMetrics; series: { t: string; m: ReportMetrics }[] };
type TrendRes = { bucket: BucketUnit; buckets: string[]; groups: { key: string; total: number; points: ReportMetrics[] }[]; previous: ReportMetrics[] | null };
type ModelsRes = { catalog: CatalogEntry[]; rows: { modelId: string; m: ReportMetrics }[] };
type UsersRes = { items: { userId: string; user: Misskey.entities.UserLite | null; m: ReportMetrics }[]; total: number; page: number; pageSize: number };

// Breakdown used by the response currently displayed (the chart must not relabel old data with a new breakdown).
const trendBreakdown = ref<Breakdown>(filters.breakdown);

const summary = useReportSection(() => reportApi<SummaryRes>('admin/agents/reports/summary', { ...filterParams(), bucket: bucketUnit.value }));

// Grouped trends compute distinct users / percentiles only for the metric that shows them.
function trendColumns(m: MetricKey): string {
	return m === 'users' ? 'users' : m === 'latency' ? 'latency' : 'base';
}

let trendLoadedColumns = trendColumns(metric.value);
const trend = useReportSection(async () => {
	const breakdown = filters.breakdown;
	const cols = trendColumns(metric.value);
	const res = await reportApi<TrendRes>('admin/agents/reports/trend', {
		...filterParams(), bucket: bucketUnit.value, breakdown, compare: filters.compare, metric: metric.value,
	});
	trendBreakdown.value = breakdown;
	trendLoadedColumns = cols;
	return res;
});
const breakdowns = useReportSection(() => reportApi<BreakdownsData>('admin/agents/reports/breakdowns', filterParams()));
const models = useReportSection(() => reportApi<ModelsRes>('admin/agents/reports/models', filterParams()));
const users = useReportSection(() => reportApi<UsersRes>('admin/agents/reports/users', {
	...filterParams(), sort: userPrefs.sort, page: userPage.value, pageSize: userPrefs.pageSize,
}));

const anyLoading = computed(() => summary.loading.value || trend.loading.value || breakdowns.loading.value || models.loading.value || users.loading.value);

// Sections below the fold load on first scroll into view; after that they follow filter changes.
const breakdownsSeen = ref(false);
const usersSeen = ref(false);

function loadAll() {
	filterState.refreshWindow();
	userPage.value = 1;
	void summary.load();
	void trend.load();
	// The model catalog feeds the picker and labels, so models always load.
	void models.load();
	if (breakdownsSeen.value) void breakdowns.load();
	if (usersSeen.value) void users.load();
}

function onBreakdownsAppear() {
	if (breakdownsSeen.value) return;
	breakdownsSeen.value = true;
	void breakdowns.load();
}

function onUsersAppear() {
	if (usersSeen.value) return;
	usersSeen.value = true;
	void users.load();
}

watch(() => models.data.value, d => {
	if (d != null) catalog.value = d.catalog;
});

const trendCaption = computed(() => {
	const bd = BREAKDOWNS.find(b => b.key === trendBreakdown.value)?.label ?? '';
	return `${METRICS.find(m => m.key === metric.value)?.label ?? ''}${trendBreakdown.value !== 'none' ? ` · 按${bd}` : ''}${filters.compare ? ' · 虚线为上一周期' : ''}`;
});

const toggleModel = filterState.toggleModel;

function setUserPage(p: number) {
	userPage.value = p;
	void users.load();
}

// ---------- auto apply ----------

const apply = useDebouncedApply();

// Filters that change the data window reload every section.
watch(filterState.windowKey, () => {
	apply.schedule(loadAll);
});

// Granularity affects every time series; breakdown/compare only the main trend.
watch(() => filters.bucket, () => {
	apply.schedule(() => {
		void summary.load();
		void trend.load();
	});
});

watch(() => [filters.breakdown, filters.compare], () => {
	apply.schedule(() => void trend.load());
});

watch(metric, m => {
	if (filters.breakdown !== 'none' && trendColumns(m) !== trendLoadedColumns) void trend.load();
});

watch(() => [userPrefs.sort, userPrefs.pageSize], () => {
	userPage.value = 1;
	if (usersSeen.value) void users.load();
});

loadAll();

onBeforeUnmount(() => {
	apply.cancel();
});

// ---------- CSV ----------

function exportCsv() {
	const d = models.data.value;
	if (d == null) return;
	const head = ['模型', '分类', '状态', '请求', '成功', '失败', '中断', '处理中', '成功率%', '免费', '付费', '扣费', '用户', '输入Token', '输出Token', '缓存命中Token', '缓存命中率%', '成功均值ms', 'P50ms', 'P95ms'];
	const rows = d.rows.map(r => {
		const entry = catalogMap.value.get(r.modelId);
		const m = r.m;
		return [
			entry?.name ?? r.modelId, entry != null ? CATEGORY_LABELS[entry.category] : '', entry?.state ?? '',
			m.total, m.success, m.failed, m.aborted, m.pending,
			successRate(m)?.toFixed(2) ?? '', m.freeCalls, m.paidCalls, m.credits.toFixed(4), m.users,
			m.promptTokens, m.completionTokens, m.cacheHitTokens, cacheHitRate(m)?.toFixed(2) ?? '',
			m.avgMs != null ? Math.round(m.avgMs) : '', m.p50Ms != null ? Math.round(m.p50Ms) : '', m.p95Ms != null ? Math.round(m.p95Ms) : '',
		];
	});
	const from = beijingDateString(filterState.windowRange.value.since);
	const to = beijingDateString(filterState.windowRange.value.until - 1);
	downloadText(`agent-model-report_${from}_${to}.csv`, toCsv(head, rows));
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

/* Placeholder height so the lazy sections can be observed before they load. */
.lazySlot {
	min-height: 120px;
}

/* Trend toolbar segments (metric / breakdown). */
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
