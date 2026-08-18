<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<!-- 工具栏：时间维度 + 模型筛选 + 刷新 -->
	<div :class="$style.toolbar">
		<div :class="$style.rangeBtns">
			<button
				v-for="r in rangeOptions"
				:key="r.key"
				type="button"
				:class="[$style.pillBtn, activeRange === r.key ? $style.pillBtnActive : null]"
				@click="setRange(r.key)"
			>
				{{ r.label }}
			</button>
		</div>
		<div :class="$style.toolbarRight">
			<MkSelect v-model="selectedModelId" :items="modelItems" :class="$style.modelSelect"/>
			<MkButton rounded :disabled="loading" @click="load"><i class="ti ti-refresh"></i> {{ i18n.ts.reload }}</MkButton>
		</div>
	</div>

	<MkLoading v-if="loading && data == null"/>
	<MkInfo v-else-if="data == null">{{ i18n.ts._agents.adminReportsLoadFailed }}</MkInfo>
	<div v-else :class="[$style.content, loading ? $style.contentLoading : null]" class="_gaps_m">
		<!-- 汇总卡（带环比上一周期） -->
		<div :class="$style.summaryGrid">
			<div v-panel :class="$style.summaryCard">
				<div :class="$style.summaryCardLabel">{{ i18n.ts._agents.adminReportsTotal }}</div>
				<div :class="$style.summaryCardValue">{{ data.overall.total }}</div>
				<div :class="[$style.summaryCardSub, $style.deltaNeutral]" :title="i18n.ts._agents.adminReportsVsPrevious">{{ deltaText(deltaPct(data.overall.total, data.previousOverall.total)) }}</div>
			</div>
			<div v-panel :class="$style.summaryCard">
				<div :class="$style.summaryCardLabel">{{ i18n.ts._agents.adminReportsSuccessRate }}</div>
				<div :class="[$style.summaryCardValue, $style.success]">{{ pct(data.overall.success, data.overall.total) }}</div>
				<div :class="[$style.summaryCardSub, $style[deltaClass(deltaPp(overallSuccessRate, previousSuccessRate), 'good')]]" :title="i18n.ts._agents.adminReportsVsPrevious">{{ deltaText(deltaPp(overallSuccessRate, previousSuccessRate), 'pp') }}</div>
			</div>
			<div v-panel :class="$style.summaryCard">
				<div :class="$style.summaryCardLabel">{{ i18n.ts._agents.adminReportsFailed }}</div>
				<div :class="[$style.summaryCardValue, data.overall.failed > 0 ? $style.failed : null]">{{ data.overall.failed }}</div>
				<div :class="[$style.summaryCardSub, $style[deltaClass(deltaPct(data.overall.failed, data.previousOverall.failed), 'bad')]]" :title="i18n.ts._agents.adminReportsVsPrevious">{{ deltaText(deltaPct(data.overall.failed, data.previousOverall.failed)) }}</div>
			</div>
			<div v-panel :class="$style.summaryCard">
				<div :class="$style.summaryCardLabel">{{ i18n.ts._agents.adminReportsAborted }}</div>
				<div :class="[$style.summaryCardValue, data.overall.aborted > 0 ? $style.aborted : null]">{{ data.overall.aborted }}</div>
				<div :class="[$style.summaryCardSub, $style[deltaClass(deltaPct(data.overall.aborted, data.previousOverall.aborted), 'bad')]]" :title="i18n.ts._agents.adminReportsVsPrevious">{{ deltaText(deltaPct(data.overall.aborted, data.previousOverall.aborted)) }}</div>
			</div>
			<div v-panel :class="$style.summaryCard">
				<div :class="$style.summaryCardLabel">{{ i18n.ts._agents.adminReportsFreeCalls }}</div>
				<div :class="$style.summaryCardValue">{{ data.overall.freeCalls }}</div>
				<div :class="[$style.summaryCardSub, $style.deltaNeutral]">{{ i18n.ts._agents.adminReportsShareOfTotal }} {{ pct(data.overall.freeCalls, data.overall.total) }}</div>
			</div>
			<div v-panel :class="$style.summaryCard">
				<div :class="$style.summaryCardLabel">{{ i18n.ts._agents.adminReportsPaidCalls }}</div>
				<div :class="$style.summaryCardValue">{{ data.overall.paidCalls }}</div>
				<div :class="[$style.summaryCardSub, $style.deltaNeutral]">{{ i18n.ts._agents.adminReportsShareOfTotal }} {{ pct(data.overall.paidCalls, data.overall.total) }}</div>
			</div>
			<div v-panel :class="$style.summaryCard">
				<div :class="$style.summaryCardLabel">{{ i18n.ts._agents.adminReportsCreditsCharged }}</div>
				<div :class="[$style.summaryCardValue, $style.charged]">{{ fmtCredits(data.overall.creditsCharged) }}</div>
				<div :class="[$style.summaryCardSub, $style.deltaNeutral]" :title="i18n.ts._agents.adminReportsVsPrevious">{{ deltaText(deltaPct(data.overall.creditsCharged, data.previousOverall.creditsCharged)) }}</div>
			</div>
			<div v-panel :class="$style.summaryCard">
				<div :class="$style.summaryCardLabel">{{ i18n.ts._agents.adminReportsActiveUsers }}</div>
				<div :class="$style.summaryCardValue">{{ data.overall.uniqueUsers }}</div>
				<div :class="[$style.summaryCardSub, $style.deltaNeutral]" :title="i18n.ts._agents.adminReportsVsPrevious">{{ deltaText(deltaPct(data.overall.uniqueUsers, data.previousOverall.uniqueUsers)) }}</div>
			</div>
		</div>

		<!-- 请求量趋势（堆叠柱 + 成功率折线双轴） -->
		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-timeline"></i></template>
			<template #label>{{ i18n.ts._agents.adminReportsRequestsTrend }}</template>
			<div class="_gaps_s">
				<div v-if="activeRange === '7d'" :class="$style.granularityRow">
					<button
						type="button"
						:class="[$style.pillBtn, granularity === 'hour' ? $style.pillBtnActive : null]"
						@click="setGranularity('hour')"
					>
						{{ i18n.ts._agents.adminReportsGranularityHour }}
					</button>
					<button
						type="button"
						:class="[$style.pillBtn, granularity === 'day' ? $style.pillBtnActive : null]"
						@click="setGranularity('day')"
					>
						{{ i18n.ts._agents.adminReportsGranularityDay }}
					</button>
				</div>
				<MkInfo v-if="data.buckets.length === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>
				<div v-else :class="$style.chartBox"><canvas ref="requestsChartEl"></canvas></div>
			</div>
		</MkFolder>

		<!-- 扣减额度趋势 + 平均耗时趋势 -->
		<div :class="$style.compositionRow">
			<MkFolder :defaultOpen="true" :class="$style.compositionItem">
				<template #icon><i class="ti ti-coins"></i></template>
				<template #label>{{ i18n.ts._agents.adminReportsCreditsTrend }}</template>
				<MkInfo v-if="data.buckets.length === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>
				<div v-else :class="$style.chartBox"><canvas ref="creditsChartEl"></canvas></div>
			</MkFolder>
			<MkFolder :defaultOpen="true" :class="$style.compositionItem">
				<template #icon><i class="ti ti-clock-bolt"></i></template>
				<template #label>{{ i18n.ts._agents.adminReportsLatencyTrend }}</template>
				<MkInfo v-if="data.buckets.length === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>
				<div v-else :class="$style.chartBox"><canvas ref="latencyChartEl"></canvas></div>
			</MkFolder>
		</div>

		<!-- 构成分析 -->
		<div :class="$style.compositionRow">
			<MkFolder :defaultOpen="true" :class="$style.compositionItem">
				<template #icon><i class="ti ti-chart-donut"></i></template>
				<template #label>{{ i18n.ts._agents.adminReportsBillingComposition }}</template>
				<MkInfo v-if="billingTotal === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>
				<template v-else>
					<div :class="$style.chartBoxSquare"><canvas ref="billingChartEl"></canvas></div>
					<div :class="$style.doughnutLegend">
						<div v-for="seg in billingSegments" :key="seg.key" :class="$style.doughnutLegendRow">
							<span :class="$style.legendDot" :style="{ background: seg.color }"></span>
							<span :class="$style.legendLabel">{{ seg.label }}</span>
							<span :class="$style.legendValue">{{ seg.value }} {{ i18n.ts._agents.times }} · {{ pct(seg.value, billingTotal) }}</span>
						</div>
					</div>
				</template>
			</MkFolder>
			<MkFolder :defaultOpen="true" :class="$style.compositionItem">
				<template #icon><i class="ti ti-chart-bar"></i></template>
				<template #label>{{ i18n.ts._agents.adminReportsUsageKindComposition }}</template>
				<MkInfo v-if="data.byUsageKind.length === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>
				<div v-else :class="$style.chartBoxSquare"><canvas ref="usageKindChartEl"></canvas></div>
			</MkFolder>
		</div>

		<!-- 按模型明细表（点击表头排序） -->
		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-cpu"></i></template>
			<template #label>{{ i18n.ts._agents.adminReportsByModel }}</template>
			<div class="_gaps_s">
				<MkInfo v-if="data.byModel.length === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>
				<template v-else>
					<div :class="$style.tableHint"><i class="ti ti-hand-click"></i> {{ i18n.ts._agents.adminReportsClickRowToFilter }}</div>
					<div :class="$style.modelTableWrap">
						<div :class="$style.modelTable">
							<div :class="$style.modelHeader">
								<span>{{ i18n.ts._agents.adminReportsModelColumn }}</span>
								<button
									v-for="col in modelSortColumns"
									:key="col.key"
									type="button"
									:class="[$style.sortHeader, sortKey === col.key ? $style.sortHeaderActive : null]"
									@click="toggleSort(col.key)"
								>
									{{ col.label }}
									<i v-if="sortKey === col.key" :class="sortDesc ? 'ti ti-chevron-down' : 'ti ti-chevron-up'"></i>
								</button>
							</div>
							<div
								v-for="m in sortedByModel"
								:key="m.modelId ?? '__null__'"
								:class="[
									$style.modelRow,
									m.unlisted ? $style.modelRowUnlisted : null,
									isDeletedModel(m) ? $style.modelRowDeleted : null,
									selectedModelId === m.modelId ? $style.modelRowSelected : null,
								]"
								@click="onModelRowClick(m)"
							>
								<span :class="$style.modelName">
									{{ modelDisplayName(m) }}
									<span v-if="m.unlisted" :class="$style.unlistedBadge">{{ i18n.ts._agents.adminReportsUnlistedBadge }}</span>
									<span v-else-if="isDeletedModel(m)" :class="$style.deletedBadge">{{ i18n.ts._agents.adminReportsDeletedBadge }}</span>
								</span>
								<span>{{ m.total }}</span>
								<span>{{ pct(m.success, m.total) }}</span>
								<span :class="$style.success">{{ m.freeCalls }}</span>
								<span :class="m.paidCalls > 0 ? $style.aborted : ''">{{ m.paidCalls }}</span>
								<span :class="$style.charged">{{ fmtCredits(m.creditsCharged) }}</span>
								<span>{{ m.uniqueUsers }}</span>
								<span>{{ fmtDuration(m.avgDurationMs) }}</span>
							</div>
						</div>
					</div>
				</template>
			</div>
		</MkFolder>

		<!-- 扣额度 TOP 用户 -->
		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-podium"></i></template>
			<template #label>{{ i18n.ts._agents.adminReportsTopUsers }}</template>
			<MkInfo v-if="data.topUsers.length === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>
			<div v-else :class="$style.modelTableWrap">
				<div :class="$style.topUserTable">
					<div :class="$style.topUserHeader">
						<span>#</span>
						<span>{{ i18n.ts._agents.adminReportsUsersColumn }}</span>
						<span>{{ i18n.ts._agents.adminReportsCallsColumn }}</span>
						<span>{{ i18n.ts._agents.adminReportsFreeColumn }}</span>
						<span>{{ i18n.ts._agents.adminReportsPaidColumn }}</span>
						<span>{{ i18n.ts._agents.adminReportsCreditsCharged }}</span>
					</div>
					<div v-for="(u, idx) in data.topUsers" :key="u.userId" :class="$style.topUserRow">
						<span :class="$style.topUserRank">{{ idx + 1 }}</span>
						<span :class="$style.topUserName">
							{{ u.name ?? u.username }}
							<small :class="$style.muted">@{{ u.username }}</small>
						</span>
						<span>{{ u.total }}</span>
						<span :class="$style.success">{{ u.freeCalls }}</span>
						<span :class="u.paidCalls > 0 ? $style.aborted : ''">{{ u.paidCalls }}</span>
						<span :class="$style.charged">{{ fmtCredits(u.creditsCharged) }}</span>
					</div>
				</div>
			</div>
		</MkFolder>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { Chart } from 'chart.js';
import type { Plugin } from 'chart.js';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { initChart } from '@/utility/init-chart.js';

initChart();

type OverallStats = {
	total: number; success: number; failed: number; aborted: number;
	totalCost: number; uniqueUsers: number;
	freeCalls: number; paidCalls: number; creditsCharged: number;
	avgDurationMs: number | null;
};

type ModelReportRow = {
	modelId: string | null;
	modelName: string | null;
	total: number;
	success: number;
	failed: number;
	aborted: number;
	totalCost: number;
	unlisted: boolean;
	freeCalls: number;
	paidCalls: number;
	creditsCharged: number;
	uniqueUsers: number;
	avgDurationMs: number | null;
};

type ReportsOverview = {
	bucket: 'hour' | 'day';
	since: string;
	until: string;
	overall: OverallStats;
	previousOverall: OverallStats;
	byModel: ModelReportRow[];
	buckets: {
		bucketStart: string; total: number; success: number; failed: number; aborted: number;
		freeCalls: number; paidCalls: number; creditsCharged: number; avgDurationMs: number | null;
	}[];
	byUsageKind: { usageKind: string; total: number; freeCalls: number; paidCalls: number; creditsCharged: number }[];
	billing: { free: number; paid: number; failed: number; byok: number; zeroPriced: number; other: number };
	topUsers: { userId: string; username: string; name: string | null; total: number; freeCalls: number; paidCalls: number; creditsCharged: number }[];
};

const ALL_MODELS = '__all__';
const BYOK_MERGED_MODEL_ID = '__byok_custom_models__';

type RangeKey = 'today' | '24h' | '7d' | '30d' | '90d' | 'thisMonth' | 'lastMonth';

const activeRange = ref<RangeKey>('24h');
const granularity = ref<'hour' | 'day'>('hour');
const selectedModelId = ref<string>(ALL_MODELS);
const loading = ref(false);
const data = ref<ReportsOverview | null>(null);

const rangeOptions = computed(() => [
	{ key: 'today' as const, label: i18n.ts._agents.adminReportsWindowToday },
	{ key: '24h' as const, label: i18n.ts._agents.adminReportsWindow24h },
	{ key: '7d' as const, label: i18n.ts._agents.adminReportsWindow168h },
	{ key: '30d' as const, label: i18n.ts._agents.adminReportsWindow720h },
	{ key: '90d' as const, label: i18n.ts._agents.adminReportsWindow90d },
	{ key: 'thisMonth' as const, label: i18n.ts._agents.adminReportsWindowThisMonth },
	{ key: 'lastMonth' as const, label: i18n.ts._agents.adminReportsWindowLastMonth },
]);

const modelItems = computed(() => [
	{ value: ALL_MODELS, label: i18n.ts._agents.adminReportsAllModels },
	...(data.value?.byModel ?? [])
		.filter(m => m.modelId != null)
		.map(m => ({
			value: m.modelId as string,
			label: modelDisplayName(m) + (isDeletedModel(m) ? `（${i18n.ts._agents.adminReportsDeletedBadge}）` : ''),
		})),
]);

function modelDisplayName(m: { modelId: string | null; modelName: string | null }): string {
	if (m.modelId === BYOK_MERGED_MODEL_ID) return i18n.ts._agents.adminReportsByokCustomModels;
	return m.modelName ?? m.modelId ?? '—';
}

// 当前配置中已不存在的历史模型（已被管理员删除）：只能显示内部 ID，加徽标区分
function isDeletedModel(m: { modelId: string | null; modelName: string | null }): boolean {
	return m.modelId !== BYOK_MERGED_MODEL_ID && m.modelName == null;
}

function buildParams(): Record<string, unknown> {
	const p: Record<string, unknown> = {};
	const now = new Date();
	switch (activeRange.value) {
		case 'today':
			p.since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
			p.bucket = 'hour';
			break;
		case '24h':
			p.hours = 24;
			p.bucket = 'hour';
			break;
		case '7d':
			p.hours = 168;
			p.bucket = granularity.value;
			break;
		case '30d':
			p.hours = 720;
			p.bucket = 'day';
			break;
		case '90d':
			p.hours = 2160;
			p.bucket = 'day';
			break;
		case 'thisMonth':
			p.since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
			p.bucket = 'day';
			break;
		case 'lastMonth':
			p.since = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
			p.until = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
			p.bucket = 'day';
			break;
	}
	if (selectedModelId.value !== ALL_MODELS) p.modelId = selectedModelId.value;
	return p;
}

async function load() {
	loading.value = true;
	try {
		data.value = await misskeyApi('admin/agents/reports/overview' as any, buildParams()) as ReportsOverview;
		await nextTick();
		renderCharts();
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		loading.value = false;
	}
}

function setRange(key: RangeKey) {
	activeRange.value = key;
	load();
}

function setGranularity(g: 'hour' | 'day') {
	if (granularity.value === g) return;
	granularity.value = g;
	load();
}

function onModelRowClick(m: ModelReportRow) {
	if (m.modelId == null) return;
	selectedModelId.value = selectedModelId.value === m.modelId ? ALL_MODELS : m.modelId;
}

watch(selectedModelId, () => {
	load();
});

// ---------- 环比 ----------

type DeltaInfo = { pct: number; dir: 'up' | 'down' | 'flat' } | null;

function deltaPct(cur: number, prev: number): DeltaInfo {
	if (prev <= 0) return null;
	const pct = ((cur - prev) / prev) * 100;
	return { pct, dir: Math.abs(pct) < 0.05 ? 'flat' : (pct > 0 ? 'up' : 'down') };
}

const overallSuccessRate = computed(() => {
	const o = data.value?.overall;
	return o != null && o.total > 0 ? (o.success / o.total) * 100 : null;
});

const previousSuccessRate = computed(() => {
	const o = data.value?.previousOverall;
	return o != null && o.total > 0 ? (o.success / o.total) * 100 : null;
});

// 成功率用百分点（pp）差值而非相对百分比
function deltaPp(cur: number | null, prev: number | null): DeltaInfo {
	if (cur == null || prev == null) return null;
	const pp = cur - prev;
	return { pct: pp, dir: Math.abs(pp) < 0.05 ? 'flat' : (pp > 0 ? 'up' : 'down') };
}

function deltaText(d: DeltaInfo, unit: '%' | 'pp' = '%'): string {
	if (d == null) return '—';
	if (d.dir === 'flat') return unit === 'pp' ? '±0.0pp' : '±0.0%';
	return `${d.dir === 'up' ? '▲' : '▼'} ${Math.abs(d.pct).toFixed(1)}${unit === 'pp' ? 'pp' : '%'}`;
}

// sentiment: good=上升为好（成功率）；bad=上升为坏（失败/中断）；neutral=仅展示方向
// 返回 CSS module 类名键，由模板经 $style[...] 解析（script 中不可直接引用 $style）
function deltaClass(d: DeltaInfo, sentiment: 'good' | 'bad' | 'neutral'): 'deltaGood' | 'deltaBad' | 'deltaNeutral' {
	if (d == null || d.dir === 'flat' || sentiment === 'neutral') return 'deltaNeutral';
	const isGood = sentiment === 'good' ? d.dir === 'up' : d.dir === 'down';
	return isGood ? 'deltaGood' : 'deltaBad';
}

// ---------- 排序（模型表） ----------

type ModelSortKey = 'total' | 'successRate' | 'freeCalls' | 'paidCalls' | 'creditsCharged' | 'uniqueUsers' | 'avgDurationMs';

const sortKey = ref<ModelSortKey>('total');
const sortDesc = ref(true);

const modelSortColumns = computed(() => [
	{ key: 'total' as const, label: i18n.ts._agents.adminReportsRequestsColumn },
	{ key: 'successRate' as const, label: i18n.ts._agents.adminReportsSuccessRate },
	{ key: 'freeCalls' as const, label: i18n.ts._agents.adminReportsFreeColumn },
	{ key: 'paidCalls' as const, label: i18n.ts._agents.adminReportsPaidColumn },
	{ key: 'creditsCharged' as const, label: i18n.ts._agents.adminReportsCreditsCharged },
	{ key: 'uniqueUsers' as const, label: i18n.ts._agents.adminReportsUsersColumn },
	{ key: 'avgDurationMs' as const, label: i18n.ts._agents.adminReportsAvgDuration },
]);

function toggleSort(key: ModelSortKey) {
	if (sortKey.value === key) {
		sortDesc.value = !sortDesc.value;
	} else {
		sortKey.value = key;
		sortDesc.value = true;
	}
}

const sortedByModel = computed(() => {
	const rows = [...(data.value?.byModel ?? [])];
	const key = sortKey.value;
	const val = (m: ModelReportRow): number => {
		switch (key) {
			case 'total': return m.total;
			case 'successRate': return m.total > 0 ? m.success / m.total : -1;
			case 'freeCalls': return m.freeCalls;
			case 'paidCalls': return m.paidCalls;
			case 'creditsCharged': return m.creditsCharged;
			case 'uniqueUsers': return m.uniqueUsers;
			case 'avgDurationMs': return m.avgDurationMs ?? -1;
		}
	};
	rows.sort((a, b) => sortDesc.value ? val(b) - val(a) : val(a) - val(b));
	return rows;
});

// ---------- 计费构成 ----------

const billingColors = ref({ free: '#4caf50', paid: '#f2a03d', failed: '#ec4137', byok: '#64b5f6', zeroPriced: '#4db6ac', other: '#9fb3c8' });

const billingTotal = computed(() => {
	const d = data.value;
	if (d == null) return 0;
	return d.billing.free + d.billing.paid + d.billing.failed + d.billing.byok + d.billing.zeroPriced + d.billing.other;
});

const billingSegments = computed(() => {
	const d = data.value;
	if (d == null) return [];
	const c = billingColors.value;
	return [
		{ key: 'free', label: i18n.ts._agents.adminReportsFreeQuota, value: d.billing.free, color: c.free },
		{ key: 'paid', label: i18n.ts._agents.adminReportsPaidColumn, value: d.billing.paid, color: c.paid },
		{ key: 'zeroPriced', label: i18n.ts._agents.adminReportsZeroPriced, value: d.billing.zeroPriced, color: c.zeroPriced },
		{ key: 'byok', label: i18n.ts._agents.adminReportsByok, value: d.billing.byok, color: c.byok },
		{ key: 'failed', label: i18n.ts._agents.adminReportsFailed, value: d.billing.failed, color: c.failed },
		{ key: 'other', label: i18n.ts._agents.adminReportsOther, value: d.billing.other, color: c.other },
	];
});

// ---------- 图表 ----------

const requestsChartEl = useTemplateRef('requestsChartEl');
const creditsChartEl = useTemplateRef('creditsChartEl');
const latencyChartEl = useTemplateRef('latencyChartEl');
const billingChartEl = useTemplateRef('billingChartEl');
const usageKindChartEl = useTemplateRef('usageKindChartEl');

let requestsChart: Chart | null = null;
let creditsChart: Chart | null = null;
let latencyChart: Chart | null = null;
let billingChart: Chart | null = null;
let usageKindChart: Chart | null = null;

// 计费构成环形图中心文字（总数），由 renderCharts 更新
const billingCenterText = { total: 0, label: '' };

const billingCenterTextPlugin: Plugin<'doughnut'> = {
	id: 'billingCenterText',
	afterDraw(chart) {
		// chart.js 类型未标 undefined，但数据为空时第一个扇区并不存在
		const first = chart.getDatasetMeta(0).data[0] as { x: number; y: number } | undefined;
		if (first == null) return;
		const { x, y } = first;
		const ctx = chart.ctx;
		ctx.save();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = cssColor('--MI_THEME-fg', '#5f6c7b');
		ctx.font = '700 20px sans-serif';
		ctx.fillText(String(billingCenterText.total), x, y - 7);
		ctx.globalAlpha = 0.56;
		ctx.font = '11px sans-serif';
		ctx.fillText(billingCenterText.label, x, y + 12);
		ctx.restore();
	},
};

function cssColor(name: string, fallback: string): string {
	const v = getComputedStyle(window.document.documentElement).getPropertyValue(name).trim();
	return v || fallback;
}

function bucketLabel(iso: string, bucket: 'hour' | 'day', sameDay: boolean): string {
	const d = new Date(iso);
	if (bucket === 'day') return `${d.getMonth() + 1}/${d.getDate()}`;
	const hh = `${d.getHours().toString().padStart(2, '0')}:00`;
	// 全部桶在同一天时省略日期，标签更干净
	return sameDay ? hh : `${d.getMonth() + 1}/${d.getDate()} ${hh}`;
}

function usageKindLabel(kind: string): string {
	switch (kind) {
		case 'chat': return i18n.ts._agents.usageLogKindChat;
		case 'compression': return i18n.ts._agents.usageLogKindCompression;
		case 'image_generation': return i18n.ts._agents.usageLogKindImageGeneration;
		case 'vision': return i18n.ts._agents.usageLogKindVision;
		case 'proactive_random': return i18n.ts._agents.usageLogKindProactiveRandom;
		case 'proactive_scheduled': return i18n.ts._agents.usageLogKindProactiveScheduled;
		default: return kind;
	}
}

function fmtDurationTick(v: number): string {
	return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;
}

function renderCharts() {
	if (data.value == null) return;
	const d = data.value;

	const colors = {
		success: cssColor('--MI_THEME-success', '#4caf50'),
		error: cssColor('--MI_THEME-error', '#ec4137'),
		warn: cssColor('--MI_THEME-warn', '#ecb637'),
		accent: cssColor('--MI_THEME-accent', '#86b300'),
		fg: cssColor('--MI_THEME-fg', '#5f6c7b'),
	};
	billingColors.value = {
		free: colors.success,
		paid: cssColor('--MI_THEME-warn', '#f2a03d'),
		failed: colors.error,
		byok: '#64b5f6',
		zeroPriced: '#4db6ac',
		other: '#9fb3c8',
	};

	// 全部桶在同一天时 X 标签只显示时刻
	const bucketDates = d.buckets.map(b => new Date(b.bucketStart));
	const sameDay = d.bucket === 'hour' && bucketDates.length > 0 && bucketDates.every(dt =>
		dt.getFullYear() === bucketDates[0].getFullYear() &&
		dt.getMonth() === bucketDates[0].getMonth() &&
		dt.getDate() === bucketDates[0].getDate());
	const labels = d.buckets.map(b => bucketLabel(b.bucketStart, d.bucket, sameDay));
	const gridColor = 'rgba(128, 128, 128, 0.15)';
	// 成功率折线用对比蓝：与成功绿/失败红/中断黄及主题 accent 都拉开
	const rateColor = '#64b5f6';

	// 请求量趋势：成功/失败/中断堆叠柱 + 成功率折线（右轴）
	if (requestsChart == null && requestsChartEl.value != null) {
		requestsChart = new Chart(requestsChartEl.value, {
			data: {
				labels: [],
				datasets: [
					{ type: 'bar', label: i18n.ts._agents.adminReportsSuccess, backgroundColor: colors.success, data: [], stack: 'status', pointStyle: 'rect' },
					{ type: 'bar', label: i18n.ts._agents.adminReportsFailed, backgroundColor: colors.error, data: [], stack: 'status', pointStyle: 'rect' },
					{ type: 'bar', label: i18n.ts._agents.adminReportsAborted, backgroundColor: colors.warn, data: [], stack: 'status', pointStyle: 'rect' },
					{
						type: 'line',
						label: i18n.ts._agents.adminReportsSuccessRate,
						borderColor: rateColor,
						backgroundColor: rateColor,
						pointRadius: 2,
						pointHoverRadius: 4,
						borderWidth: 2,
						tension: 0.3,
						spanGaps: true,
						yAxisID: 'y1',
						pointStyle: 'line',
						// chart.js 按 order 升序排序后倒序绘制：order 越小越后画（越上层），折线置顶不被柱子遮挡
						order: -1,
						data: [],
					},
				],
			},
			options: {
				aspectRatio: 2.8,
				scales: {
					x: {
						stacked: true,
						grid: { display: false },
						ticks: { color: colors.fg, maxTicksLimit: 12, maxRotation: 0 },
					},
					y: {
						stacked: true,
						beginAtZero: true,
						ticks: { color: colors.fg, precision: 0 },
						grid: { color: gridColor },
					},
					y1: {
						position: 'right',
						min: 0,
						max: 100,
						grid: { drawOnChartArea: false },
						ticks: { color: rateColor, callback: (v) => `${v}%` },
					},
				},
				plugins: {
					legend: { position: 'bottom', labels: { color: colors.fg, boxWidth: 12, usePointStyle: true } },
				},
			},
		});
	}
	if (requestsChart != null) {
		requestsChart.data.labels = labels;
		requestsChart.data.datasets[0].data = d.buckets.map(b => b.success);
		requestsChart.data.datasets[1].data = d.buckets.map(b => b.failed);
		requestsChart.data.datasets[2].data = d.buckets.map(b => b.aborted);
		requestsChart.data.datasets[3].data = d.buckets.map(b => b.total > 0 ? Math.round((b.success / b.total) * 1000) / 10 : null);
		// 热更新下旧实例配置不会重建，更新数据时同步绘制层级
		requestsChart.data.datasets[3].order = -1;
		requestsChart.update();
	}

	// 扣减额度趋势（柱状）
	if (creditsChart == null && creditsChartEl.value != null) {
		creditsChart = new Chart(creditsChartEl.value, {
			type: 'bar',
			data: {
				labels: [],
				datasets: [{ label: i18n.ts._agents.adminReportsCreditsCharged, backgroundColor: colors.accent, data: [] }],
			},
			options: {
				aspectRatio: 2.2,
				scales: {
					x: {
						grid: { display: false },
						ticks: { color: colors.fg, maxTicksLimit: 10, maxRotation: 0 },
					},
					y: {
						beginAtZero: true,
						ticks: { color: colors.fg },
						grid: { color: gridColor },
					},
				},
				plugins: {
					legend: { display: false },
				},
			},
		});
	}
	if (creditsChart != null) {
		creditsChart.data.labels = labels;
		creditsChart.data.datasets[0].data = d.buckets.map(b => b.creditsCharged);
		creditsChart.update();
	}

	// 平均耗时趋势（折线）
	if (latencyChart == null && latencyChartEl.value != null) {
		latencyChart = new Chart(latencyChartEl.value, {
			type: 'line',
			data: {
				labels: [],
				datasets: [{
					label: i18n.ts._agents.adminReportsAvgDuration,
					borderColor: colors.warn,
					backgroundColor: colors.warn,
					pointRadius: 0,
					borderWidth: 2,
					tension: 0.3,
					spanGaps: true,
					data: [],
				}],
			},
			options: {
				aspectRatio: 2.2,
				scales: {
					x: {
						grid: { display: false },
						ticks: { color: colors.fg, maxTicksLimit: 10, maxRotation: 0 },
					},
					y: {
						beginAtZero: true,
						ticks: { color: colors.fg, callback: (v) => fmtDurationTick(Number(v)) },
						grid: { color: gridColor },
					},
				},
				plugins: {
					legend: { display: false },
					tooltip: {
						callbacks: {
							label: (ctx) => ` ${fmtDuration(ctx.parsed.y)}`,
						},
					},
				},
			},
		});
	}
	if (latencyChart != null) {
		latencyChart.data.labels = labels;
		latencyChart.data.datasets[0].data = d.buckets.map(b => b.avgDurationMs);
		latencyChart.update();
	}

	// 计费构成（环形 + 中心总数）
	if (billingChart == null && billingChartEl.value != null) {
		billingChart = new Chart(billingChartEl.value, {
			type: 'doughnut',
			data: {
				labels: billingSegments.value.map(s => s.label),
				datasets: [{
					data: [],
					backgroundColor: billingSegments.value.map(s => s.color),
					borderWidth: 0,
				}],
			},
			options: {
				aspectRatio: 1.7,
				cutout: '62%',
				plugins: {
					// 使用下方 HTML 明细图例（含次数与占比）
					legend: { display: false },
				},
			},
			plugins: [billingCenterTextPlugin],
		});
	}
	if (billingChart != null) {
		billingChart.data.labels = billingSegments.value.map(s => s.label);
		billingChart.data.datasets[0].data = billingSegments.value.map(s => s.value);
		billingChart.data.datasets[0].backgroundColor = billingSegments.value.map(s => s.color);
		billingCenterText.total = billingTotal.value;
		billingCenterText.label = i18n.ts._agents.adminReportsTotal;
		billingChart.update();
	}

	// 用途构成（横向条形）
	if (usageKindChart == null && usageKindChartEl.value != null) {
		usageKindChart = new Chart(usageKindChartEl.value, {
			type: 'bar',
			data: {
				labels: [],
				datasets: [{ label: i18n.ts._agents.adminReportsCallsColumn, backgroundColor: colors.accent, data: [] }],
			},
			options: {
				indexAxis: 'y',
				aspectRatio: 1.7,
				scales: {
					x: {
						beginAtZero: true,
						ticks: { color: colors.fg, precision: 0 },
						grid: { color: gridColor },
					},
					y: {
						grid: { display: false },
						ticks: { color: colors.fg },
					},
				},
				plugins: {
					legend: { display: false },
				},
			},
		});
	}
	if (usageKindChart != null) {
		usageKindChart.data.labels = d.byUsageKind.map(k => usageKindLabel(k.usageKind));
		usageKindChart.data.datasets[0].data = d.byUsageKind.map(k => k.total);
		usageKindChart.update();
	}
}

function destroyCharts() {
	requestsChart?.destroy();
	creditsChart?.destroy();
	latencyChart?.destroy();
	billingChart?.destroy();
	usageKindChart?.destroy();
	requestsChart = null;
	creditsChart = null;
	latencyChart = null;
	billingChart = null;
	usageKindChart = null;
}

// ---------- 格式化 ----------

function pct(part: number, total: number): string {
	return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : '—';
}

function fmtCredits(n: number): string {
	return n.toFixed(4);
}

function fmtDuration(ms: number | null): string {
	if (ms == null) return '—';
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

onMounted(() => {
	load();
});

onBeforeUnmount(() => {
	destroyCharts();
});
</script>

<style lang="scss" module>
.toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	flex-wrap: wrap;
}

.rangeBtns {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
}

.pillBtn {
	padding: 5px 14px;
	border-radius: 999px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	font-size: 0.88em;
	font-weight: 600;
	cursor: pointer;
	transition: background 0.15s, border-color 0.15s;

	&:hover {
		border-color: var(--MI_THEME-accent);
	}
}

.pillBtnActive {
	background: var(--MI_THEME-accent);
	border-color: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent, #fff);
}

.toolbarRight {
	display: flex;
	align-items: center;
	gap: 8px;
}

.modelSelect {
	min-width: 180px;
}

.content {
	transition: opacity 0.15s;
}

.contentLoading {
	opacity: 0.55;
	pointer-events: none;
}

.summaryGrid {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 12px;

	@media (max-width: 700px) {
		grid-template-columns: repeat(2, 1fr);
	}
}

.summaryCard {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	padding: 16px 12px;
	border-radius: var(--MI-radius);
	text-align: center;
}

.summaryCardLabel {
	font-size: 0.78em;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	opacity: 0.56;
}

.summaryCardValue {
	font-size: 1.5em;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.summaryCardSub {
	font-size: 0.75em;
	font-variant-numeric: tabular-nums;
	min-height: 1.2em;
}

.deltaNeutral {
	opacity: 0.56;
}

.deltaGood {
	color: var(--MI_THEME-success);
	font-weight: 600;
}

.deltaBad {
	color: var(--MI_THEME-error);
	font-weight: 600;
}

.success {
	color: var(--MI_THEME-success);
}

.failed {
	color: var(--MI_THEME-error);
}

.aborted {
	color: var(--MI_THEME-warn);
}

.charged {
	color: var(--MI_THEME-accent);
}

.granularityRow {
	display: flex;
	gap: 6px;
}

.chartBox {
	position: relative;
	width: 100%;
}

.chartBoxSquare {
	position: relative;
	width: 100%;
	max-width: 420px;
	margin: 0 auto;
}

.compositionRow {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 16px;

	@media (max-width: 700px) {
		grid-template-columns: 1fr;
	}
}

.compositionItem {
	min-width: 0;
}

.doughnutLegend {
	display: flex;
	flex-direction: column;
	gap: 6px;
	max-width: 420px;
	margin: 8px auto 0;
}

.doughnutLegendRow {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 0.85em;
	font-variant-numeric: tabular-nums;
}

.legendDot {
	flex-shrink: 0;
	display: inline-block;
	width: 10px;
	height: 10px;
	border-radius: 3px;
}

.legendLabel {
	font-weight: 600;
}

.legendValue {
	margin-left: auto;
	opacity: 0.72;
}

.tableHint {
	font-size: 0.8em;
	opacity: 0.56;
	display: flex;
	align-items: center;
	gap: 6px;
}

.modelTableWrap {
	overflow-x: auto;
	border-radius: 10px;
	border: solid 1px var(--MI_THEME-divider);
}

.modelTable {
	display: flex;
	flex-direction: column;
	min-width: 720px;
}

.modelHeader {
	display: grid;
	grid-template-columns: 2fr 0.7fr 0.8fr 0.6fr 0.6fr 1fr 0.6fr 0.8fr;
	padding: 8px 14px;
	font-size: 0.78em;
	font-weight: 600;
	opacity: 0.56;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	background: var(--MI_THEME-panel);
	border-bottom: solid 1px var(--MI_THEME-divider);
	align-items: center;
}

.sortHeader {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	border: none;
	background: none;
	color: inherit;
	font: inherit;
	text-transform: inherit;
	letter-spacing: inherit;
	cursor: pointer;
	padding: 0;
	text-align: left;

	&:hover {
		color: var(--MI_THEME-accent);
	}
}

.sortHeaderActive {
	color: var(--MI_THEME-accent);
	opacity: 1;
}

.modelRow {
	display: grid;
	grid-template-columns: 2fr 0.7fr 0.8fr 0.6fr 0.6fr 1fr 0.6fr 0.8fr;
	padding: 9px 14px;
	font-size: 0.88em;
	align-items: center;
	cursor: pointer;
	font-variant-numeric: tabular-nums;

	&:not(:last-child) {
		border-bottom: solid 1px var(--MI_THEME-divider);
	}

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 6%, transparent);
	}
}

.modelRowUnlisted {
	opacity: 0.72;
	background: color-mix(in srgb, var(--MI_THEME-panel) 88%, var(--MI_THEME-warn) 12%);
}

.modelRowDeleted {
	opacity: 0.55;
}

.modelRowSelected {
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
	box-shadow: inset 3px 0 0 var(--MI_THEME-accent);
}

.modelName {
	display: flex;
	align-items: center;
	gap: 8px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: 600;
}

.unlistedBadge {
	flex-shrink: 0;
	padding: 2px 7px;
	border-radius: 999px;
	font-size: 0.75em;
	font-weight: 600;
	background: var(--MI_THEME-warn);
	color: var(--MI_THEME-fgOnWarn, #fff);
}

.deletedBadge {
	flex-shrink: 0;
	padding: 2px 7px;
	border-radius: 999px;
	font-size: 0.75em;
	font-weight: 600;
	background: color-mix(in srgb, var(--MI_THEME-fg) 25%, transparent);
	color: var(--MI_THEME-fg);
}

.topUserTable {
	display: flex;
	flex-direction: column;
	min-width: 560px;
}

.topUserHeader {
	display: grid;
	grid-template-columns: 0.4fr 2fr 0.8fr 0.7fr 0.7fr 1fr;
	padding: 8px 14px;
	font-size: 0.78em;
	font-weight: 600;
	opacity: 0.56;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	background: var(--MI_THEME-panel);
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.topUserRow {
	display: grid;
	grid-template-columns: 0.4fr 2fr 0.8fr 0.7fr 0.7fr 1fr;
	padding: 9px 14px;
	font-size: 0.88em;
	align-items: center;
	font-variant-numeric: tabular-nums;

	&:not(:last-child) {
		border-bottom: solid 1px var(--MI_THEME-divider);
	}
}

.topUserRank {
	font-weight: 700;
	opacity: 0.72;
}

.topUserName {
	display: flex;
	align-items: baseline;
	gap: 8px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: 600;
}

.muted {
	opacity: 0.56;
	font-weight: 400;
}
</style>
