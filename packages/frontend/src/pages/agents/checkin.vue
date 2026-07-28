<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<!-- 统计区 -->
	<div v-panel :class="$style.statsBar">
		<div :class="$style.statItem">
			<span :class="$style.statVal">{{ status?.streak ?? 0 }}</span>
			<span :class="$style.statLabel">连续天数</span>
		</div>
		<div :class="$style.statItem">
			<span :class="$style.statVal">{{ status?.monthCount ?? 0 }}</span>
			<span :class="$style.statLabel">本月签到</span>
		</div>
		<div :class="$style.statItem">
			<span :class="$style.statVal">{{ (status?.totalEarned ?? 0).toFixed(2) }}</span>
			<span :class="$style.statLabel">累计额度</span>
		</div>
		<div :class="$style.statItem">
			<span :class="$style.statVal">{{ status?.makeupRemainingThisMonth ?? 0 }}</span>
			<span :class="$style.statLabel">补签剩余</span>
		</div>
	</div>

	<!-- 日历 -->
	<div v-panel :class="$style.calendar">
		<div :class="$style.calHeader">
			<button class="_button" :class="$style.calNav" @click="prevMonth"><i class="ti ti-chevron-left"></i></button>
			<span :class="$style.calTitle">{{ calYear }}年{{ calMonth }}月</span>
			<button class="_button" :class="$style.calNav" @click="nextMonth"><i class="ti ti-chevron-right"></i></button>
		</div>
		<div :class="$style.calGrid">
			<span v-for="d in weekDays" :key="d" :class="$style.calWeekday">{{ d }}</span>
			<span
				v-for="(cell, i) in calCells"
				:key="i"
				:class="[
					$style.calCell,
					cell.day === 0 ? $style.calBlank : '',
					cell.isToday ? $style.calToday : '',
					cell.record && !cell.record.isMakeup ? $style.calChecked : '',
					cell.record?.isMakeup ? $style.calMakeup : '',
					cell.canMakeup ? $style.calCanMakeup : '',
				]"
				:title="cellTitle(cell)"
				@click="cell.canMakeup && onMakeupClick(cell.date)"
			>
				<template v-if="cell.day > 0">
					<span :class="$style.calDayNum">{{ cell.day }}</span>
					<span v-if="cell.record && !cell.record.isMakeup" :class="$style.calReward">+{{ cell.record.reward.toFixed(2) }}</span>
					<span v-else-if="cell.record && cell.record.isMakeup" :class="$style.calMakeupTag">补签</span>
				</template>
			</span>
		</div>
	</div>

	<!-- 签到记录 -->
	<div v-panel :class="$style.records">
		<div :class="$style.recordsTitle">签到记录</div>
		<div v-if="!status || status.monthRecords.length === 0" :class="$style.recordsEmpty">本月暂无签到记录</div>
		<div v-for="r in status?.monthRecords" :key="r.date" :class="$style.recordRow">
			<span :class="$style.recordDate">{{ r.date.slice(5) }}</span>
			<template v-if="r.isMakeup">
				<span :class="$style.recordFormula">{{ new Date(new Date(r.createdAt).getTime() + 8*3600000).toISOString().slice(5, 10) }}补签（消耗 {{ (r.makeupCost ?? 0).toFixed(2) }} 额度）</span>
			</template>
			<template v-else>
				<span :class="$style.recordFormula">
					手气{{ r.baseValue.toFixed(2) }} × 连续×{{ r.streakMultiplier.toFixed(2) }}<template v-if="r.roleMultiplier > 1"> × 身份组×{{ r.roleMultiplier.toFixed(2) }}</template><template v-if="r.dayMultiplier > 1"> × 节日×{{ r.dayMultiplier.toFixed(1) }}</template> = {{ r.reward.toFixed(2) }}
				</span>
			</template>
			<span :class="[$style.recordReward, r.isMakeup ? $style.recordCost : '']">{{ r.isMakeup ? `-${(r.makeupCost ?? 0).toFixed(2)}` : `+${r.reward.toFixed(2)}` }}</span>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';

type MonthRecord = {
	date: string;
	reward: number;
	isMakeup: boolean;
	baseValue: number;
	streakMultiplier: number;
	roleMultiplier: number;
	dayMultiplier: number;
	makeupCost: number | null;
	createdAt: string;
};

type CheckinStatus = {
	todayCheckedIn: boolean;
	streak: number;
	monthRecords: MonthRecord[];
	monthCount: number;
	totalEarned: number;
	makeupRemainingThisMonth: number;
	nextMakeupCost: number;
};

const weekDays = ['一', '二', '三', '四', '五', '六', '日'];

const now = new Date(Date.now() + 8 * 3600_000);
const calYear = ref(now.getUTCFullYear());
const calMonth = ref(now.getUTCMonth() + 1);
const status = ref<CheckinStatus | null>(null);

const yearMonth = computed(() => `${calYear.value}-${String(calMonth.value).padStart(2, '0')}`);

const calCells = computed(() => {
	const y = calYear.value;
	const m = calMonth.value;
	const firstDay = new Date(Date.UTC(y, m - 1, 1));
	let startDow = firstDay.getUTCDay(); // 0=Sun
	startDow = startDow === 0 ? 6 : startDow - 1; // 转为周一=0
	const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
	const todayStr = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

	const recordMap = new Map<string, MonthRecord>();
	for (const r of status.value?.monthRecords ?? []) {
		recordMap.set(r.date, r);
	}

	const cells: { day: number; date: string; isToday: boolean; record: MonthRecord | null; canMakeup: boolean }[] = [];
	// 填充月初空白
	for (let i = 0; i < startDow; i++) {
		cells.push({ day: 0, date: '', isToday: false, record: null, canMakeup: false });
	}
	for (let d = 1; d <= daysInMonth; d++) {
		const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
		const record = recordMap.get(dateStr) ?? null;
		const isPast = dateStr < todayStr;
		const diffDays = Math.floor((new Date(todayStr).getTime() - new Date(dateStr).getTime()) / 86400_000);
		const canMakeup = isPast && !record && diffDays <= 7 && (status.value?.makeupRemainingThisMonth ?? 0) > 0;
		cells.push({ day: d, date: dateStr, isToday: dateStr === todayStr, record, canMakeup });
	}
	return cells;
});

type CalCell = { day: number; date: string; isToday: boolean; record: MonthRecord | null; canMakeup: boolean };

function cellTitle(cell: CalCell): string {
	if (!cell.date) return '';
	if (cell.record) {
		return cell.record.isMakeup
			? `${cell.date} · 补签（消耗 ${(cell.record.makeupCost ?? 0).toFixed(2)} 额度）`
			: `${cell.date} · 签到 +${cell.record.reward.toFixed(2)} 额度`;
	}
	if (cell.canMakeup) return `${cell.date} · 点击补签`;
	return cell.date;
}

function prevMonth() {
	if (calMonth.value === 1) { calYear.value--; calMonth.value = 12; }
	else calMonth.value--;
	loadStatus();
}

function nextMonth() {
	if (calMonth.value === 12) { calYear.value++; calMonth.value = 1; }
	else calMonth.value++;
	loadStatus();
}

async function loadStatus() {
	try {
		status.value = await misskeyApi('agents/checkin-status' as any, { yearMonth: yearMonth.value }) as any;
	} catch { /* ignore */ }
}

async function onMakeupClick(date: string) {
	const cost = status.value?.nextMakeupCost ?? 0;
	const confirm = await os.confirm({
		type: 'warning',
		title: '补签确认',
		text: `确定要补签 ${date} 吗？\n将消耗 ${cost.toFixed(2)} 额度。`,
	});
	if (confirm.canceled) return;
	try {
		await misskeyApi('agents/checkin-makeup' as any, { date });
		os.success();
		loadStatus();
	} catch (e: any) {
		os.alert({ type: 'error', text: e.message ?? '补签失败' });
	}
}

onMounted(() => { loadStatus(); });
</script>

<style module lang="scss">
.statsBar {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	padding: 16px 8px;
	text-align: center;
}

.statItem {
	display: flex;
	flex-direction: column;
	gap: 3px;
	padding: 2px 8px;

	& + .statItem {
		border-left: 1px solid var(--MI_THEME-divider);
	}
}

.statVal {
	font-size: 1.35em;
	font-weight: 800;
	color: var(--MI_THEME-accent);
	font-variant-numeric: tabular-nums;
	line-height: 1.2;
}

.statLabel {
	font-size: 0.76em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.calendar {
	padding: 16px;
}

.calHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 12px;
}

.calTitle {
	font-weight: 700;
	font-size: 1.05em;
}

.calNav {
	padding: 6px 10px;
	border-radius: 8px;
	color: var(--MI_THEME-fg);
	cursor: pointer;
	&:hover { background: var(--MI_THEME-bg); }
}

.calGrid {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 6px;
}

.calWeekday {
	text-align: center;
	font-size: 0.76em;
	font-weight: 600;
	color: var(--MI_THEME-fgTransparentWeak);
	padding: 4px 0;
}

.calCell {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 2px;
	aspect-ratio: 1 / 1.12;
	border-radius: 10px;
	border: 1px solid transparent;
	background: color-mix(in srgb, var(--MI_THEME-fg) 3%, transparent);
	font-size: 0.88em;
	cursor: default;
	transition: background-color 0.12s ease, border-color 0.12s ease;
}

.calBlank {
	background: transparent;
}

.calToday {
	border-color: var(--MI_THEME-accent);
	box-shadow: 0 0 0 1px var(--MI_THEME-accent) inset;
}

.calChecked {
	background: color-mix(in srgb, var(--MI_THEME-success) 12%, transparent);
	border-color: color-mix(in srgb, var(--MI_THEME-success) 35%, transparent);
}

.calMakeup {
	background: color-mix(in srgb, var(--MI_THEME-info) 12%, transparent);
	border-color: color-mix(in srgb, var(--MI_THEME-info) 35%, transparent);
}

.calCanMakeup {
	border: 1px dashed var(--MI_THEME-warn);
	background: transparent;
	cursor: pointer;
	&:hover { background: color-mix(in srgb, var(--MI_THEME-warn) 12%, transparent); }
}

.calDayNum {
	font-size: 0.92em;
	font-weight: 600;
	line-height: 1;
	color: var(--MI_THEME-fg);
}

.calToday .calDayNum {
	color: var(--MI_THEME-accent);
}

.calReward {
	font-size: 0.6em;
	font-weight: 700;
	line-height: 1;
	color: var(--MI_THEME-success);
	font-variant-numeric: tabular-nums;
}

.calMakeupTag {
	font-size: 0.58em;
	font-weight: 600;
	line-height: 1;
	color: var(--MI_THEME-info);
}

.records {
	padding: 16px;
}

.recordsTitle {
	font-weight: 700;
	margin-bottom: 10px;
}

.recordsEmpty {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
}

.recordRow {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 0;
	border-bottom: 1px solid var(--MI_THEME-divider);
	font-size: 0.88em;

	&:last-child { border-bottom: none; }
}

.recordDate {
	flex-shrink: 0;
	width: 44px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.recordFormula {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--MI_THEME-fg);
}

.recordReward {
	flex-shrink: 0;
	font-weight: 600;
	color: var(--MI_THEME-success);
}

.recordCost {
	color: var(--MI_THEME-error);
}
</style>
