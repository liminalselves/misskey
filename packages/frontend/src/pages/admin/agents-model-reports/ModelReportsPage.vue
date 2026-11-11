<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<!-- 筛选栏：吸顶；折叠后只保留一行摘要，避免滚动时遮挡内容 -->
	<div :class="[$style.filterBar, filterCollapsed ? $style.filterBarCollapsed : null]">
		<div :class="$style.barHead">
			<button type="button" class="_button" :class="$style.collapseBtn" :aria-expanded="!filterCollapsed" @click="filterCollapsed = !filterCollapsed">
				<i class="ti ti-filter"></i>
				<span :class="$style.summaryText">{{ filterSummary }}</span>
				<i :class="filterCollapsed ? 'ti ti-chevron-down' : 'ti ti-chevron-up'"></i>
			</button>
			<div :class="$style.filterActions">
				<button type="button" class="_button" :class="$style.iconBtn" :disabled="activeFilterCount === 0" title="重置筛选" aria-label="重置筛选" @click="resetFilters"><i class="ti ti-filter-off"></i></button>
				<button type="button" class="_button" :class="$style.iconBtn" title="导出模型明细 CSV" aria-label="导出模型明细 CSV" :disabled="models.data.value == null" @click="exportCsv"><i class="ti ti-download"></i></button>
				<button type="button" class="_button" :class="$style.iconBtn" title="刷新" aria-label="刷新" :disabled="anyLoading" @click="loadAll"><i class="ti ti-refresh" :class="anyLoading ? $style.spin : null"></i></button>
			</div>
		</div>

		<template v-if="!filterCollapsed">
			<div :class="$style.field">
				<span :class="$style.fieldLabel">时间</span>
				<div :class="[$style.seg, $style.scrollRow]" role="group" aria-label="时间范围">
					<button
						v-for="r in RANGE_PRESETS"
						:key="r.key"
						type="button"
						class="_button"
						:class="[$style.segBtn, filters.range === r.key ? $style.segBtnOn : null]"
						@click="filters.range = r.key"
					>
						{{ r.label }}
					</button>
				</div>
			</div>
			<div v-if="filters.range === 'custom'" :class="$style.customRange">
				<input v-model="filters.customFrom" type="date" :class="$style.dateInput" :max="todayStr" aria-label="开始日期"/>
				<span :class="$style.muted">至</span>
				<input v-model="filters.customTo" type="date" :class="$style.dateInput" :max="todayStr" aria-label="结束日期"/>
			</div>
			<div :class="$style.fieldRow">
				<div :class="$style.field">
					<span :class="$style.fieldLabel">粒度</span>
					<div :class="$style.seg" role="group" aria-label="粒度">
						<button
							v-for="b in BUCKET_CHOICES"
							:key="b.key"
							type="button"
							class="_button"
							:class="[$style.segBtn, filters.bucket === b.key ? $style.segBtnOn : null]"
							:disabled="!bucketAvail[b.key]"
							:title="!bucketAvail[b.key] ? '当前时间范围不支持该粒度' : ''"
							@click="filters.bucket = b.key"
						>
							{{ b.label }}
						</button>
					</div>
				</div>
				<div :class="$style.field">
					<span :class="$style.fieldLabel">模型</span>
					<button ref="modelBtnEl" type="button" class="_button" :class="[$style.dropBtn, filters.modelIds.length > 0 ? $style.dropBtnOn : null]" @click="openModelPicker">
						<i class="ti ti-cpu"></i>
						<span>{{ filters.modelIds.length === 0 ? '全部模型' : `已选 ${filters.modelIds.length} 个` }}</span>
						<i class="ti ti-chevron-down"></i>
					</button>
				</div>
				<label :class="$style.compare">
					<input v-model="filters.compare" type="checkbox"/>
					<span>对比上一周期</span>
				</label>
			</div>
			<div :class="$style.field">
				<span :class="$style.fieldLabel">用途</span>
				<div :class="[$style.chips, $style.scrollRow]" role="group" aria-label="用途">
					<button
						v-for="k in USAGE_KINDS"
						:key="k"
						type="button"
						class="_button"
						:class="[$style.chip, filters.usageKinds.includes(k) ? $style.chipOn : null]"
						:aria-pressed="filters.usageKinds.includes(k)"
						@click="toggleUsageKind(k)"
					>
						{{ USAGE_KIND_LABELS[k] }}
					</button>
				</div>
			</div>
			<div v-if="filters.modelIds.length > 0" :class="$style.selectedRow">
				<span v-for="id in filters.modelIds" :key="id" :class="$style.selChip">
					{{ modelName(id) }}
					<button type="button" class="_button" :aria-label="`移除 ${modelName(id)}`" @click="toggleModel(id)"><i class="ti ti-x"></i></button>
				</span>
				<button type="button" class="_textButton" :class="$style.clearModels" @click="filters.modelIds = []">清除模型筛选</button>
			</div>
			<div :class="$style.rangeText">{{ rangeText }}</div>
		</template>
	</div>

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
				:pageSize="filters.userPageSize"
				:sort="filters.userSort"
				:loading="users.loading.value"
				@update:page="setUserPage"
				@update:pageSize="filters.userPageSize = $event"
				@update:sort="filters.userSort = $event"
			/>
		</ReportPanel>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, reactive, ref, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import ReportPanel from './ReportPanel.vue';
import KpiCards from './KpiCards.vue';
import TrendChart from './TrendChart.vue';
import BreakdownPanels from './BreakdownPanels.vue';
import MetricLineCharts from './MetricLineCharts.vue';
import ModelTable from './ModelTable.vue';
import UserTable from './UserTable.vue';
import ModelPicker from './ModelPicker.vue';
import { reportApi, useReportSection } from './use-report-section.js';
import {
	beijingDateString, beijingDayStart, bucketAvailability, cacheHitRate, downloadText, resolveBucket, resolveRange, successRate, toCsv,
	CATEGORY_LABELS, RANGE_PRESETS, USAGE_KINDS, USAGE_KIND_LABELS,
} from './report-utils.js';
import type { Breakdown, BucketChoice, BucketUnit, CatalogEntry, MetricKey, RangePreset, ReportMetrics, UsageKind, UserSort } from './report-utils.js';
import type { BreakdownsData } from './BreakdownPanels.vue';
import * as os from '@/os.js';

const STORAGE_KEY = 'adminAgentModelReportFilters:v2';
const DAY = 24 * 3600_000;

const BUCKET_CHOICES: { key: BucketChoice; label: string }[] = [
	{ key: 'auto', label: '自动' },
	{ key: 'hour', label: '时' },
	{ key: 'day', label: '日' },
	{ key: 'week', label: '周' },
];

const METRICS: { key: MetricKey; label: string }[] = [
	{ key: 'total', label: '请求' },
	{ key: 'successRate', label: '成功率' },
	{ key: 'credits', label: '扣费' },
	{ key: 'users', label: '用户' },
	{ key: 'tokens', label: 'Token' },
	{ key: 'latency', label: '耗时' },
];

const BREAKDOWNS: { key: Breakdown; label: string }[] = [
	{ key: 'none', label: '不分组' },
	{ key: 'status', label: '状态' },
	{ key: 'model', label: '模型' },
	{ key: 'usageKind', label: '用途' },
	{ key: 'billing', label: '计费' },
];

type Filters = {
	range: RangePreset;
	customFrom: string;
	customTo: string;
	bucket: BucketChoice;
	modelIds: string[];
	usageKinds: UsageKind[];
	compare: boolean;
	breakdown: Breakdown;
	userSort: UserSort;
	userPageSize: number;
};

function defaultFilters(): Filters {
	const now = Date.now();
	return {
		range: '7d',
		customFrom: beijingDateString(beijingDayStart(now, -6)),
		customTo: beijingDateString(now),
		bucket: 'auto',
		modelIds: [],
		usageKinds: [],
		compare: false,
		breakdown: 'none',
		userSort: 'credits',
		userPageSize: 10,
	};
}

function restoreFilters(): Filters {
	const base = defaultFilters();
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (raw == null) return base;
		const saved = JSON.parse(raw) as Partial<Filters>;
		const pick = <T>(v: T | undefined, ok: boolean, fallback: T): T => (ok && v !== undefined ? v : fallback);
		return {
			range: pick(saved.range, RANGE_PRESETS.some(r => r.key === saved.range), base.range),
			customFrom: typeof saved.customFrom === 'string' ? saved.customFrom : base.customFrom,
			customTo: typeof saved.customTo === 'string' ? saved.customTo : base.customTo,
			bucket: pick(saved.bucket, BUCKET_CHOICES.some(b => b.key === saved.bucket), base.bucket),
			modelIds: Array.isArray(saved.modelIds) ? saved.modelIds.filter((x): x is string => typeof x === 'string') : [],
			usageKinds: Array.isArray(saved.usageKinds) ? saved.usageKinds.filter((x): x is UsageKind => (USAGE_KINDS as readonly string[]).includes(x)) : [],
			compare: saved.compare === true,
			breakdown: pick(saved.breakdown, BREAKDOWNS.some(b => b.key === saved.breakdown), base.breakdown),
			userSort: pick(saved.userSort, (['credits', 'total', 'tokens', 'failed'] as const).includes(saved.userSort as UserSort), base.userSort),
			userPageSize: [10, 20, 50].includes(Number(saved.userPageSize)) ? Number(saved.userPageSize) : base.userPageSize,
		};
	} catch {
		return base;
	}
}

// Restored before any watcher is registered so the first load already uses saved filters.
const filters = reactive<Filters>(restoreFilters());

const COLLAPSE_KEY = 'adminAgentModelReportFilterCollapsed';
// Phones start collapsed so the sticky bar is a single line; the choice is remembered afterwards.
const filterCollapsed = ref(readCollapsed());

function readCollapsed(): boolean {
	try {
		const v = window.localStorage.getItem(COLLAPSE_KEY);
		if (v != null) return v === '1';
	} catch { /* storage disabled */ }
	return window.matchMedia('(max-width: 600px)').matches;
}

watch(filterCollapsed, v => {
	try {
		window.localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
	} catch { /* storage disabled */ }
});
const metric = ref<MetricKey>('total');
const userPage = ref(1);
const todayStr = beijingDateString(Date.now());

// The window is resolved once per apply, so all sections query the same [since, until).
// "Now" is floored to the minute so reloads within a minute share the server-side cache.
function currentWindow() {
	return resolveRange(filters.range, Math.floor(Date.now() / 60_000) * 60_000, filters.customFrom, filters.customTo);
}

const windowRange = ref(currentWindow());

const span = computed(() => windowRange.value.until - windowRange.value.since);
const bucketAvail = computed(() => bucketAvailability(span.value));
const bucketUnit = computed<BucketUnit>(() => resolveBucket(span.value, filters.bucket));

const activeFilterCount = computed(() => {
	const d = defaultFilters();
	return (filters.range !== d.range ? 1 : 0)
		+ (filters.bucket !== d.bucket ? 1 : 0)
		+ (filters.modelIds.length > 0 ? 1 : 0)
		+ (filters.usageKinds.length > 0 ? 1 : 0)
		+ (filters.compare ? 1 : 0);
});

function filterParams(): Record<string, unknown> {
	return {
		since: new Date(windowRange.value.since).toISOString(),
		until: new Date(windowRange.value.until).toISOString(),
		modelIds: filters.modelIds,
		usageKinds: filters.usageKinds,
	};
}

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
	...filterParams(), sort: filters.userSort, page: userPage.value, pageSize: filters.userPageSize,
}));

const anyLoading = computed(() => summary.loading.value || trend.loading.value || breakdowns.loading.value || models.loading.value || users.loading.value);

// Sections below the fold load on first scroll into view; after that they follow filter changes.
const breakdownsSeen = ref(false);
const usersSeen = ref(false);

function loadAll() {
	windowRange.value = currentWindow();
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

// Catalog keeps the last known value so the picker and chips stay labeled while reloading.
const catalog = ref<CatalogEntry[]>([]);
watch(() => models.data.value, d => {
	if (d != null) catalog.value = d.catalog;
});
const catalogMap = computed(() => new Map(catalog.value.map(m => [m.id, m])));

function modelName(id: string): string {
	return catalogMap.value.get(id)?.name ?? id;
}

const rangeText = computed(() => {
	const fmt = (t: number) => {
		const d = new Date(t + 8 * 3600_000).toISOString();
		return `${d.slice(0, 10)} ${d.slice(11, 16)}`;
	};
	const days = span.value / DAY;
	const unit = { hour: '小时', day: '天', week: '周' }[bucketUnit.value];
	return `北京时间 ${fmt(windowRange.value.since)} — ${fmt(windowRange.value.until)} · 共 ${days >= 1 ? `${days.toFixed(days % 1 === 0 ? 0 : 1)} 天` : `${Math.round(span.value / 3600_000)} 小时`} · 按${unit}`;
});

const filterSummary = computed(() => {
	const parts: string[] = [];
	const range = RANGE_PRESETS.find(r => r.key === filters.range)?.label ?? '';
	parts.push(filters.range === 'custom' ? `${filters.customFrom} 至 ${filters.customTo}` : range);
	parts.push(`按${{ hour: '小时', day: '天', week: '周' }[bucketUnit.value]}`);
	parts.push(filters.modelIds.length === 0 ? '全部模型' : (filters.modelIds.length === 1 ? modelName(filters.modelIds[0]) : `${filters.modelIds.length} 个模型`));
	if (filters.usageKinds.length > 0) parts.push(filters.usageKinds.map(k => USAGE_KIND_LABELS[k]).join('/'));
	if (filters.compare) parts.push('对比上一周期');
	return parts.join(' · ');
});

const trendCaption = computed(() => {
	const bd = BREAKDOWNS.find(b => b.key === trendBreakdown.value)?.label ?? '';
	return `${METRICS.find(m => m.key === metric.value)?.label ?? ''}${trendBreakdown.value !== 'none' ? ` · 按${bd}` : ''}${filters.compare ? ' · 虚线为上一周期' : ''}`;
});

// ---------- filter interactions ----------

function toggleUsageKind(k: UsageKind) {
	filters.usageKinds = filters.usageKinds.includes(k) ? filters.usageKinds.filter(x => x !== k) : [...filters.usageKinds, k];
}

function toggleModel(id: string) {
	filters.modelIds = filters.modelIds.includes(id) ? filters.modelIds.filter(x => x !== id) : [...filters.modelIds, id];
}

const modelBtnEl = useTemplateRef('modelBtnEl');

function openModelPicker() {
	const { dispose } = os.popup(ModelPicker, {
		catalog: catalog.value,
		modelValue: filters.modelIds,
		anchorElement: modelBtnEl.value,
	}, {
		'update:modelValue': (v: string[]) => { filters.modelIds = v; },
		closed: () => dispose(),
	});
}

function resetFilters() {
	const d = defaultFilters();
	Object.assign(filters, { ...d, breakdown: filters.breakdown, userSort: filters.userSort, userPageSize: filters.userPageSize });
}

function setUserPage(p: number) {
	userPage.value = p;
	void users.load();
}

// ---------- auto apply ----------

let applyTimer: number | null = null;

function scheduleApply(fn: () => void) {
	if (applyTimer != null) window.clearTimeout(applyTimer);
	applyTimer = window.setTimeout(() => {
		applyTimer = null;
		fn();
	}, 350);
}

watch(() => JSON.stringify(filters), () => {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
	} catch { /* storage full or disabled */ }
});

// Filters that change the data window reload every section.
watch(() => [filters.range, filters.customFrom, filters.customTo, filters.modelIds.join(','), filters.usageKinds.join(',')], () => {
	scheduleApply(loadAll);
});

// Granularity affects every time series; breakdown/compare only the main trend.
watch(() => filters.bucket, () => {
	scheduleApply(() => {
		void summary.load();
		void trend.load();
	});
});

watch(() => [filters.breakdown, filters.compare], () => {
	scheduleApply(() => void trend.load());
});

watch(metric, m => {
	if (filters.breakdown !== 'none' && trendColumns(m) !== trendLoadedColumns) void trend.load();
});

watch(() => [filters.userSort, filters.userPageSize], () => {
	userPage.value = 1;
	if (usersSeen.value) void users.load();
});

// If the range no longer allows the chosen granularity, fall back to auto.
watch(bucketAvail, a => {
	if (!a[filters.bucket]) filters.bucket = 'auto';
});

loadAll();

onBeforeUnmount(() => {
	if (applyTimer != null) window.clearTimeout(applyTimer);
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
	const from = beijingDateString(windowRange.value.since);
	const to = beijingDateString(windowRange.value.until - 1);
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

.filterBar {
	position: sticky;
	top: var(--MI-stickyTop, 0);
	z-index: 3;
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px 12px;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-bg) 88%, transparent);
	backdrop-filter: var(--MI-blur, blur(12px));
}

.filterBarCollapsed {
	padding-top: 6px;
	padding-bottom: 6px;
}

.barHead {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
}

.collapseBtn {
	display: flex;
	align-items: center;
	gap: 8px;
	flex: 1;
	min-width: 0;
	min-height: 32px;
	padding: 0 4px;
	border-radius: 6px;
	text-align: left;
	font-size: 0.85em;
	font-weight: 600;

	> i {
		flex-shrink: 0;
		opacity: 0.7;
	}

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-fg) 6%, transparent);
	}
}

.summaryText {
	flex: 1;
	min-width: 0;
	overflow-wrap: anywhere;
}

.filterActions {
	display: flex;
	align-items: center;
	flex-shrink: 0;
	gap: 2px;
}

.field {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.fieldLabel {
	flex-shrink: 0;
	width: 2.4em;
	font-size: 0.78em;
	font-weight: 600;
	opacity: 0.6;
}

.fieldRow {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px 16px;
}

/* Long option rows scroll sideways on narrow screens instead of wrapping into a tall block. */
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

.seg {
	display: inline-flex;
	flex-wrap: wrap;
	padding: 2px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 7%, transparent);
}

.segBtn {
	padding: 4px 10px;
	border-radius: 6px;
	font-size: 0.82em;
	white-space: nowrap;
	opacity: 0.72;

	&:hover:not(:disabled) {
		opacity: 1;
	}

	&:disabled {
		opacity: 0.3;
		cursor: default;
	}
}

@media (pointer: coarse) {
	.segBtn {
		padding: 6px 12px;
	}

	.chip {
		height: 30px;
	}

	.iconBtn,
	.dropBtn {
		height: 34px;
	}

	.iconBtn {
		width: 34px;
	}
}

.segBtnOn {
	background: var(--MI_THEME-panel);
	opacity: 1;
	font-weight: 600;
	color: var(--MI_THEME-accent);
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}

.customRange {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
	padding-left: calc(2.4em * 0.78 + 8px);
}

.dateInput {
	box-sizing: border-box;
	height: 30px;
	padding: 0 8px;
	border-radius: 6px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	font: inherit;
	font-size: 0.85em;
	color-scheme: light dark;

	@media (pointer: coarse) {
		height: 34px;
		font-size: 16px;
	}
}

.dropBtn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 30px;
	padding: 0 10px;
	border-radius: 8px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	font-size: 0.85em;
	font-weight: 600;

	&:hover {
		border-color: var(--MI_THEME-accent);
	}
}

.dropBtnOn {
	border-color: var(--MI_THEME-accent);
	color: var(--MI_THEME-accent);
}

.chips {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.chip {
	height: 26px;
	padding: 0 10px;
	border-radius: 999px;
	border: solid 1px var(--MI_THEME-divider);
	font-size: 0.8em;
	opacity: 0.8;

	&:hover {
		opacity: 1;
		border-color: var(--MI_THEME-accent);
	}
}

.chipOn {
	opacity: 1;
	border-color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, transparent);
	color: var(--MI_THEME-accent);
	font-weight: 600;
}

.compare {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	margin-right: 4px;
	font-size: 0.82em;
	cursor: pointer;
	user-select: none;
}

.iconBtn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	border-radius: 8px;

	&:hover:not(:disabled) {
		background: color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
	}

	&:disabled {
		opacity: 0.35;
	}
}

.spin {
	animation: spin 0.9s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.selectedRow {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
}

.selChip {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 4px 2px 10px;
	border-radius: 999px;
	font-size: 0.8em;
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, transparent);
	color: var(--MI_THEME-accent);

	> button {
		display: inline-flex;
		padding: 2px;
		border-radius: 999px;

		&:hover {
			background: color-mix(in srgb, var(--MI_THEME-accent) 20%, transparent);
		}
	}
}

.clearModels {
	font-size: 0.8em;
}

.rangeText {
	font-size: 0.75em;
	opacity: 0.56;
	font-variant-numeric: tabular-nums;
}

.muted {
	opacity: 0.56;
}

/* Placeholder height so the lazy sections can be observed before they load. */
.lazySlot {
	min-height: 120px;
}
</style>
