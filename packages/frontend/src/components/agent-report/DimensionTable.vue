<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_s">
	<MkResult v-if="items.length === 0" type="empty" :text="emptyText"/>
	<template v-else>
		<div :class="$style.table">
			<div :class="$style.head">
				<span>{{ nameLabel }}</span><span>请求</span><span>占比</span><span>成功率</span><span>扣费</span><span>Token</span>
			</div>
			<div v-for="it in items" :key="it.id" :class="$style.row">
				<span :class="$style.name">{{ it.name ?? '已删除' }}</span>
				<span>{{ fmtInt(it.m.total) }}</span>
				<span :class="$style.muted">{{ fmtPct(share(it.m.total, grandTotal)) }}</span>
				<span>{{ fmtPct(successRate(it.m)) }}</span>
				<span>{{ fmtCredits(it.m.credits) }}</span>
				<span>{{ fmtCompact(totalTokens(it.m)) }}</span>
			</div>
		</div>
		<MkPagerBar v-if="total > pageSize" :page="page" :total="total" :pageSize="pageSize" :loading="loading" :sizes="null" @update:page="emit('update:page', $event)"/>
	</template>
</div>
</template>

<script lang="ts" setup>
import MkPagerBar from './MkPagerBar.vue';
import { fmtCompact, fmtCredits, fmtInt, fmtPct, share, successRate, totalTokens } from './report-utils.js';
import type { ReportMetrics } from './report-utils.js';

defineProps<{
	items: { id: string; name: string | null; m: ReportMetrics }[];
	total: number;
	page: number;
	pageSize: number;
	loading: boolean;
	/** Request count of the whole window, for the share column. */
	grandTotal: number;
	nameLabel: string;
	emptyText: string;
}>();

const emit = defineEmits<{
	(ev: 'update:page', v: number): void;
}>();
</script>

<style lang="scss" module>
.muted {
	opacity: 0.6;
}

/* Same table rules as the model table: one grid, rows display:contents, horizontal scroll. */
.table {
	display: grid;
	grid-template-columns: minmax(max-content, 2fr) repeat(5, minmax(max-content, 1fr));
	overflow-x: auto;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 10px;
	font-size: 0.86em;
	font-variant-numeric: tabular-nums;
}

.head,
.row {
	display: contents;

	> * {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding: 8px 8px;
		white-space: nowrap;
		border-bottom: solid 1px var(--MI_THEME-divider);

		@media (pointer: coarse) {
			padding: 10px 8px;
		}
	}

	> *:first-child {
		justify-content: flex-start;
		padding-left: 14px;
	}

	> *:last-child {
		padding-right: 14px;
	}
}

.head > * {
	font-size: 0.86em;
	font-weight: 600;
	background: var(--MI_THEME-panel);
	opacity: 0.85;
}

.row:last-child > * {
	border-bottom: none;
}

.name {
	font-weight: 600;
}
</style>
