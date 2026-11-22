<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<ReportModeSwitch v-model="mode"/>

	<ReportFilterBar :state="filterState" :catalog="catalog" :modelName="modelName" :loading="anyLoading" :simple="simple" exportable @refresh="loadAll" @export="exportCsv"/>

	<!-- KPI -->
	<ReportPanel title="概览" icon="ti ti-layout-dashboard" caption="点击卡片切换下方趋势图指标" :loading="summary.loading.value" :error="summary.error.value" :hasData="summary.data.value != null" @retry="summary.load">
		<KpiCards
			v-if="summary.data.value != null"
			:current="summary.data.value.current"
			:previous="summary.data.value.previous"
			:series="summary.data.value.series.map(s => s.m)"
			:active="metric"
			:only="simple ? SIMPLE_METRIC_KEYS : undefined"
			@select="metric = $event"
		/>
	</ReportPanel>

	<!-- 趋势 -->
	<TrendPanel
		v-model:metric="metric"
		:breakdown="filters.breakdown"
		:data="trend.data.value"
		:loading="trend.loading.value"
		:error="trend.error.value"
		:metrics="simple ? SIMPLE_METRICS : METRICS"
		:loadedBreakdown="trendBreakdown"
		:showBreakdown="!simple"
		:compare="!simple && filters.compare"
		:modelName="modelName"
		@update:breakdown="filters.breakdown = $event"
		@retry="trend.load"
	/>

	<!-- 简洁模式：模型排行 -->
	<ReportPanel v-if="simple" title="模型排行" icon="ti ti-podium" caption="按请求数" :loading="models.loading.value" :error="models.error.value" :hasData="models.data.value != null" @retry="models.load">
		<SimpleModelList v-if="models.data.value != null" :rows="models.data.value.rows" :catalog="catalogMap"/>
	</ReportPanel>

	<!-- 详细模式 -->
	<template v-else>
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
					:page="users.data.value.page"
					:pageSize="users.data.value.pageSize"
					:sort="users.data.value.sort"
					:loading="users.loading.value"
					@update:page="setUserPage"
					@update:pageSize="setUserPageSize"
					@update:sort="setUserSort"
				/>
			</ReportPanel>
		</div>
	</template>
</div>
</template>

<script lang="ts" setup>
/**
 * Site-wide model report (控制面板 → 智能体管理 → 报表 → 模型). Owns its endpoints, filters storage keys
 * and layout; shares only the generic building blocks in `components/agent-report/`.
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import ReportPanel from '../ReportPanel.vue';
import KpiCards from '../KpiCards.vue';
import TrendPanel from '../TrendPanel.vue';
import BreakdownPanels from '../BreakdownPanels.vue';
import MetricLineCharts from '../MetricLineCharts.vue';
import ModelTable from '../ModelTable.vue';
import SimpleModelList from '../SimpleModelList.vue';
import ReportFilterBar from '../ReportFilterBar.vue';
import ReportModeSwitch from '../ReportModeSwitch.vue';
import { reportApi, useReportSection } from '../use-report-section.js';
import { useDebouncedApply, useReportFilters } from '../use-report-filters.js';
import { useReportMode } from '../use-report-mode.js';
import { beijingDateString, cacheHitRate, downloadText, successRate, toCsv, CATEGORY_LABELS } from '../report-utils.js';
import UserTable from './UserTable.vue';
import type { TrendData } from '../TrendPanel.vue';
import type { BreakdownsData } from '../BreakdownPanels.vue';
import type { Breakdown, BucketUnit, CatalogEntry, MetricKey, ReportMetrics, UserSort } from '../report-utils.js';

const METRICS: { key: MetricKey; label: string }[] = [
	{ key: 'total', label: '请求' },
	{ key: 'successRate', label: '成功率' },
	{ key: 'credits', label: '扣费' },
	{ key: 'users', label: '用户' },
	{ key: 'tokens', label: 'Token' },
	{ key: 'latency', label: '耗时' },
];

// Simple mode: the four numbers an operator checks first.
const SIMPLE_METRICS = METRICS.filter(m => ['total', 'successRate', 'credits', 'users'].includes(m.key));
const SIMPLE_METRIC_KEYS = SIMPLE_METRICS.map(m => m.key);

const { mode, simple } = useReportMode('adminAgentModelReportMode');

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
	simple,
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
const filterParams = filterState.params;

type SummaryRes = { since: string; until: string; bucket: BucketUnit; current: ReportMetrics; previous: ReportMetrics; series: { t: string; m: ReportMetrics }[] };
type ModelsRes = { catalog: CatalogEntry[]; rows: { modelId: string; m: ReportMetrics }[] };
type UsersRes = { items: { userId: string; user: Misskey.entities.UserLite | null; m: ReportMetrics }[]; total: number; page: number; pageSize: number };
type UsersLoaded = UsersRes & { sort: UserSort };

// Breakdown used by the response currently displayed (the chart must not relabel old data with a new breakdown).
const trendBreakdown = ref<Breakdown>(filters.breakdown);

const summary = useReportSection(() => reportApi<SummaryRes>('admin/agents/reports/summary', { ...filterParams(), bucket: bucketUnit.value }));

// Grouped trends compute distinct users / percentiles only for the metric that shows them.
function trendColumns(m: MetricKey): string {
	return m === 'users' ? 'users' : m === 'latency' ? 'latency' : 'base';
}

// Simple mode never groups or compares, whatever detailed mode left in the stored filters.
const effectiveBreakdown = () => (simple.value ? 'none' : filters.breakdown);

let trendLoadedColumns = trendColumns(metric.value);
const trend = useReportSection(async () => {
	const breakdown = effectiveBreakdown();
	const cols = trendColumns(metric.value);
	const res = await reportApi<TrendData>('admin/agents/reports/trend', {
		...filterParams(), bucket: bucketUnit.value, breakdown, compare: !simple.value && filters.compare, metric: metric.value,
	});
	trendBreakdown.value = breakdown;
	trendLoadedColumns = cols;
	return res;
});
const breakdowns = useReportSection(() => reportApi<BreakdownsData>('admin/agents/reports/breakdowns', filterParams()));
const models = useReportSection(() => reportApi<ModelsRes>('admin/agents/reports/models', filterParams()));
let nextUserQuery: { page: number; pageSize: number; sort: UserSort } = {
	page: 1,
	pageSize: userPrefs.pageSize,
	sort: userPrefs.sort,
};
// Keep page/pageSize/sort attached to the resolved response so rank & pager never desync on failed reloads.
const users = useReportSection(async (): Promise<UsersLoaded> => {
	const { page, pageSize, sort } = nextUserQuery;
	const res = await reportApi<UsersRes>('admin/agents/reports/users', {
		...filterParams(), sort, page, pageSize,
	});
	return { ...res, page, pageSize, sort };
});
watch(() => users.data.value, d => {
	if (d != null) {
		userPrefs.sort = d.sort;
		userPrefs.pageSize = d.pageSize;
	}
});

const anyLoading = computed(() => summary.loading.value || trend.loading.value || models.loading.value || (!simple.value && (breakdowns.loading.value || users.loading.value)));

// Sections below the fold load on first scroll into view; after that they follow filter changes.
// They only exist in detailed mode, so leaving it resets the flags and re-entering reloads them fresh.
const breakdownsSeen = ref(false);
const usersSeen = ref(false);

function loadAll() {
	filterState.refreshWindow();
	nextUserQuery = {
		page: 1,
		pageSize: users.data.value?.pageSize ?? userPrefs.pageSize,
		sort: users.data.value?.sort ?? userPrefs.sort,
	};
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

const toggleModel = filterState.toggleModel;

function setUserPage(p: number) {
	nextUserQuery = {
		page: p,
		pageSize: users.data.value?.pageSize ?? userPrefs.pageSize,
		sort: users.data.value?.sort ?? userPrefs.sort,
	};
	void users.load();
}

function setUserPageSize(pageSize: number) {
	nextUserQuery = {
		page: 1,
		pageSize,
		sort: users.data.value?.sort ?? userPrefs.sort,
	};
	void users.load();
}

function setUserSort(sort: UserSort) {
	nextUserQuery = {
		page: 1,
		pageSize: users.data.value?.pageSize ?? userPrefs.pageSize,
		sort,
	};
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
	if (effectiveBreakdown() !== 'none' && trendColumns(m) !== trendLoadedColumns) void trend.load();
});

// Mode switch: granularity / grouping / compare / usage kinds change meaning, so reload the shared data.
watch(simple, s => {
	breakdownsSeen.value = false;
	usersSeen.value = false;
	nextUserQuery = {
		page: 1,
		pageSize: users.data.value?.pageSize ?? userPrefs.pageSize,
		sort: users.data.value?.sort ?? userPrefs.sort,
	};
	if (s && !SIMPLE_METRIC_KEYS.includes(metric.value)) metric.value = 'total';
	apply.schedule(loadAll);
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
</style>
