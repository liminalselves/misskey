<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkResult v-if="items.length === 0" type="empty" text="该时间范围内没有调用记录"/>
<div v-else :class="$style.list">
	<div v-for="it in shown" :key="it.modelId" :class="$style.item">
		<div :class="$style.line">
			<span :class="$style.name">{{ it.name }}</span>
			<span :class="$style.nums">
				<span :class="$style.total">{{ fmtInt(it.m.total) }} 次</span>
				<span :class="it.rate != null && it.rate < 90 ? $style.rateLow : $style.rate">成功 {{ fmtPct(it.rate) }}</span>
				<span :class="$style.credits">扣费 {{ fmtCredits(it.m.credits) }}</span>
			</span>
		</div>
		<div :class="$style.bar"><span :style="{ width: `${it.width}%` }"></span></div>
	</div>
	<div v-if="items.length > shown.length" :class="$style.more">另有 {{ items.length - shown.length }} 个模型，切换到详细模式查看全部</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { fmtCredits, fmtInt, fmtPct, successRate } from './report-utils.js';
import type { CatalogEntry, ReportMetrics } from './report-utils.js';

/** Top models by request count, one line each: simple mode's replacement for the full model table. */
const props = withDefaults(defineProps<{
	rows: { modelId: string; m: ReportMetrics }[];
	catalog: Map<string, CatalogEntry>;
	limit?: number;
}>(), { limit: 8 });

const items = computed(() => {
	const list = props.rows
		.filter(r => r.m.total > 0)
		.sort((a, b) => b.m.total - a.m.total);
	const max = list[0]?.m.total ?? 0;
	return list.map(r => ({
		modelId: r.modelId,
		name: props.catalog.get(r.modelId)?.name ?? r.modelId,
		m: r.m,
		rate: successRate(r.m),
		width: max > 0 ? Math.max(2, (r.m.total / max) * 100) : 0,
	}));
});

const shown = computed(() => items.value.slice(0, props.limit));
</script>

<style lang="scss" module>
.list {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.item {
	min-width: 0;
}

.line {
	display: flex;
	align-items: baseline;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 2px 12px;
}

.name {
	flex: 1 1 10em;
	min-width: 0;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.nums {
	display: flex;
	flex-wrap: wrap;
	gap: 0 12px;
	font-size: 0.82em;
	font-variant-numeric: tabular-nums;
}

.total {
	font-weight: 600;
}

.rate,
.credits {
	opacity: 0.66;
}

.rateLow {
	color: var(--MI_THEME-warn);
	font-weight: 600;
}

.bar {
	height: 5px;
	margin-top: 5px;
	border-radius: 999px;
	overflow: hidden;
	background: color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);

	> span {
		display: block;
		height: 100%;
		border-radius: 999px;
		background: var(--MI_THEME-accent);
	}
}

.more {
	font-size: 0.78em;
	opacity: 0.56;
}
</style>
