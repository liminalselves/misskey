<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.grid">
	<ReportPanel title="计费构成" icon="ti ti-receipt" caption="按调用次数，互斥分类" :loading="loading" :error="error" :hasData="data != null" @retry="emit('retry')">
		<template v-if="data != null">
			<MkResult v-if="billingTotal === 0" type="empty" text="暂无数据"/>
			<template v-else>
				<div :class="$style.shareBar">
					<span v-for="b in billingRows" :key="b.category" :style="{ width: `${b.share}%`, background: b.color }" :title="`${b.label} ${b.count}`"></span>
				</div>
				<div :class="$style.legend">
					<div v-for="b in billingRows" :key="b.category" :class="$style.legendRow">
						<span :class="$style.dot" :style="{ background: b.color }"></span>
						<span :class="$style.legendLabel">{{ b.label }}</span>
						<span :class="$style.num">{{ fmtInt(b.count) }}</span>
						<span :class="[$style.num, $style.muted]">{{ fmtPct(b.share) }}</span>
						<span :class="[$style.num, $style.muted]">{{ b.credits > 0 ? fmtCredits(b.credits) : '' }}</span>
					</div>
				</div>
			</template>
		</template>
	</ReportPanel>

	<ReportPanel title="用途构成" icon="ti ti-category" :loading="loading" :error="error" :hasData="data != null" @retry="emit('retry')">
		<template v-if="data != null">
			<MkResult v-if="data.usageKinds.length === 0" type="empty" text="暂无数据"/>
			<div v-else :class="$style.kindTable">
				<div :class="$style.kindHead">
					<span>用途</span><span>请求</span><span>占比</span><span>成功率</span><span>扣费</span><span>Token</span><span>P50</span>
				</div>
				<div v-for="k in data.usageKinds" :key="k.usageKind" :class="$style.kindRow">
					<span :class="$style.kindName">{{ USAGE_KIND_LABELS[k.usageKind] ?? k.usageKind }}</span>
					<span>{{ fmtInt(k.m.total) }}</span>
					<span :class="$style.muted">{{ fmtPct(share(k.m.total, usageTotal)) }}</span>
					<span>{{ fmtPct(successRate(k.m)) }}</span>
					<span>{{ fmtCredits(k.m.credits) }}</span>
					<span>{{ fmtCompact(totalTokens(k.m)) }}</span>
					<span>{{ fmtMs(k.m.p50Ms) }}</span>
				</div>
			</div>
		</template>
	</ReportPanel>

	<ReportPanel title="失败原因" icon="ti ti-alert-triangle" caption="按错误码，前 10" :loading="loading" :error="error" :hasData="data != null" @retry="emit('retry')">
		<template v-if="data != null">
			<MkResult v-if="data.errorCodes.length === 0" type="empty" text="该范围内没有失败调用"/>
			<div v-else :class="$style.errorList">
				<div v-for="e in data.errorCodes" :key="e.errorCode">
					<div :class="$style.errorHead">
						<code :class="$style.errorCode">{{ e.errorCode }}</code>
						<span :class="$style.num">{{ fmtInt(e.count) }}</span>
					</div>
					<div :class="$style.errorBar"><span :style="{ width: `${(e.count / data.errorCodes[0].count) * 100}%` }"></span></div>
					<div :class="$style.errorMeta">{{ e.models }} 个模型 · {{ e.users }} 位用户 · 最近 <MkTime :time="e.lastAt"/></div>
				</div>
			</div>
		</template>
	</ReportPanel>

	<ReportPanel title="活跃时段" icon="ti ti-calendar-time" caption="北京时间，星期 × 小时" :loading="loading" :error="error" :hasData="data != null" @retry="emit('retry')">
		<template v-if="data != null">
			<MkResult v-if="heatMax === 0" type="empty" text="暂无数据"/>
			<div v-else :class="$style.heatWrap">
				<div :class="$style.heat">
					<span></span>
					<span v-for="h in 24" :key="'h' + h" :class="$style.heatHour">{{ (h - 1) % 3 === 0 ? h - 1 : '' }}</span>
					<template v-for="(row, di) in heatGrid" :key="'d' + di">
						<span :class="$style.heatDay">{{ WEEKDAYS[di] }}</span>
						<span
							v-for="(v, hi) in row"
							:key="di + '-' + hi"
							:class="$style.heatCell"
							:style="{ background: heatColor(v) }"
							:title="`${WEEKDAYS[di]} ${hi}:00 · ${v} 次`"
						></span>
					</template>
				</div>
				<div :class="$style.heatFoot">
					<span>高峰 {{ heatPeak }}</span>
					<span :class="$style.heatScale">少<i v-for="lv in 5" :key="lv" :style="{ background: heatColor(heatMax * lv / 5) }"></i>多</span>
				</div>
			</div>
		</template>
	</ReportPanel>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import ReportPanel from './ReportPanel.vue';
import {
	fmtCompact, fmtCredits, fmtInt, fmtMs, fmtPct, share, successRate, totalTokens,
	BILLING_LABELS, USAGE_KIND_LABELS,
} from './report-utils.js';
import type { ReportMetrics } from './report-utils.js';

export type BreakdownsData = {
	usageKinds: { usageKind: string; m: ReportMetrics }[];
	billing: { category: string; count: number; credits: number }[];
	errorCodes: { errorCode: string; count: number; models: number; users: number; lastAt: string }[];
	heatmap: { dow: number; hour: number; count: number }[];
};

const props = defineProps<{
	data: BreakdownsData | null;
	loading: boolean;
	error: boolean;
}>();

const emit = defineEmits<{
	(ev: 'retry'): void;
}>();

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const BILLING_ORDER = ['paid', 'free', 'zeroPriced', 'byok', 'unassigned', 'failed', 'pending'];
const BILLING_COLORS: Record<string, string> = {
	paid: '#f2a03d', free: '#4caf50', zeroPriced: '#4db6ac', byok: '#64b5f6', unassigned: '#b085cc', failed: '#ec4137', pending: '#9fb3c8',
};

const billingTotal = computed(() => (props.data?.billing ?? []).reduce((s, b) => s + b.count, 0));
const usageTotal = computed(() => (props.data?.usageKinds ?? []).reduce((s, k) => s + k.m.total, 0));

const billingRows = computed(() => {
	const rows = [...(props.data?.billing ?? [])].filter(b => b.count > 0);
	rows.sort((a, b) => BILLING_ORDER.indexOf(a.category) - BILLING_ORDER.indexOf(b.category));
	return rows.map(b => ({
		...b,
		label: BILLING_LABELS[b.category] ?? b.category,
		color: BILLING_COLORS[b.category] ?? '#9fb3c8',
		share: billingTotal.value > 0 ? (b.count / billingTotal.value) * 100 : 0,
	}));
});

const heatGrid = computed(() => {
	const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
	for (const c of props.data?.heatmap ?? []) {
		if (c.dow >= 1 && c.dow <= 7 && c.hour >= 0 && c.hour < 24) grid[c.dow - 1][c.hour] = c.count;
	}
	return grid;
});

const heatMax = computed(() => Math.max(0, ...heatGrid.value.flat()));

const heatPeak = computed(() => {
	let best = { d: 0, h: 0, v: -1 };
	heatGrid.value.forEach((row, d) => row.forEach((v, h) => { if (v > best.v) best = { d, h, v }; }));
	return best.v > 0 ? `${WEEKDAYS[best.d]} ${best.h}:00（${fmtInt(best.v)} 次）` : '—';
});

function heatColor(v: number): string {
	if (v <= 0 || heatMax.value === 0) return 'color-mix(in srgb, var(--MI_THEME-fg) 6%, transparent)';
	return `color-mix(in srgb, var(--MI_THEME-accent) ${Math.round(15 + (v / heatMax.value) * 85)}%, transparent)`;
}
</script>

<style lang="scss" module>
.grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;

	@container (max-width: 820px) {
		grid-template-columns: minmax(0, 1fr);
	}
}

.num {
	font-variant-numeric: tabular-nums;
	text-align: right;
}

.muted {
	opacity: 0.6;
}

.shareBar {
	display: flex;
	height: 12px;
	border-radius: 999px;
	overflow: hidden;
	background: color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);

	> span {
		display: block;
		height: 100%;
		min-width: 2px;
	}
}

.legend {
	display: grid;
	grid-template-columns: 10px minmax(max-content, 1fr) max-content max-content max-content;
	gap: 8px 12px;
	align-items: center;
	margin-top: 14px;
	font-size: 0.86em;
}

.legendRow {
	display: contents;
}

.dot {
	width: 10px;
	height: 10px;
	border-radius: 3px;
}

.legendLabel {
	font-weight: 600;
}

/* Same table rules as the model table: one grid, rows display:contents, horizontal scroll. */
.kindTable {
	display: grid;
	grid-template-columns: minmax(max-content, 1.4fr) repeat(6, minmax(max-content, 1fr));
	overflow-x: auto;
	font-size: 0.86em;
	font-variant-numeric: tabular-nums;
}

.kindHead,
.kindRow {
	display: contents;

	> * {
		padding: 7px 8px;
		white-space: nowrap;
		border-bottom: solid 1px var(--MI_THEME-divider);
		text-align: right;
	}

	> *:first-child {
		padding-left: 0;
		text-align: left;
	}

	> *:last-child {
		padding-right: 0;
	}
}

.kindHead > * {
	font-size: 0.88em;
	font-weight: 600;
	opacity: 0.56;
}

.kindRow:last-child > * {
	border-bottom: none;
}

.kindName {
	font-weight: 600;
}

.errorList {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.errorHead {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.86em;
}

.errorCode {
	min-width: 0;
	overflow-wrap: anywhere;
}

.errorBar {
	height: 5px;
	margin: 4px 0 3px;
	border-radius: 999px;
	overflow: hidden;
	background: color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);

	> span {
		display: block;
		height: 100%;
		border-radius: 999px;
		background: var(--MI_THEME-error);
	}
}

.errorMeta {
	font-size: 0.75em;
	opacity: 0.56;
}

.heatWrap {
	overflow-x: auto;
}

.heat {
	display: grid;
	grid-template-columns: 2.6em repeat(24, minmax(9px, 1fr));
	gap: 3px;
	min-width: 340px;
	font-size: 0.7em;
}

.heatHour {
	opacity: 0.5;
	font-variant-numeric: tabular-nums;
}

.heatDay {
	display: flex;
	align-items: center;
	opacity: 0.66;
}

.heatCell {
	aspect-ratio: 1;
	border-radius: 2px;
}

.heatFoot {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 10px;
	font-size: 0.8em;
	opacity: 0.8;
}

.heatScale {
	display: inline-flex;
	align-items: center;
	gap: 3px;

	> i {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 2px;
	}
}
</style>
