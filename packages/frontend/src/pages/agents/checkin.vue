<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<!-- Hero 状态卡 -->
	<div :class="$style.hero">
		<div :class="$style.heroLeft">
			<div :class="[$style.heroIcon, status?.todayCheckedIn ? $style.heroIconDone : '']">
				<i :class="status?.todayCheckedIn ? 'ti ti-circle-check' : 'ti ti-clock'"></i>
			</div>
			<div :class="$style.heroInfo">
				<div :class="$style.heroStatus">{{ status?.todayCheckedIn ? '今日已签到' : '今日未签到' }}</div>
				<div v-if="todayRecord" :class="$style.heroReward">获得 <b>+{{ todayRecord.reward.toFixed(2) }}</b> 额度</div>
				<div v-else :class="$style.heroRewardHint">签到即可获得额度奖励</div>
			</div>
		</div>
		<div :class="$style.heroStreak">
			<span :class="$style.heroStreakNum">{{ status?.streak ?? 0 }}</span>
			<span :class="$style.heroStreakLabel">连续天数</span>
		</div>
	</div>

	<!-- 次要统计 -->
	<div :class="$style.statsGrid">
		<div v-panel :class="$style.statCard">
			<span :class="$style.statVal">{{ status?.monthCount ?? 0 }}<small>天</small></span>
			<span :class="$style.statLabel">本月签到</span>
		</div>
		<div v-panel :class="$style.statCard">
			<span :class="$style.statVal">{{ (status?.totalEarned ?? 0).toFixed(2) }}</span>
			<span :class="$style.statLabel">累计额度</span>
		</div>
		<div v-panel :class="$style.statCard">
			<span :class="$style.statVal">{{ status?.makeupRemainingThisMonth ?? 0 }}<small>次</small></span>
			<span :class="$style.statLabel">补签剩余 · 消耗 {{ (status?.nextMakeupCost ?? 0).toFixed(2) }}/次</span>
		</div>
	</div>

	<!-- 紧凑日历 -->
	<div v-panel :class="$style.calendar">
		<div :class="$style.calHeader">
			<button class="_button" :class="$style.calNav" @click="prevMonth"><i class="ti ti-chevron-left"></i></button>
			<button class="_button" :class="$style.calTitleBtn" @click="togglePicker">{{ calYear }}年{{ calMonth }}月 <i class="ti ti-chevron-down" :class="[$style.calTitleChevron, showPicker ? $style.calTitleChevronOpen : '']"></i></button>
			<button class="_button" :class="$style.calNav" @click="nextMonth"><i class="ti ti-chevron-right"></i></button>
		</div>
		<div v-if="showPicker" :class="$style.monthPicker">
			<div :class="$style.pickerYearRow">
				<button class="_button" :class="$style.calNav" @click="pickerYear--"><i class="ti ti-chevron-left"></i></button>
				<span :class="$style.pickerYear">{{ pickerYear }}年</span>
				<button class="_button" :class="$style.calNav" @click="pickerYear++"><i class="ti ti-chevron-right"></i></button>
			</div>
			<div :class="$style.pickerMonthGrid">
				<button
					v-for="m in 12"
					:key="m"
					:class="[$style.pickerMonth, (pickerYear === calYear && m === calMonth) ? $style.pickerMonthActive : '']"
					@click="selectMonth(m)"
				>{{ m }}月</button>
			</div>
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
					<span v-else-if="cell.record?.isMakeup" :class="$style.calMakeupTag">补签</span>
					<span v-else-if="cell.canMakeup" :class="$style.calMakeupHint">可补</span>
				</template>
			</span>
		</div>
	</div>

	<!-- 签到记录 -->
	<div v-panel :class="$style.records">
		<div :class="$style.recordsTitle"><i class="ti ti-list-details"></i> 签到记录</div>
		<div v-if="!status || status.monthRecords.length === 0" :class="$style.recordsEmpty">本月暂无签到记录</div>
		<div v-for="r in status?.monthRecords" :key="r.date" :class="$style.recordRow">
			<div :class="$style.recordLeft">
				<span :class="$style.recordDate">{{ r.date.slice(5) }}</span>
				<span v-if="r.isMakeup" :class="$style.recordMakeupBadge">补签</span>
			</div>
			<span :class="$style.recordFormula">
				<template v-if="r.isMakeup">{{ new Date(new Date(r.createdAt).getTime() + 8*3600000).toISOString().slice(5, 10) }} 操作 · 消耗额度</template>
				<template v-else>手气{{ r.baseValue.toFixed(2) }} × 连续×{{ r.streakMultiplier.toFixed(2) }}<template v-if="r.roleMultiplier > 1"> × 身份组×{{ r.roleMultiplier.toFixed(2) }}</template><template v-if="r.dayMultiplier > 1"> × 节日×{{ r.dayMultiplier.toFixed(1) }}</template></template>
			</span>
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
const showPicker = ref(false);
const pickerYear = ref(calYear.value);

function togglePicker() {
	pickerYear.value = calYear.value;
	showPicker.value = !showPicker.value;
}

function selectMonth(m: number) {
	calYear.value = pickerYear.value;
	calMonth.value = m;
	showPicker.value = false;
	loadStatus();
}

const yearMonth = computed(() => `${calYear.value}-${String(calMonth.value).padStart(2, '0')}`);

const todayRecord = computed(() => {
	const todayStr = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
	return status.value?.monthRecords.find(r => r.date === todayStr) ?? null;
});

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
// === Hero 状态卡 ===
.hero {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	padding: 20px 24px;
	border-radius: var(--MI-radius);
	background: linear-gradient(135deg, color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-panel)), var(--MI_THEME-panel));
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 22%, var(--MI_THEME-divider));

	@media (max-width: 500px) {
		padding: 16px;
		gap: 12px;
	}
}

.heroLeft {
	display: flex;
	align-items: center;
	gap: 16px;
	min-width: 0;
}

.heroIcon {
	flex-shrink: 0;
	width: 52px;
	height: 52px;
	border-radius: 16px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 1.7rem;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	transition: background-color 0.2s ease, color 0.2s ease;
}

.heroIconDone {
	background: color-mix(in srgb, var(--MI_THEME-success) 14%, transparent);
	color: var(--MI_THEME-success);
}

.heroInfo {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.heroStatus {
	font-size: 1.2em;
	font-weight: 800;
	line-height: 1.3;
}

.heroReward {
	font-size: 0.92em;
	color: var(--MI_THEME-fgTransparentWeak);

	b {
		color: var(--MI_THEME-success);
		font-size: 1.25em;
		font-variant-numeric: tabular-nums;
	}
}

.heroRewardHint {
	font-size: 0.88em;
	color: var(--MI_THEME-fgTransparentWeak);
	opacity: 0.8;
}

.heroStreak {
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
	padding: 10px 20px;
	border-radius: 12px;
	background: color-mix(in srgb, var(--MI_THEME-accent) 8%, transparent);
}

.heroStreakNum {
	font-size: 2.2em;
	font-weight: 900;
	line-height: 1.1;
	color: var(--MI_THEME-accent);
	font-variant-numeric: tabular-nums;

	@media (max-width: 500px) {
		font-size: 1.8em;
	}
}

.heroStreakLabel {
	font-size: 0.72em;
	font-weight: 600;
	color: var(--MI_THEME-fgTransparentWeak);
}

// === 次要统计 ===
.statsGrid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 10px;

	@media (max-width: 500px) {
		grid-template-columns: 1fr;
	}
}

.statCard {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	padding: 14px 12px;
	border-radius: var(--MI-radius);
	text-align: center;
}

.statVal {
	font-size: 1.4em;
	font-weight: 800;
	color: var(--MI_THEME-fg);
	font-variant-numeric: tabular-nums;
	line-height: 1.2;

	small {
		font-size: 0.6em;
		font-weight: 600;
		margin-left: 2px;
		opacity: 0.7;
	}
}

.statLabel {
	font-size: 0.72em;
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 100%;
}

// === 紧凑日历 ===
.calendar {
	padding: 12px 14px;
	border-radius: var(--MI-radius);
}

.calHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 8px;
}

.calTitleBtn {
	font-weight: 700;
	font-size: 0.95em;
	color: var(--MI_THEME-fg);
	cursor: pointer;
	padding: 4px 12px;
	border-radius: 8px;
	transition: background-color 0.15s ease;

	&:hover {
		background: var(--MI_THEME-accentedBg);
	}
}

.calTitleChevron {
	font-size: 0.75em;
	margin-left: 2px;
	color: var(--MI_THEME-fgTransparentWeak);
	transition: transform 0.2s ease;
}

.calTitleChevronOpen {
	transform: rotate(180deg);
}

.monthPicker {
	margin-bottom: 10px;
	padding: 10px;
	border-radius: 10px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 4%, transparent);
	border: solid 1px var(--MI_THEME-divider);
}

.pickerYearRow {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 8px;
}

.pickerYear {
	font-weight: 700;
	font-size: 0.92em;
}

.pickerMonthGrid {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 6px;
}

.pickerMonth {
	padding: 7px 0;
	border-radius: 8px;
	font-size: 0.85em;
	font-weight: 600;
	color: var(--MI_THEME-fg);
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
	cursor: pointer;
	transition: background-color 0.12s ease, border-color 0.12s ease;

	&:hover {
		border-color: var(--MI_THEME-accent);
		background: var(--MI_THEME-accentedBg);
	}
}

.pickerMonthActive {
	background: var(--MI_THEME-accent);
	border-color: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent, #fff);

	&:hover {
		background: var(--MI_THEME-accent);
		border-color: var(--MI_THEME-accent);
	}
}

.calNav {
	padding: 5px 10px;
	border-radius: 8px;
	color: var(--MI_THEME-fg);
	cursor: pointer;
	font-size: 0.9em;

	&:hover {
		background: var(--MI_THEME-accentedBg);
		color: var(--MI_THEME-accent);
	}
}

.calGrid {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 6px;
}

.calWeekday {
	text-align: center;
	font-size: 0.72em;
	font-weight: 600;
	color: var(--MI_THEME-fgTransparentWeak);
	padding: 2px 0;
}

.calCell {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 2px;
	height: 46px;
	border-radius: 10px;
	border: 1.5px solid transparent;
	background: color-mix(in srgb, var(--MI_THEME-fg) 4%, transparent);
	cursor: default;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.calBlank {
	background: transparent;
}

.calToday {
	border-color: var(--MI_THEME-accent);
	background: var(--MI_THEME-accentedBg);
}

.calChecked {
	background: color-mix(in srgb, var(--MI_THEME-success) 13%, transparent);
	border-color: color-mix(in srgb, var(--MI_THEME-success) 30%, transparent);
}

.calMakeup {
	background: color-mix(in srgb, var(--MI_THEME-info) 13%, transparent);
	border-color: color-mix(in srgb, var(--MI_THEME-info) 30%, transparent);
}

.calCanMakeup {
	border: 1.5px dashed color-mix(in srgb, var(--MI_THEME-warn) 70%, transparent);
	background: color-mix(in srgb, var(--MI_THEME-warn) 5%, transparent);
	cursor: pointer;

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-warn) 14%, transparent);
	}
}

.calDayNum {
	font-size: 0.95em;
	font-weight: 700;
	line-height: 1;
	color: var(--MI_THEME-fg);
}

.calToday .calDayNum {
	color: var(--MI_THEME-accent);
	font-weight: 800;
}

.calReward {
	font-size: 0.62em;
	font-weight: 800;
	line-height: 1;
	color: var(--MI_THEME-success);
	font-variant-numeric: tabular-nums;
}

.calMakeupTag {
	font-size: 0.6em;
	font-weight: 700;
	line-height: 1;
	color: var(--MI_THEME-info);
}

.calMakeupHint {
	font-size: 0.6em;
	font-weight: 700;
	line-height: 1;
	color: var(--MI_THEME-warn);
}

// === 签到记录 ===
.records {
	padding: 16px;
	border-radius: var(--MI-radius);
}

.recordsTitle {
	font-weight: 700;
	font-size: 0.95em;
	margin-bottom: 10px;
	display: flex;
	align-items: center;
	gap: 6px;

	> i {
		color: var(--MI_THEME-accent);
	}
}

.recordsEmpty {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.88em;
	padding: 12px 0;
	text-align: center;
}

.recordRow {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 9px 10px;
	margin: 0 -10px;
	border-radius: 8px;
	font-size: 0.86em;
	transition: background-color 0.12s ease;

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-fg) 4%, transparent);
	}

	& + .recordRow {
		border-top: solid 0.5px var(--MI_THEME-divider);
	}
}

.recordLeft {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 6px;
}

.recordDate {
	color: var(--MI_THEME-fgTransparentWeak);
	font-variant-numeric: tabular-nums;
	font-size: 0.92em;
}

.recordMakeupBadge {
	display: inline-flex;
	align-items: center;
	padding: 1px 7px;
	border-radius: 999px;
	font-size: 0.72em;
	font-weight: 700;
	background: color-mix(in srgb, var(--MI_THEME-info) 14%, transparent);
	color: var(--MI_THEME-info);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-info) 30%, transparent);
}

.recordFormula {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--MI_THEME-fg);
	opacity: 0.75;
	font-size: 0.92em;
}

.recordReward {
	flex-shrink: 0;
	font-weight: 800;
	font-size: 1.02em;
	color: var(--MI_THEME-success);
	font-variant-numeric: tabular-nums;
}

.recordCost {
	color: var(--MI_THEME-error);
}
</style>
