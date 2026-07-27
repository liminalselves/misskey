<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<MkLoading v-if="loading"/>
	<template v-else-if="data">
		<!-- 总览统计卡片 -->
		<div :class="$style.summaryGrid">
			<div v-panel :class="$style.summaryCard">
				<div :class="$style.summaryCardLabel">累计签发</div>
				<div :class="$style.summaryCardValue">{{ data.overview.totalReward.toFixed(2) }}</div>
			</div>
			<div v-panel :class="$style.summaryCard">
				<div :class="$style.summaryCardLabel">今日签发</div>
				<div :class="$style.summaryCardValue">{{ data.overview.todayReward.toFixed(2) }}</div>
				<div :class="$style.summaryCardSub">{{ data.overview.todayUsers }} 人</div>
			</div>
			<div v-panel :class="$style.summaryCard">
				<div :class="$style.summaryCardLabel">本月签发</div>
				<div :class="$style.summaryCardValue">{{ data.overview.monthReward.toFixed(2) }}</div>
				<div :class="$style.summaryCardSub">{{ data.overview.monthUsers }} 人</div>
			</div>
			<div v-panel :class="$style.summaryCard">
				<div :class="$style.summaryCardLabel">补签总消耗</div>
				<div :class="[$style.summaryCardValue, $style.makeupColor]">{{ data.overview.totalMakeupCost.toFixed(2) }}</div>
			</div>
		</div>

		<!-- 日历热力图 -->
		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-calendar"></i></template>
			<template #label>日历热力（{{ calYearMonth }}）</template>
			<template #suffix>
				<button class="_button" :class="$style.calNavBtn" @click="prevMonth"><i class="ti ti-chevron-left"></i></button>
				<button class="_button" :class="$style.calNavBtn" @click="nextMonth"><i class="ti ti-chevron-right"></i></button>
			</template>
			<div :class="$style.calGrid">
				<div v-for="d in weekDays" :key="d" :class="$style.calWeekday">{{ d }}</div>
				<div
					v-for="(cell, idx) in calCells"
					:key="idx"
					:class="[$style.calCell, cell.isToday ? $style.calToday : null, cell.selected ? $style.calSelected : null]"
					:style="cell.heat ? { background: heatColor(cell.heat) } : {}"
					:title="cell.date ? `${cell.date}：${cell.reward?.toFixed(2) ?? 0} 额度 / ${cell.users ?? 0} 人` : ''"
					@click="cell.date && selectDate(cell.date)"
				>
					<span v-if="cell.day" :class="$style.calDayNum">{{ cell.day }}</span>
					<span v-if="cell.reward != null && cell.reward > 0" :class="$style.calVal">{{ cell.reward.toFixed(1) }}</span>
				</div>
			</div>
		</MkFolder>

		<!-- 趋势图 -->
		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-chart-line"></i></template>
			<template #label>最近 30 天趋势</template>
			<div class="_gaps_s">
				<div :class="$style.chartTitle">每日签发额度</div>
				<div :class="$style.lineChart">
					<div v-for="t in data.trend" :key="t.date" :class="$style.lineBarItem" :title="`${t.date}：${t.totalReward.toFixed(2)} 额度`">
						<div :class="[$style.lineBar, $style.barReward]" :style="{ height: barPct(t.totalReward, maxTrendReward) }"></div>
						<div :class="$style.lineLabel">{{ t.date.slice(8) }}</div>
					</div>
				</div>
				<div :class="$style.chartTitle">每日签到用户数</div>
				<div :class="$style.lineChart">
					<div v-for="t in data.trend" :key="'u'+t.date" :class="$style.lineBarItem" :title="`${t.date}：${t.userCount} 人`">
						<div :class="[$style.lineBar, $style.barUsers]" :style="{ height: barPct(t.userCount, maxTrendUsers) }"></div>
						<div :class="$style.lineLabel">{{ t.date.slice(8) }}</div>
					</div>
				</div>
			</div>
		</MkFolder>

		<!-- TOP 10 用户 -->
		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-trophy"></i></template>
			<template #label>累计额度 TOP 10</template>
			<div :class="$style.topList">
				<div v-for="(u, i) in data.topUsers" :key="u.userId" :class="$style.topRow">
					<span :class="$style.topRank">#{{ i + 1 }}</span>
					<span :class="$style.topName">{{ u.username }}</span>
					<div :class="$style.topBarWrap">
						<div :class="$style.topBar" :style="{ width: barPct(u.totalReward, maxTopReward) }"></div>
					</div>
					<span :class="$style.topVal">{{ u.totalReward.toFixed(2) }}</span>
					<span :class="$style.topCount">{{ u.checkinCount }}次</span>
				</div>
				<MkInfo v-if="data.topUsers.length === 0">暂无数据</MkInfo>
			</div>
		</MkFolder>

		<!-- 明细记录 -->
		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-list"></i></template>
			<template #label>签到明细</template>
			<div class="_gaps_s">
				<!-- 筛选 -->
				<div :class="$style.filterRow">
					<MkInput v-model="filterUserId" type="text" :class="$style.filterInput">
						<template #label>用户ID</template>
					</MkInput>
					<MkInput v-model="filterDateFrom" type="date" :class="$style.filterInput">
						<template #label>起始日期</template>
					</MkInput>
					<MkInput v-model="filterDateTo" type="date" :class="$style.filterInput">
						<template #label>结束日期</template>
					</MkInput>
					<MkButton small rounded @click="loadRecords"><i class="ti ti-search"></i> 查询</MkButton>
				</div>
				<!-- 表格 -->
				<div :class="$style.recTable">
					<div :class="$style.recHeader">
						<span>用户</span>
						<span>日期</span>
						<span>公式</span>
						<span>额度</span>
						<span>类型</span>
					</div>
					<div v-for="r in data.records" :key="r.userId + r.date + r.createdAt" :class="$style.recRow">
						<span :class="$style.recUser">{{ r.username }}</span>
						<span>{{ r.date }}</span>
						<span :class="$style.recFormula">{{ formatFormula(r) }}</span>
						<span :class="r.isMakeup ? $style.makeupColor : $style.rewardColor">{{ r.isMakeup ? `-${(r.makeupCost ?? 0).toFixed(2)}` : `+${r.reward.toFixed(2)}` }}</span>
						<span>{{ r.isMakeup ? '补签' : '签到' }}</span>
					</div>
					<MkInfo v-if="data.records.length === 0">暂无记录</MkInfo>
				</div>
				<!-- 分页 -->
				<div v-if="totalPages > 1" :class="$style.pagination">
					<button class="_button" :class="$style.pageBtn" :disabled="currentPage <= 1" @click="goPage(currentPage - 1)"><i class="ti ti-chevron-left"></i></button>
					<span :class="$style.pageInfo">{{ currentPage }} / {{ totalPages }}</span>
					<button class="_button" :class="$style.pageBtn" :disabled="currentPage >= totalPages" @click="goPage(currentPage + 1)"><i class="ti ti-chevron-right"></i></button>
				</div>
			</div>
		</MkFolder>
	</template>
	<MkInfo v-else-if="!loading">加载失败，请稍后重试。</MkInfo>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import { misskeyApi } from '@/utility/misskey-api.js';

type ReportData = {
	overview: { totalReward: number; todayReward: number; todayUsers: number; monthReward: number; monthUsers: number; totalMakeupCost: number };
	dailyStats: { date: string; totalReward: number; userCount: number }[];
	trend: { date: string; totalReward: number; userCount: number }[];
	topUsers: { userId: string; username: string; totalReward: number; checkinCount: number }[];
	records: { userId: string; username: string; date: string; reward: number; baseValue: number; streakMultiplier: number; roleMultiplier: number; dayMultiplier: number; isMakeup: boolean; makeupCost: number | null; createdAt: string }[];
	totalCount: number;
};

const loading = ref(false);
const data = ref<ReportData | null>(null);
const currentPage = ref(1);
const pageSize = ref(20);
const filterUserId = ref('');
const filterDateFrom = ref('');
const filterDateTo = ref('');

// 日历
const bjNow = new Date(Date.now() + 8 * 3600_000);
const calYear = ref(bjNow.getUTCFullYear());
const calMonth = ref(bjNow.getUTCMonth() + 1);
const selectedDate = ref<string | null>(null);

const calYearMonth = computed(() => `${calYear.value}-${String(calMonth.value).padStart(2, '0')}`);
const weekDays = ['一', '二', '三', '四', '五', '六', '日'];

const calCells = computed(() => {
	const ym = calYearMonth.value;
	const firstDay = new Date(`${ym}-01T00:00:00Z`);
	let startDow = firstDay.getUTCDay(); // 0=Sun
	startDow = startDow === 0 ? 6 : startDow - 1; // 转为周一=0
	const daysInMonth = new Date(Date.UTC(calYear.value, calMonth.value, 0)).getUTCDate();
	const todayStr = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

	const statMap = new Map<string, { totalReward: number; userCount: number }>();
	if (data.value) {
		for (const d of data.value.dailyStats) {
			statMap.set(d.date, { totalReward: d.totalReward, userCount: d.userCount });
		}
	}

	const cells: { day: number | null; date: string | null; reward: number | null; users: number | null; isToday: boolean; selected: boolean; heat: number }[] = [];
	for (let i = 0; i < startDow; i++) {
		cells.push({ day: null, date: null, reward: null, users: null, isToday: false, selected: false, heat: 0 });
	}
	const maxReward = Math.max(1, ...data.value?.dailyStats.map(d => d.totalReward) ?? [1]);
	for (let d = 1; d <= daysInMonth; d++) {
		const dateStr = `${ym}-${String(d).padStart(2, '0')}`;
		const stat = statMap.get(dateStr);
		cells.push({
			day: d,
			date: dateStr,
			reward: stat?.totalReward ?? null,
			users: stat?.userCount ?? null,
			isToday: dateStr === todayStr,
			selected: dateStr === selectedDate.value,
			heat: stat ? stat.totalReward / maxReward : 0,
		});
	}
	return cells;
});

const maxTrendReward = computed(() => Math.max(0.01, ...data.value?.trend.map(t => t.totalReward) ?? [1]));
const maxTrendUsers = computed(() => Math.max(1, ...data.value?.trend.map(t => t.userCount) ?? [1]));
const maxTopReward = computed(() => Math.max(0.01, ...data.value?.topUsers.map(u => u.totalReward) ?? [1]));
const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.totalCount ?? 0) / pageSize.value)));

function barPct(val: number, max: number): string {
	return `${Math.max(3, Math.round((val / max) * 100))}%`;
}

function heatColor(ratio: number): string {
	const alpha = Math.min(0.85, 0.1 + ratio * 0.75);
	return `color-mix(in srgb, var(--MI_THEME-accent) ${Math.round(alpha * 100)}%, var(--MI_THEME-panel))`;
}

function formatFormula(r: ReportData['records'][0]): string {
	if (r.isMakeup) return `补签（消耗 ${r.makeupCost?.toFixed(2) ?? 0}）`;
	let f = `手气${r.baseValue.toFixed(2)} × 连续×${r.streakMultiplier.toFixed(2)}`;
	if (r.roleMultiplier > 1) f += ` × 身份组×${r.roleMultiplier.toFixed(2)}`;
	if (r.dayMultiplier > 1) f += ` × 节日×${r.dayMultiplier.toFixed(0)}`;
	f += ` = ${r.reward.toFixed(2)}`;
	return f;
}

function prevMonth() {
	if (calMonth.value === 1) { calYear.value--; calMonth.value = 12; } else { calMonth.value--; }
	load();
}
function nextMonth() {
	if (calMonth.value === 12) { calYear.value++; calMonth.value = 1; } else { calMonth.value++; }
	load();
}
function selectDate(date: string) {
	selectedDate.value = date;
	filterDateFrom.value = date;
	filterDateTo.value = date;
	currentPage.value = 1;
	loadRecords();
}
function goPage(p: number) {
	currentPage.value = p;
	loadRecords();
}

async function load() {
	loading.value = true;
	data.value = null;
	try {
		data.value = await misskeyApi('admin/agents-checkin-reports' as any, {
			yearMonth: calYearMonth.value,
			page: currentPage.value,
			limit: pageSize.value,
			userId: filterUserId.value || undefined,
			dateFrom: filterDateFrom.value || undefined,
			dateTo: filterDateTo.value || undefined,
		}) as ReportData;
	} catch { /* handled by template */ } finally {
		loading.value = false;
	}
}

async function loadRecords() {
	loading.value = true;
	try {
		data.value = await misskeyApi('admin/agents-checkin-reports' as any, {
			yearMonth: calYearMonth.value,
			page: currentPage.value,
			limit: pageSize.value,
			userId: filterUserId.value || undefined,
			dateFrom: filterDateFrom.value || undefined,
			dateTo: filterDateTo.value || undefined,
		}) as ReportData;
	} catch { /* */ } finally {
		loading.value = false;
	}
}

onMounted(() => { load(); });
</script>

<style lang="scss" module>
.summaryGrid {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 12px;

	@media (max-width: 600px) {
		grid-template-columns: repeat(2, 1fr);
	}
}

.summaryCard {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	padding: 16px 10px;
	border-radius: var(--MI-radius);
	text-align: center;
}

.summaryCardLabel {
	font-size: 0.75em;
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
	font-size: 0.78em;
	opacity: 0.6;
}

.makeupColor { color: var(--MI_THEME-warn); }
.rewardColor { color: var(--MI_THEME-success); }

// Calendar
.calNavBtn {
	padding: 4px 8px;
	border-radius: 6px;
	font-size: 1em;
	&:hover { background: var(--MI_THEME-panelHighlight); }
}

.calGrid {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 3px;
}

.calWeekday {
	text-align: center;
	font-size: 0.72em;
	font-weight: 600;
	opacity: 0.56;
	padding: 4px 0;
}

.calCell {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	min-height: 44px;
	border-radius: 8px;
	border: solid 1px var(--MI_THEME-divider);
	cursor: pointer;
	transition: border-color 0.15s;

	&:hover { border-color: var(--MI_THEME-accent); }
}

.calToday { border-color: var(--MI_THEME-accent); border-width: 2px; }
.calSelected { outline: 2px solid var(--MI_THEME-accent); outline-offset: 1px; }

.calDayNum {
	font-size: 0.78em;
	font-weight: 600;
	opacity: 0.8;
}

.calVal {
	font-size: 0.65em;
	font-weight: 700;
	color: var(--MI_THEME-fgOnAccent, #fff);
}

// Charts
.chartTitle {
	font-size: 0.82em;
	font-weight: 600;
	opacity: 0.72;
	margin-top: 8px;
}

.lineChart {
	display: flex;
	align-items: flex-end;
	gap: 2px;
	height: 100px;
	overflow-x: auto;
	padding: 4px 0;
}

.lineBarItem {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
	flex-shrink: 0;
	width: 16px;
}

.lineBar {
	width: 100%;
	min-height: 2px;
	border-radius: 2px 2px 0 0;
	transition: height 0.3s;
}

.barReward { background: var(--MI_THEME-accent); }
.barUsers { background: var(--MI_THEME-success); }

.lineLabel {
	font-size: 0.58em;
	opacity: 0.5;
	writing-mode: vertical-rl;
	white-space: nowrap;
}

// Top users
.topList {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.topRow {
	display: flex;
	align-items: center;
	gap: 8px;
}

.topRank {
	width: 28px;
	font-size: 0.82em;
	font-weight: 700;
	opacity: 0.6;
	text-align: right;
}

.topName {
	width: 100px;
	font-size: 0.88em;
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.topBarWrap {
	flex: 1;
	height: 14px;
	background: var(--MI_THEME-panelHighlight);
	border-radius: 7px;
	overflow: hidden;
}

.topBar {
	height: 100%;
	background: var(--MI_THEME-accent);
	border-radius: 7px;
	transition: width 0.3s;
}

.topVal {
	width: 52px;
	font-size: 0.82em;
	font-weight: 700;
	text-align: right;
	font-variant-numeric: tabular-nums;
}

.topCount {
	width: 36px;
	font-size: 0.72em;
	opacity: 0.56;
	text-align: right;
}

// Filter
.filterRow {
	display: flex;
	align-items: flex-end;
	gap: 10px;
	flex-wrap: wrap;
}

.filterInput {
	width: 150px;
}

// Records table
.recTable {
	display: flex;
	flex-direction: column;
	border-radius: 10px;
	overflow: hidden;
	border: solid 1px var(--MI_THEME-divider);
}

.recHeader {
	display: grid;
	grid-template-columns: 1fr 0.8fr 2.5fr 0.8fr 0.5fr;
	padding: 8px 12px;
	font-size: 0.75em;
	font-weight: 600;
	opacity: 0.56;
	background: var(--MI_THEME-panel);
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.recRow {
	display: grid;
	grid-template-columns: 1fr 0.8fr 2.5fr 0.8fr 0.5fr;
	padding: 7px 12px;
	font-size: 0.82em;
	align-items: center;

	&:not(:last-child) { border-bottom: solid 1px var(--MI_THEME-divider); }
}

.recUser {
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.recFormula {
	font-size: 0.9em;
	opacity: 0.8;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

// Pagination
.pagination {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 12px;
}

.pageBtn {
	padding: 6px 12px;
	border-radius: 8px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	cursor: pointer;
	&:disabled { opacity: 0.3; cursor: default; }
	&:hover:not(:disabled) { border-color: var(--MI_THEME-accent); }
}

.pageInfo {
	font-size: 0.88em;
	font-weight: 600;
	opacity: 0.72;
}
</style>
