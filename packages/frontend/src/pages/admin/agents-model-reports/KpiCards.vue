<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.grid">
	<button
		v-for="card in cards"
		:key="card.key"
		v-panel
		type="button"
		class="_button"
		:class="[$style.card, active === card.key ? $style.cardActive : null]"
		:aria-pressed="active === card.key"
		@click="emit('select', card.key)"
	>
		<div :class="$style.label"><i :class="card.icon"></i>{{ card.label }}</div>
		<div :class="$style.value">{{ card.value }}</div>
		<div :class="$style.foot">
			<span
				:class="card.tone === 'good' ? $style.good : card.tone === 'bad' ? $style.bad : $style.neutral"
				:title="`上一周期：${card.previous}`"
			>{{ card.delta }}</span>
			<span :class="$style.sub">{{ card.sub }}</span>
		</div>
		<svg :class="$style.spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
			<polyline :points="card.spark" fill="none" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
		</svg>
	</button>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import {
	cacheHitRate, deltaOf, deltaText, deltaTone, fmtMetric, fmtMs, fmtPct, metricValue,
} from './report-utils.js';
import type { MetricKey, ReportMetrics } from './report-utils.js';

const props = defineProps<{
	current: ReportMetrics;
	previous: ReportMetrics;
	series: ReportMetrics[];
	active: MetricKey;
}>();

const emit = defineEmits<{
	(ev: 'select', key: MetricKey): void;
}>();

function sparkPoints(key: MetricKey): string {
	const vals = props.series.map(m => metricValue(m, key));
	if (vals.length < 2) return '';
	const nums = vals.filter((v): v is number => v != null);
	const max = Math.max(0, ...nums);
	const min = key === 'successRate' || key === 'latency' ? Math.min(...nums, max) : 0;
	const span = max - min || 1;
	return vals.map((v, i) => {
		const x = (i / (vals.length - 1)) * 100;
		const y = v == null ? 27 : 27 - ((v - min) / span) * 24;
		return `${x.toFixed(2)},${y.toFixed(2)}`;
	}).join(' ');
}

const META: { key: MetricKey; label: string; icon: string }[] = [
	{ key: 'total', label: '请求数', icon: 'ti ti-activity' },
	{ key: 'successRate', label: '成功率', icon: 'ti ti-circle-check' },
	{ key: 'credits', label: '扣费额度', icon: 'ti ti-coins' },
	{ key: 'users', label: '活跃用户', icon: 'ti ti-users' },
	{ key: 'tokens', label: 'Token', icon: 'ti ti-text-size' },
	{ key: 'latency', label: '耗时 P50', icon: 'ti ti-clock-bolt' },
];

const cards = computed(() => {
	const c = props.current;
	const p = props.previous;
	return META.map(meta => {
		const d = deltaOf(meta.key, c, p);
		let sub = '';
		switch (meta.key) {
			case 'total': sub = `失败 ${c.failed} · 中断 ${c.aborted}`; break;
			case 'successRate': sub = `成功 ${c.success} / ${c.total - c.pending}`; break;
			case 'credits': sub = `付费 ${c.paidCalls} 次 · 免费 ${c.freeCalls} 次`; break;
			case 'users': sub = c.users > 0 ? `人均 ${(c.total / c.users).toFixed(1)} 次` : ''; break;
			case 'tokens': sub = `缓存命中 ${fmtPct(cacheHitRate(c))}`; break;
			case 'latency': sub = `P95 ${fmtMs(c.p95Ms)}`; break;
		}
		return {
			...meta,
			value: fmtMetric(meta.key, metricValue(c, meta.key)),
			previous: fmtMetric(meta.key, metricValue(p, meta.key)),
			delta: deltaText(d),
			tone: deltaTone(meta.key, d),
			sub,
			spark: sparkPoints(meta.key),
		};
	});
});
</script>

<style lang="scss" module>
.grid {
	display: grid;
	grid-template-columns: repeat(6, minmax(0, 1fr));
	gap: 10px;

	@container (max-width: 1100px) {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	@container (max-width: 560px) {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.card {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 4px;
	box-sizing: border-box;
	min-width: 0;
	padding: 12px 14px 30px;
	border-radius: var(--MI-radius);
	border: solid 1px transparent;
	text-align: left;
	overflow: hidden;
	color: var(--MI_THEME-fg);
	transition: border-color 0.15s;

	&:hover {
		border-color: color-mix(in srgb, var(--MI_THEME-accent) 40%, transparent);
	}
}

.cardActive {
	border-color: var(--MI_THEME-accent);
	box-shadow: inset 0 3px 0 var(--MI_THEME-accent);
}

.label {
	display: flex;
	align-items: center;
	gap: 5px;
	font-size: 0.78em;
	font-weight: 600;
	opacity: 0.66;
}

.value {
	font-size: 1.45em;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	line-height: 1.2;
}

.foot {
	display: flex;
	flex-wrap: wrap;
	gap: 2px 8px;
	font-size: 0.74em;
	font-variant-numeric: tabular-nums;
}

.sub {
	opacity: 0.56;
}

.neutral {
	opacity: 0.66;
}

.good {
	color: var(--MI_THEME-success);
	font-weight: 600;
}

.bad {
	color: var(--MI_THEME-error);
	font-weight: 600;
}

.spark {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 4px;
	width: 100%;
	height: 22px;
	color: var(--MI_THEME-accent);
	opacity: 0.55;
}
</style>
