<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<div :class="$style.toolbar">
		<div :class="$style.rangeBtns">
			<button
				v-for="r in rangeOptions"
				:key="r.hours"
				type="button"
				class="_button"
				:class="[$style.pillBtn, hours === r.hours ? $style.pillBtnActive : null]"
				@click="setRange(r.hours)"
			>
				{{ r.label }}
			</button>
		</div>
			<MkButton rounded :disabled="loading" @click="reloadAll"><i class="ti ti-refresh"></i> {{ i18n.ts.reload }}</MkButton>
	</div>

	<MkLoading v-if="loading && data == null"/>
	<MkInfo v-else-if="data == null" warn>{{ i18n.ts._agents.adminReportsLoadFailed }}</MkInfo>
	<template v-else>
		<div :class="$style.summary">
			<div :class="[$style.card, $style.cardBalance]">
				<div :class="$style.cardIcon"><i class="ti ti-wallet"></i></div>
				<div :class="$style.cardBody">
					<div :class="$style.cardValue">{{ data.creditBalance.toFixed(2) }}</div>
					<div :class="$style.cardLabel">{{ i18n.ts._agents.myStatsCreditBalance }}</div>
				</div>
			</div>
			<div :class="[$style.card, $style.cardRequests]">
				<div :class="$style.cardIcon"><i class="ti ti-send"></i></div>
				<div :class="$style.cardBody">
					<div :class="$style.cardValue"><MkNumber :value="data.overall.total"/></div>
					<div :class="$style.cardLabel">{{ i18n.ts._agents.adminReportsTotal }}</div>
				</div>
			</div>
			<div :class="[$style.card, $style.cardRate]">
				<div :class="$style.cardIcon"><i class="ti ti-circle-check"></i></div>
				<div :class="$style.cardBody">
					<div :class="$style.cardValue">{{ data.overall.total > 0 ? ((data.overall.success / data.overall.total) * 100).toFixed(1) + '%' : '—' }}</div>
					<div :class="$style.cardLabel">{{ i18n.ts._agents.adminReportsSuccessRate }}</div>
				</div>
			</div>
			<div :class="[$style.card, $style.cardCost]">
				<div :class="$style.cardIcon"><i class="ti ti-coin"></i></div>
				<div :class="$style.cardBody">
					<div :class="$style.cardValue">{{ data.overall.creditsCharged.toFixed(4) }}</div>
					<div :class="$style.cardLabel">{{ i18n.ts._agents.adminReportsCreditsCharged }}</div>
				</div>
			</div>
		</div>

		<MkFolder :defaultOpen="true" @opened="renderCharts">
			<template #icon><i class="ti ti-chart-line"></i></template>
			<template #label>{{ i18n.ts._agents.myStatsCharts }}（{{ rangeLabel }}）</template>
			<div class="_gaps_m">
				<div>
					<div :class="$style.chartLabel">{{ i18n.ts._agents.adminReportsRequestsTrend }}</div>
					<MkInfo v-if="data.buckets.length === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>
					<div v-else :class="$style.chartBox"><canvas ref="requestsChartEl"></canvas></div>
				</div>
				<div>
					<div :class="$style.chartLabel">{{ i18n.ts._agents.adminReportsCreditsTrend }}</div>
					<MkInfo v-if="data.buckets.length === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>
					<div v-else :class="$style.chartBox"><canvas ref="creditsChartEl"></canvas></div>
				</div>
				<div>
					<div :class="$style.chartLabel">{{ i18n.ts._agents.myStatsTokensTrend }}</div>
					<MkInfo v-if="data.buckets.length === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>
					<div v-else :class="$style.chartBox"><canvas ref="tokensChartEl"></canvas></div>
				</div>
				<div>
					<div :class="$style.chartLabel">{{ i18n.ts._agents.adminReportsUsageKindComposition }}</div>
					<MkInfo v-if="usageKindTotal === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>
					<div v-else :class="$style.chartBoxDoughnut"><canvas ref="usageKindChartEl"></canvas></div>
				</div>
			</div>
		</MkFolder>

		<MkAgentUsageDetailsForAdmin ref="detailsRef" :userId="props.userId" :hours="hours" :rangeLabel="rangeLabel">
			<template #recentLogs>
				<MkFolder :defaultOpen="false" @opened="onLogsFolderOpened">
					<template #icon><i class="ti ti-history"></i></template>
					<template #label>{{ i18n.ts._agents.myStatsRecentLogs }}（{{ data.recentLogsTotal }}）</template>
					<MkLoading v-if="logsLoading && logsItems.length === 0"/>
					<MkInfo v-else-if="logsItems.length === 0">{{ i18n.ts._agents.myStatsNoLogs }}</MkInfo>
					<template v-else>
						<div :class="[$style.table, $style.logCols]">
							<div :class="[$style.row, $style.headRow]">
								<span>{{ i18n.ts._agents.myStatsTime }}</span>
								<span>{{ i18n.ts._agents.myStatsUsageKind }}</span>
								<span>{{ i18n.ts._agents.myStatsModel }}</span>
								<span :class="$style.num">{{ i18n.ts._agents.myStatsStatus }}</span>
								<span :class="$style.num">{{ i18n.ts._agents.myStatsDuration }}</span>
								<span :class="$style.num">{{ i18n.ts._agents.myStatsCost }}</span>
							</div>
							<div v-for="log in logsItems" :key="log.id" :class="$style.row">
								<span :class="$style.name"><MkTime :time="log.requestedAt" mode="detail"/></span>
								<span :class="$style.name">{{ usageKindLabel(log.usageKind) }}</span>
								<span :class="$style.name" :title="log.modelName ?? log.modelApiName ?? undefined">
									{{ log.modelName ?? (log.modelApiName ?? '—') }}
									<span v-if="log.modelSource === 'user'" :class="$style.customBadge">{{ i18n.ts._agents.byokCustomBadge }}</span>
								</span>
								<span :class="$style.num">
									<span :class="[$style.badge, log.status === 'pending' ? $style.badgePending : log.status === 'success' ? $style.badgeOk : log.status === 'failed' ? $style.badgeErr : $style.badgeWarn]">{{ statusLabel(log.status) }}</span>
								</span>
								<span :class="$style.num">{{ log.durationMs != null ? (log.durationMs / 1000).toFixed(1) + 's' : '—' }}</span>
								<span :class="$style.num">
									<template v-if="log.usedFreeQuota === true">{{ i18n.ts._agents.adminReportsFreeQuota }} {{ log.freeQuotaUsedAtCall }}/{{ log.freeQuotaTotalAtCall }}</template>
									<template v-else>{{ log.cost.toFixed(4) }}</template>
								</span>
							</div>
						</div>
						<div :class="$style.pagerBar">
							<div :class="$style.pageSizes">
								<button
									v-for="size in pageSizeOptions"
									:key="size"
									type="button"
									class="_button"
									:class="[$style.pagerSizeBtn, logsPageSize === size ? $style.pagerSizeBtnActive : null]"
									@click="setLogsPageSize(size)"
								>
									{{ size }}
								</button>
							</div>
							<button
								type="button"
								class="_button"
								:class="$style.pagerNavBtn"
								:disabled="logsPage <= 1 || logsLoading"
								@click="loadLogs(logsPage - 1)"
							>
								<i class="ti ti-chevron-left"></i>
							</button>
							<span :class="$style.pagerText">{{ logsPage }} / {{ logsTotalPages }}</span>
							<button
								type="button"
								class="_button"
								:class="$style.pagerNavBtn"
								:disabled="logsPage >= logsTotalPages || logsLoading"
								@click="loadLogs(logsPage + 1)"
							>
								<i class="ti ti-chevron-right"></i>
							</button>
						</div>
					</template>
				</MkFolder>
			</template>
		</MkAgentUsageDetailsForAdmin>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkAgentUsageDetailsForAdmin from '@/components/MkAgentUsageDetailsForAdmin.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkNumber from '@/components/MkNumber.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { AgentUsageCharts, agentUsageKindLabel } from '@/utility/agent-usage-charts.js';
import type { AgentUsageBucket, AgentUsageKindRow } from '@/utility/agent-usage-charts.js';
import { initChart } from '@/utility/init-chart.js';

initChart();

type UsageKind = 'chat' | 'compression' | 'image_generation' | 'vision' | 'sticker_description' | 'proactive_random' | 'proactive_scheduled' | 'checkin' | 'admin_reward' | 'admin_compensation' | 'credit_migration';

type UsageLogStatus = 'pending' | 'success' | 'failed' | 'aborted';

type UsageLogItem = {
	id: string;
	requestedAt: string;
	completedAt: string | null;
	durationMs: number | null;
	modelId: string | null;
	modelName: string | null;
	modelSource: 'official' | 'user' | null;
	modelApiName: string | null;
	usageKind: UsageKind;
	status: UsageLogStatus;
	cost: number;
	promptTokens: number | null;
	completionTokens: number | null;
	usedFreeQuota: boolean | null;
	freeQuotaUsedAtCall: number | null;
	freeQuotaTotalAtCall: number | null;
};

type UsageLogsResponse = {
	items: UsageLogItem[];
	total: number;
	page: number;
	pageSize: number;
};

type ModelStat = {
	modelId: string | null;
	modelName: string | null;
	modelSource: 'official' | 'user' | null;
	total: number;
	success: number;
	failed: number;
	aborted: number;
	totalCost: number;
	freeCalls: number;
	paidCalls: number;
	creditsCharged: number;
	avgDurationMs: number | null;
};

type UsageResponse = {
	creditBalance: number;
	since: string;
	hours: number;
	overall: {
		total: number;
		success: number;
		failed: number;
		aborted: number;
		totalCost: number;
		freeCalls: number;
		paidCalls: number;
		creditsCharged: number;
		avgDurationMs: number | null;
	};
	byModel: ModelStat[];
	recentLogsTotal: number;
	bucket: 'hour' | 'day';
	buckets: AgentUsageBucket[];
	byUsageKind: AgentUsageKindRow[];
};

const props = defineProps<{
	userId: string;
}>();

const rangeOptions = [
	{ hours: 24, label: i18n.ts._agents.adminReportsWindow24h },
	{ hours: 168, label: i18n.ts._agents.adminReportsWindow168h },
	{ hours: 720, label: i18n.ts._agents.adminReportsWindow720h },
	{ hours: 2160, label: i18n.ts._agents.adminReportsWindow90d },
];

const hours = ref(720);
const rangeLabel = computed(() => rangeOptions.find(r => r.hours === hours.value)?.label ?? '');
const data = ref<UsageResponse | null>(null);
const loading = ref(false);
const usageKindTotal = computed(() => (data.value?.byUsageKind ?? []).reduce((s, k) => s + k.total, 0));
const detailsRef = useTemplateRef('detailsRef');

// 最近请求记录：与消费日志同款的页码翻页（端点未再生成 misskey-js 类型，按 fork 惯例强转）
const pageSizeOptions = [10, 20, 50] as const;
const logsItems = ref<UsageLogItem[]>([]);
const logsLoading = ref(false);
const logsLoaded = ref(false);
const logsPage = ref(1);
const logsTotal = ref(0);
const logsPageSize = ref(20);
const logsTotalPages = computed(() => Math.max(1, Math.ceil(logsTotal.value / logsPageSize.value)));

async function loadLogs(page: number) {
	logsLoading.value = true;
	try {
		const response = await misskeyApi('admin/users/agent-usage-logs' as any, {
			userId: props.userId,
			page,
			pageSize: logsPageSize.value,
		}) as UsageLogsResponse;
		logsItems.value = response.items;
		logsTotal.value = response.total;
		logsPage.value = response.page;
		logsLoaded.value = true;
	} finally {
		logsLoading.value = false;
	}
}

function setLogsPageSize(pageSize: number) {
	if (logsPageSize.value === pageSize) return;
	logsPageSize.value = pageSize;
	loadLogs(1);
}

// MkFolder 懒挂载：首次展开时才拉取，避免进入页面就多发请求
function onLogsFolderOpened() {
	if (logsLoaded.value || logsLoading.value) return;
	loadLogs(1);
}

const requestsChartEl = useTemplateRef('requestsChartEl');
const creditsChartEl = useTemplateRef('creditsChartEl');
const tokensChartEl = useTemplateRef('tokensChartEl');
const usageKindChartEl = useTemplateRef('usageKindChartEl');
const charts = new AgentUsageCharts({
	get requests() { return requestsChartEl.value; },
	get credits() { return creditsChartEl.value; },
	get tokens() { return tokensChartEl.value; },
	get usageKind() { return usageKindChartEl.value; },
});

async function renderCharts() {
	await nextTick();
	if (data.value != null) {
		charts.render(data.value.buckets, data.value.bucket, data.value.byUsageKind);
	}
}

async function fetchUsage(): Promise<UsageResponse> {
	return await misskeyApi('admin/users/agent-usage' as any, {
		userId: props.userId,
		hours: hours.value,
	}) as UsageResponse;
}

async function loadAll() {
	loading.value = true;
	try {
		data.value = await fetchUsage();
		await renderCharts();
	} finally {
		loading.value = false;
	}
}

async function reloadAll() {
	await Promise.all([
		loadAll(),
		detailsRef.value?.reload(),
		// 折叠夹未展开过则无数据可刷
		logsLoaded.value ? loadLogs(logsPage.value) : Promise.resolve(),
	]);
}

function setRange(h: number) {
	if (hours.value === h) return;
	hours.value = h;
	loadAll();
}

function usageKindLabel(kind: UsageKind): string {
	return agentUsageKindLabel(kind);
}

function statusLabel(status: UsageLogStatus): string {
	const t = i18n.ts._agents;
	if (status === 'pending') return t.myStatsStatusPending;
	if (status === 'success') return t.myStatsStatusSuccess;
	if (status === 'failed') return t.myStatsStatusFailed;
	return t.myStatsStatusAborted;
}

onMounted(loadAll);

onBeforeUnmount(() => {
	charts.destroy();
});
</script>

<style lang="scss" module>
.toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.rangeBtns {
	display: inline-flex;
	gap: 6px;
	flex-wrap: wrap;
}

.pillBtn {
	padding: 5px 12px;
	border-radius: 999px;
	font-size: 0.85em;
	font-weight: 600;
	color: var(--MI_THEME-fgTransparentWeak);
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.pillBtnActive {
	color: var(--MI_THEME-accent);
	border-color: color-mix(in srgb, var(--MI_THEME-accent) 40%, var(--MI_THEME-divider));
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
}

.summary {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
	gap: 12px;
}

.card {
	display: flex;
	align-items: center;
	gap: 12px;
	box-sizing: border-box;
	padding: 12px;
	border-radius: 12px;
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
}

.cardIcon {
	flex-shrink: 0;
	display: grid;
	place-items: center;
	width: 40px;
	height: 40px;
	border-radius: 10px;
	font-size: 1.2em;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.cardBody {
	min-width: 0;
	flex: 1;
}

.cardValue {
	font-size: 1.25em;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	line-height: 1.2;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.cardLabel {
	font-size: 0.8em;
	opacity: 0.6;
	margin-top: 2px;
}

.cardBalance .cardIcon { background: color-mix(in srgb, var(--MI_THEME-accent) 18%, transparent); color: var(--MI_THEME-accent); }
.cardRequests .cardIcon { background: #0088d726; color: #3d96c1; }
.cardRate .cardIcon { background: #86b30026; color: #86b300; }
.cardCost .cardIcon { background: #e96b0026; color: #d76d00; }

/*
 * 表级单一 grid + 行 display:contents：列宽按全表内容 max-content 计算并跨行对齐，
 * 内容超宽时整个表格横向滚动，任何情况下都不截断省略。
 */
.table {
	display: grid;
	border-radius: 12px;
	overflow-x: auto;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}

.row {
	display: contents;
	font-size: 0.9em;

	> * {
		display: flex;
		align-items: center;
		padding: 10px 4px;
		border-bottom: solid 1px var(--MI_THEME-divider);
		white-space: nowrap;
	}

	> *:first-child {
		padding-left: 14px;
	}

	> *:last-child {
		padding-right: 14px;
	}

	&:last-child > * {
		border-bottom: none;
	}
}

.headRow {
	font-size: 0.76em;

	> * {
		padding-top: 8px;
		padding-bottom: 8px;
		font-weight: 600;
		opacity: 0.56;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		background: color-mix(in srgb, var(--MI_THEME-panel) 70%, var(--MI_THEME-divider));
	}
}

.logCols {
	grid-template-columns: minmax(max-content, 1.4fr) minmax(max-content, 0.8fr) minmax(max-content, 1.2fr) minmax(max-content, 0.8fr) minmax(max-content, 0.7fr) minmax(max-content, 0.9fr);
}

.name {
	font-weight: 500;
}

.num {
	justify-content: flex-end;
	font-variant-numeric: tabular-nums;
}

.colorOk { color: var(--MI_THEME-success); }
.colorErr { color: var(--MI_THEME-error); }
.colorWarn { color: var(--MI_THEME-warn); }

.chartLabel {
	font-size: 0.85em;
	font-weight: 600;
	opacity: 0.7;
	margin-bottom: 6px;
}

.chartBox {
	position: relative;
}

.chartBoxDoughnut {
	position: relative;
	max-width: 460px;
	margin-inline: auto;
}

.badge {
	display: inline-block;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 0.82em;
	font-weight: 600;
	line-height: 1.3;
}

.badgeOk {
	color: var(--MI_THEME-success);
	background: color-mix(in srgb, var(--MI_THEME-success) 18%, transparent);
}

.badgeErr {
	color: var(--MI_THEME-error);
	background: color-mix(in srgb, var(--MI_THEME-error) 18%, transparent);
}

.badgeWarn {
	color: var(--MI_THEME-warn);
	background: color-mix(in srgb, var(--MI_THEME-warn) 18%, transparent);
}

.badgePending {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 18%, transparent);
}

.pagerBar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 10px 0 4px;
}

.pageSizes {
	display: inline-flex;
	overflow: hidden;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
}

.pagerSizeBtn {
	min-width: 36px;
	height: 28px;
	padding: 0 8px;
	border-right: solid 1px var(--MI_THEME-divider);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.82em;
	font-weight: 600;
}

.pagerSizeBtn:last-child {
	border-right: none;
}

.pagerSizeBtnActive {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
}

.pagerNavBtn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 6px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
}

.pagerNavBtn:disabled {
	opacity: 0.4;
}

.pagerText {
	font-size: 0.85em;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	min-width: 4em;
	text-align: center;
}

.customBadge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	height: 20px;
	padding: 0 8px;
	margin-left: 6px;
	border-radius: 999px;
	font-size: 0.74em;
	font-weight: 700;
	line-height: 1;
	vertical-align: middle;
	flex-shrink: 0;
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, var(--MI_THEME-panel));
	color: var(--MI_THEME-accent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 34%, var(--MI_THEME-divider));
}
</style>
