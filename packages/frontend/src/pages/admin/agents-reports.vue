<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps_m">
			<div :class="$style.timeWindowRow">
				<span :class="$style.timeWindowLabel"><i class="ti ti-clock"></i> 时间窗口</span>
				<div :class="$style.timeWindowBtns">
					<button
						v-for="w in timeWindows"
						:key="w.value"
						type="button"
						:class="[$style.twBtn, selectedHours === w.value ? $style.twBtnActive : null]"
						@click="setWindow(w.value)"
					>{{ w.label }}</button>
				</div>
			</div>

			<MkLoading v-if="loading"/>
			<template v-else-if="data">
				<div :class="$style.summaryGrid">
					<div :class="$style.summaryCard" v-panel>
						<div :class="$style.summaryCardLabel">总请求</div>
						<div :class="$style.summaryCardValue">{{ data.overall.total }}</div>
					</div>
					<div :class="$style.summaryCard" v-panel>
						<div :class="$style.summaryCardLabel">成功率</div>
						<div :class="[$style.summaryCardValue, $style.success]">
							{{ data.overall.total > 0 ? ((data.overall.success / data.overall.total) * 100).toFixed(1) : '—' }}%
						</div>
					</div>
					<div :class="$style.summaryCard" v-panel>
						<div :class="$style.summaryCardLabel">失败数</div>
						<div :class="[$style.summaryCardValue, data.overall.failed > 0 ? $style.failed : null]">{{ data.overall.failed }}</div>
					</div>
					<div :class="$style.summaryCard" v-panel>
						<div :class="$style.summaryCardLabel">中断数</div>
						<div :class="[$style.summaryCardValue, data.overall.aborted > 0 ? $style.aborted : null]">{{ data.overall.aborted }}</div>
					</div>
					<div :class="$style.summaryCard" v-panel>
						<div :class="$style.summaryCardLabel">总费用</div>
						<div :class="$style.summaryCardValue">{{ data.overall.totalCost.toFixed(4) }}</div>
					</div>
					<div :class="$style.summaryCard" v-panel>
						<div :class="$style.summaryCardLabel">活跃用户</div>
						<div :class="$style.summaryCardValue">{{ data.overall.uniqueUsers }}</div>
					</div>
				</div>

				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-cpu"></i></template>
					<template #label>按模型统计</template>
					<div class="_gaps_s">
						<MkInfo v-if="data.byModel.length === 0">暂无数据。</MkInfo>
						<div v-else :class="$style.modelTable">
							<div :class="$style.modelHeader">
								<span>模型名称</span>
								<span>成功</span>
								<span>失败</span>
								<span>中断</span>
								<span>成功率</span>
								<span>费用</span>
							</div>
							<div v-for="m in data.byModel" :key="m.modelId ?? '__null__'" :class="[$style.modelRow, m.unlisted ? $style.modelRowUnlisted : null]">
								<span :class="$style.modelName">
									{{ m.modelName ?? m.modelId ?? '未知' }}
									<span v-if="m.unlisted" :class="$style.unlistedBadge">已下架</span>
								</span>
								<span :class="$style.success">{{ m.success }}</span>
								<span :class="m.failed > 0 ? $style.failed : ''">{{ m.failed }}</span>
								<span :class="m.aborted > 0 ? $style.aborted : ''">{{ m.aborted }}</span>
								<span>{{ m.total > 0 ? ((m.success / m.total) * 100).toFixed(1) + '%' : '—' }}</span>
								<span>{{ m.totalCost.toFixed(4) }}</span>
							</div>
						</div>
					</div>
				</MkFolder>

				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-timeline"></i></template>
					<template #label>按小时请求趋势</template>
					<div class="_gaps_s">
						<MkInfo v-if="data.hourlyBuckets.length === 0">暂无数据。</MkInfo>
						<div v-else :class="$style.chartWrap">
							<div
								v-for="bucket in chartBuckets"
								:key="bucket.bucketStart"
								:class="$style.chartItem"
							>
								<div :class="$style.chartBarGroup">
									<div
										:class="[$style.chartBar, $style.barSuccess]"
										:style="{ height: barHeight(bucket.success, maxBucketTotal) }"
										:title="`成功: ${bucket.success}`"
									/>
									<div
										:class="[$style.chartBar, $style.barFailed]"
										:style="{ height: barHeight(bucket.failed, maxBucketTotal) }"
										:title="`失败: ${bucket.failed}`"
									/>
									<div
										:class="[$style.chartBar, $style.barAborted]"
										:style="{ height: barHeight(bucket.aborted, maxBucketTotal) }"
										:title="`中断: ${bucket.aborted}`"
									/>
								</div>
								<div :class="$style.chartLabel">{{ bucketLabel(bucket.bucketStart) }}</div>
							</div>
						</div>
						<div :class="$style.chartLegend">
							<span :class="[$style.legendDot, $style.barSuccess]"></span> 成功
							<span :class="[$style.legendDot, $style.barFailed]"></span> 失败
							<span :class="[$style.legendDot, $style.barAborted]"></span> 中断
						</div>
					</div>
				</MkFolder>
			</template>
			<MkInfo v-else-if="!loading">加载失败，请稍后重试。</MkInfo>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

type ReportsOverview = {
	overall: { total: number; success: number; failed: number; aborted: number; totalCost: number; uniqueUsers: number };
	byModel: { modelId: string | null; modelName: string | null; total: number; success: number; failed: number; aborted: number; totalCost: number; unlisted: boolean }[];
	hourlyBuckets: { bucketStart: string; total: number; success: number; failed: number; aborted: number }[];
};

const timeWindows = [
	{ label: '24h', value: 24 },
	{ label: '72h', value: 72 },
	{ label: '168h', value: 168 },
	{ label: '720h', value: 720 },
];

const selectedHours = ref(24);
const loading = ref(false);
const data = ref<ReportsOverview | null>(null);

async function load() {
	loading.value = true;
	data.value = null;
	try {
		data.value = await misskeyApi('admin/agents/reports/overview' as any, { hours: selectedHours.value }) as ReportsOverview;
	} finally {
		loading.value = false;
	}
}

function setWindow(hours: number) {
	selectedHours.value = hours;
	load();
}

onMounted(() => {
	load();
});

const chartBuckets = computed(() => {
	if (!data.value) return [];
	const buckets = [...data.value.hourlyBuckets];
	return buckets.slice(-48);
});

const maxBucketTotal = computed(() => {
	if (!chartBuckets.value.length) return 1;
	return Math.max(1, ...chartBuckets.value.map(b => b.total));
});

function barHeight(count: number, max: number): string {
	const pct = Math.round((count / max) * 100);
	return `${Math.max(2, pct)}%`;
}

function bucketLabel(iso: string): string {
	const d = new Date(iso);
	const h = d.getHours().toString().padStart(2, '0');
	const m = d.getMinutes().toString().padStart(2, '0');
	return `${h}:${m}`;
}

const headerTabs = computed(() => []);

definePage(() => ({
	title: '智能体请求报表',
	icon: 'ti ti-report-analytics',
}));
</script>

<style lang="scss" module>
.timeWindowRow {
	display: flex;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
}

.timeWindowLabel {
	font-size: 0.88em;
	font-weight: 600;
	opacity: 0.72;
	display: flex;
	align-items: center;
	gap: 6px;
}

.timeWindowBtns {
	display: flex;
	gap: 6px;
}

.twBtn {
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

.twBtnActive {
	background: var(--MI_THEME-accent);
	border-color: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent, #fff);
}

.summaryGrid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 12px;

	@media (max-width: 600px) {
		grid-template-columns: repeat(2, 1fr);
	}
}

.summaryCard {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
	padding: 18px 12px;
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
	font-size: 1.6em;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
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

.modelTable {
	display: flex;
	flex-direction: column;
	border-radius: 10px;
	overflow: hidden;
	border: solid 1px var(--MI_THEME-divider);
}

.modelHeader {
	display: grid;
	grid-template-columns: 2.5fr 0.6fr 0.6fr 0.6fr 0.8fr 1fr;
	padding: 8px 14px;
	font-size: 0.78em;
	font-weight: 600;
	opacity: 0.56;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	background: var(--MI_THEME-panel);
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.modelRow {
	display: grid;
	grid-template-columns: 2.5fr 0.6fr 0.6fr 0.6fr 0.8fr 1fr;
	padding: 9px 14px;
	font-size: 0.88em;
	align-items: center;

	&:not(:last-child) {
		border-bottom: solid 1px var(--MI_THEME-divider);
	}
}

.modelRowUnlisted {
	opacity: 0.72;
	background: color-mix(in srgb, var(--MI_THEME-panel) 88%, var(--MI_THEME-warn) 12%);
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

.chartWrap {
	display: flex;
	align-items: flex-end;
	gap: 3px;
	height: 120px;
	overflow-x: auto;
	padding: 4px 0 0;
}

.chartItem {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 3px;
	flex-shrink: 0;
	width: 18px;
}

.chartBarGroup {
	display: flex;
	align-items: flex-end;
	gap: 1px;
	height: 90px;
	width: 100%;
}

.chartBar {
	flex: 1;
	min-height: 2px;
	border-radius: 2px 2px 0 0;
	transition: height 0.3s;
}

.barSuccess {
	background: var(--MI_THEME-success);
}

.barFailed {
	background: var(--MI_THEME-error);
}

.barAborted {
	background: var(--MI_THEME-warn);
}

.chartLabel {
	font-size: 0.62em;
	opacity: 0.56;
	writing-mode: vertical-rl;
	text-orientation: mixed;
	white-space: nowrap;
}

.chartLegend {
	display: flex;
	gap: 14px;
	font-size: 0.82em;
	opacity: 0.8;
	align-items: center;
}

.legendDot {
	display: inline-block;
	width: 10px;
	height: 10px;
	border-radius: 3px;
	margin-right: 4px;
}
</style>
