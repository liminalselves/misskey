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
		<MkButton rounded :disabled="loading" @click="loadAll"><i class="ti ti-refresh"></i> {{ i18n.ts.reload }}</MkButton>
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

		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-chart-bar"></i></template>
			<template #label>{{ i18n.ts._agents.adminReportsByModel }}（{{ rangeLabel }}）</template>
			<MkInfo v-if="data.byModel.length === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>
			<div v-else :class="$style.table">
				<div :class="[$style.row, $style.headRow, $style.modelCols]">
					<span>{{ i18n.ts._agents.myStatsModel }}</span>
					<span :class="$style.num">{{ i18n.ts._agents.adminReportsRequestsColumn }}</span>
					<span :class="$style.num">{{ i18n.ts._agents.myStatsStatusSuccess }}</span>
					<span :class="$style.num">{{ i18n.ts._agents.myStatsStatusFailed }}</span>
					<span :class="$style.num">{{ i18n.ts._agents.myStatsStatusAborted }}</span>
					<span :class="$style.num">{{ i18n.ts._agents.adminReportsFreeColumn }}</span>
					<span :class="$style.num">{{ i18n.ts._agents.myStatsCost }}</span>
				</div>
				<div v-for="m in data.byModel" :key="m.modelId ?? '__null__'" :class="[$style.row, $style.rowData, $style.modelCols]">
					<span :class="$style.name" :title="m.modelName ?? undefined">
						{{ m.modelName ?? '—' }}
						<span v-if="m.modelSource === 'user'" :class="$style.customBadge">{{ i18n.ts._agents.byokCustomBadge }}</span>
					</span>
					<span :class="$style.num">{{ m.total }}</span>
					<span :class="[$style.num, $style.colorOk]">{{ m.success }}</span>
					<span :class="[$style.num, m.failed > 0 ? $style.colorErr : null]">{{ m.failed }}</span>
					<span :class="[$style.num, m.aborted > 0 ? $style.colorWarn : null]">{{ m.aborted }}</span>
					<span :class="$style.num">{{ m.freeCalls > 0 ? m.freeCalls : '—' }}</span>
					<span :class="$style.num">{{ m.creditsCharged.toFixed(4) }}</span>
				</div>
			</div>
		</MkFolder>

		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-history"></i></template>
			<template #label>{{ i18n.ts._agents.myStatsRecentLogs }}（{{ data.recentLogsTotal }}）</template>
			<MkInfo v-if="data.recentLogs.length === 0">{{ i18n.ts._agents.myStatsNoLogs }}</MkInfo>
			<template v-else>
				<div :class="$style.table">
					<div :class="[$style.row, $style.headRow, $style.logCols]">
						<span>{{ i18n.ts._agents.myStatsTime }}</span>
						<span>{{ i18n.ts._agents.myStatsUsageKind }}</span>
						<span>{{ i18n.ts._agents.myStatsModel }}</span>
						<span :class="$style.num">{{ i18n.ts._agents.myStatsStatus }}</span>
						<span :class="$style.num">{{ i18n.ts._agents.myStatsDuration }}</span>
						<span :class="$style.num">{{ i18n.ts._agents.myStatsCost }}</span>
					</div>
					<div v-for="log in data.recentLogs" :key="log.id" :class="[$style.row, $style.rowData, $style.logCols]">
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
					<button
						type="button"
						class="_button"
						:class="$style.pagerNavBtn"
						:disabled="logsPage <= 1 || loading"
						@click="loadLogs(logsPage - 1)"
					>
						<i class="ti ti-chevron-left"></i>
					</button>
					<span :class="$style.pagerText">{{ logsPage }} / {{ logsTotalPages }}</span>
					<button
						type="button"
						class="_button"
						:class="$style.pagerNavBtn"
						:disabled="logsPage >= logsTotalPages || loading"
						@click="loadLogs(logsPage + 1)"
					>
						<i class="ti ti-chevron-right"></i>
					</button>
				</div>
			</template>
		</MkFolder>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkNumber from '@/components/MkNumber.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';

type UsageKind = 'chat' | 'compression' | 'image_generation' | 'vision' | 'sticker_description' | 'proactive_random' | 'proactive_scheduled' | 'checkin' | 'admin_reward' | 'credit_migration';

type RecentLog = {
	id: string;
	requestedAt: string;
	completedAt: string | null;
	durationMs: number | null;
	modelId: string | null;
	modelName: string | null;
	modelSource: 'official' | 'user' | null;
	modelApiName: string | null;
	usageKind: UsageKind;
	status: 'pending' | 'success' | 'failed' | 'aborted';
	cost: number;
	promptTokens: number | null;
	completionTokens: number | null;
	usedFreeQuota: boolean | null;
	freeQuotaUsedAtCall: number | null;
	freeQuotaTotalAtCall: number | null;
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
	recentLogs: RecentLog[];
	recentLogsTotal: number;
	recentLogsPage: number;
	recentLogsPageSize: number;
};

const LOGS_PAGE_SIZE = 20;

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
const logsPage = ref(1);
const logsTotalPages = computed(() => Math.max(1, Math.ceil((data.value?.recentLogsTotal ?? 0) / LOGS_PAGE_SIZE)));

async function fetchUsage(page: number): Promise<UsageResponse> {
	return await misskeyApi('admin/users/agent-usage' as any, {
		userId: props.userId,
		hours: hours.value,
		logsPage: page,
		logsPageSize: LOGS_PAGE_SIZE,
	}) as UsageResponse;
}

async function loadAll() {
	loading.value = true;
	try {
		data.value = await fetchUsage(1);
		logsPage.value = data.value.recentLogsPage;
	} finally {
		loading.value = false;
	}
}

async function loadLogs(page: number) {
	const p = Math.min(Math.max(1, page), logsTotalPages.value);
	loading.value = true;
	try {
		data.value = await fetchUsage(p);
		logsPage.value = data.value.recentLogsPage;
	} finally {
		loading.value = false;
	}
}

function setRange(h: number) {
	if (hours.value === h) return;
	hours.value = h;
	loadAll();
}

function usageKindLabel(kind: UsageKind): string {
	const t = i18n.ts._agents;
	switch (kind) {
		case 'compression': return t.usageLogKindCompression;
		case 'image_generation': return t.usageLogKindImageGeneration;
		case 'vision': return t.usageLogKindVision;
		case 'sticker_description': return t.usageLogKindStickerDescription;
		case 'proactive_random': return t.usageLogKindProactiveRandom;
		case 'proactive_scheduled': return t.usageLogKindProactiveScheduled;
		case 'checkin': return t.checkinLog;
		case 'admin_reward': return t.billingKindUsage;
		case 'credit_migration': return t.billingKindUsage;
		default: return t.usageLogKindChat;
	}
}

function statusLabel(status: RecentLog['status']): string {
	const t = i18n.ts._agents;
	if (status === 'pending') return t.myStatsStatusPending;
	if (status === 'success') return t.myStatsStatusSuccess;
	if (status === 'failed') return t.myStatsStatusFailed;
	return t.myStatsStatusAborted;
}

onMounted(loadAll);
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

.table {
	display: flex;
	flex-direction: column;
	border-radius: 12px;
	overflow: hidden;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}

.row {
	display: grid;
	padding: 10px 14px;
	align-items: center;
	gap: 8px;
	font-size: 0.9em;

	> * {
		min-width: 0;
	}

	&:not(:last-child) {
		border-bottom: solid 1px var(--MI_THEME-divider);
	}
}

.headRow {
	padding: 8px 14px;
	font-size: 0.76em;
	font-weight: 600;
	opacity: 0.56;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	background: color-mix(in srgb, var(--MI_THEME-panel) 70%, var(--MI_THEME-divider));
}

.modelCols {
	grid-template-columns: 2.2fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.9fr;
}

.logCols {
	grid-template-columns: 1.4fr 0.8fr 1.2fr 0.8fr 0.7fr 0.9fr;
}

.name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: 500;
}

.num {
	text-align: right;
	font-variant-numeric: tabular-nums;
	overflow: hidden;
	text-overflow: ellipsis;
}

.colorOk { color: var(--MI_THEME-success); }
.colorErr { color: var(--MI_THEME-error); }
.colorWarn { color: var(--MI_THEME-warn); }

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
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, var(--MI_THEME-panel));
	color: var(--MI_THEME-accent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 34%, var(--MI_THEME-divider));
}

.pagerBar {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 10px 0 4px;
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

	&:disabled {
		opacity: 0.4;
	}

	&:hover:not(:disabled) {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.pagerText {
	font-size: 0.85em;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	min-width: 4em;
	text-align: center;
}

@media (max-width: 600px) {
	.modelCols {
		grid-template-columns: 1.6fr 0.6fr 0.6fr 0.6fr 0.9fr;

		> :nth-child(4),
		> :nth-child(5) {
			display: none;
		}
	}

	.logCols {
		grid-template-columns: 1.2fr 0.7fr 0.9fr 0.7fr;

		> :nth-child(5),
		> :nth-child(6) {
			display: none;
		}
	}
}
</style>
