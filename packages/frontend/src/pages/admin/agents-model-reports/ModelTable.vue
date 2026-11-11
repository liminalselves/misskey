<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_s">
	<div :class="$style.toolbar">
		<div :class="$style.seg">
			<button type="button" class="_button" :class="[$style.segBtn, grouped ? $style.segBtnOn : null]" @click="grouped = true">按分类分组</button>
			<button type="button" class="_button" :class="[$style.segBtn, !grouped ? $style.segBtnOn : null]" @click="grouped = false">平铺</button>
		</div>
		<span :class="$style.hint"><i class="ti ti-hand-click"></i> 点击行可加入或移出模型筛选；此表不受模型筛选影响</span>
	</div>
	<MkResult v-if="rows.length === 0" type="empty" text="该时间范围内没有调用记录"/>
	<div v-else :class="$style.table">
		<div :class="$style.head">
			<span>模型</span>
			<button
				v-for="c in COLUMNS"
				:key="c.key"
				type="button"
				class="_button"
				:class="[$style.sortBtn, sortKey === c.key ? $style.sortBtnOn : null]"
				:title="c.title"
				@click="toggleSort(c.key)"
			>
				{{ c.label }}<i v-if="sortKey === c.key" :class="sortDesc ? 'ti ti-arrow-down' : 'ti ti-arrow-up'"></i>
			</button>
		</div>
		<template v-for="sec in sections" :key="sec.key">
			<div v-if="grouped" :class="$style.subtotal">
				<span>{{ sec.label }}<small :class="$style.muted"> · {{ sec.rows.length }} 个</small></span>
				<span v-for="c in COLUMNS" :key="c.key">{{ c.fmt(sec.sum, totalCredits) }}</span>
			</div>
			<div
				v-for="r in sec.rows"
				:key="r.modelId"
				:class="[
					$style.row,
					selectedSet.has(r.modelId) ? $style.rowOn : null,
					selectedSet.size > 0 && !selectedSet.has(r.modelId) ? $style.rowDim : null,
				]"
				role="button"
				tabindex="0"
				@click="emit('toggleModel', r.modelId)"
				@keydown.enter="emit('toggleModel', r.modelId)"
			>
				<span :class="$style.name">
					<span>{{ r.entry.name }}</span>
					<span v-if="!grouped" :class="$style.cat">{{ CATEGORY_LABELS[r.entry.category] }}</span>
					<span v-if="r.entry.state === 'unlisted'" :class="$style.state">已下架</span>
					<span v-else-if="r.entry.state === 'disabled'" :class="$style.state">已停用</span>
					<span v-else-if="r.entry.state === 'deleted'" :class="$style.state">已删除</span>
				</span>
				<span v-for="c in COLUMNS" :key="c.key" :class="c.key === 'failed' && r.m.failed > 0 ? $style.bad : null">{{ c.fmt(r.m, totalCredits) }}</span>
			</div>
		</template>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import {
	cacheHitRate, emptyMetrics, fmtCompact, fmtCredits, fmtInt, fmtMs, fmtPct, share, successRate,
	CATEGORY_LABELS,
} from './report-utils.js';
import type { CatalogEntry, ModelCategory, ReportMetrics } from './report-utils.js';

const props = defineProps<{
	rows: { modelId: string; m: ReportMetrics }[];
	catalog: Map<string, CatalogEntry>;
	selected: string[];
}>();

const emit = defineEmits<{
	(ev: 'toggleModel', id: string): void;
}>();

type ColKey = 'total' | 'success' | 'failed' | 'aborted' | 'successRate' | 'freeCalls' | 'paidCalls' | 'credits' | 'creditShare'
	| 'unitPrice' | 'users' | 'prompt' | 'completion' | 'cacheHit' | 'p50' | 'p95';

type Col = { key: ColKey; label: string; title?: string; val: (m: ReportMetrics) => number | null; fmt: (m: ReportMetrics, totalCredits: number) => string };

const unitPrice = (m: ReportMetrics) => (m.paidCalls > 0 ? m.credits / m.paidCalls : null);

const COLUMNS: Col[] = [
	{ key: 'total', label: '请求', val: m => m.total, fmt: m => fmtInt(m.total) },
	{ key: 'success', label: '成功', val: m => m.success, fmt: m => fmtInt(m.success) },
	{ key: 'failed', label: '失败', val: m => m.failed, fmt: m => fmtInt(m.failed) },
	{ key: 'aborted', label: '中断', val: m => m.aborted, fmt: m => fmtInt(m.aborted) },
	{ key: 'successRate', label: '成功率', title: '成功 ÷（请求 − 处理中）', val: successRate, fmt: m => fmtPct(successRate(m)) },
	{ key: 'freeCalls', label: '免费', title: '消耗每日免费额度的调用', val: m => m.freeCalls, fmt: m => fmtInt(m.freeCalls) },
	{ key: 'paidCalls', label: '付费', title: '实际扣费的调用', val: m => m.paidCalls, fmt: m => fmtInt(m.paidCalls) },
	{ key: 'credits', label: '扣费', val: m => m.credits, fmt: m => fmtCredits(m.credits) },
	{ key: 'creditShare', label: '扣费占比', val: m => m.credits, fmt: (m, t) => fmtPct(share(m.credits, t)) },
	{ key: 'unitPrice', label: '付费均价', title: '扣费 ÷ 付费次数', val: unitPrice, fmt: m => { const v = unitPrice(m); return v == null ? '—' : fmtCredits(v); } },
	{ key: 'users', label: '用户', val: m => m.users, fmt: m => fmtInt(m.users) },
	{ key: 'prompt', label: '输入 Token', val: m => m.promptTokens, fmt: m => fmtCompact(m.promptTokens) },
	{ key: 'completion', label: '输出 Token', val: m => m.completionTokens, fmt: m => fmtCompact(m.completionTokens) },
	{ key: 'cacheHit', label: '缓存命中', val: cacheHitRate, fmt: m => fmtPct(cacheHitRate(m)) },
	{ key: 'p50', label: 'P50', title: '成功调用耗时中位数', val: m => m.p50Ms, fmt: m => fmtMs(m.p50Ms) },
	{ key: 'p95', label: 'P95', title: '成功调用耗时 95 分位', val: m => m.p95Ms, fmt: m => fmtMs(m.p95Ms) },
];

const CATEGORY_ORDER: ModelCategory[] = ['llm', 'image', 'vision', 'byok', 'unassigned', 'deleted'];

const grouped = ref(true);
const sortKey = ref<ColKey>('total');
const sortDesc = ref(true);

const selectedSet = computed(() => new Set(props.selected));
const totalCredits = computed(() => props.rows.reduce((s, r) => s + r.m.credits, 0));

function toggleSort(key: ColKey) {
	if (sortKey.value === key) sortDesc.value = !sortDesc.value;
	else {
		sortKey.value = key;
		sortDesc.value = true;
	}
}

const enriched = computed(() => {
	const col = COLUMNS.find(c => c.key === sortKey.value) ?? COLUMNS[0];
	const list = props.rows.map(r => ({
		...r,
		entry: props.catalog.get(r.modelId) ?? { id: r.modelId, name: r.modelId, category: 'deleted' as const, state: 'deleted' as const },
	}));
	list.sort((a, b) => {
		const va = col.val(a.m) ?? -1;
		const vb = col.val(b.m) ?? -1;
		return sortDesc.value ? vb - va : va - vb;
	});
	return list;
});

/** Additive subtotal; distinct users and percentiles cannot be summed and are left blank. */
function subtotal(rows: { m: ReportMetrics }[]): ReportMetrics {
	const s = emptyMetrics();
	for (const { m } of rows) {
		s.total += m.total; s.success += m.success; s.failed += m.failed; s.aborted += m.aborted; s.pending += m.pending;
		s.freeCalls += m.freeCalls; s.paidCalls += m.paidCalls; s.credits += m.credits;
		s.promptTokens += m.promptTokens; s.completionTokens += m.completionTokens; s.cacheHitTokens += m.cacheHitTokens;
	}
	s.users = Number.NaN;
	return s;
}

const sections = computed(() => {
	if (!grouped.value) return [{ key: 'all', label: '', rows: enriched.value, sum: emptyMetrics() }];
	return CATEGORY_ORDER
		.map(cat => {
			const rows = enriched.value.filter(r => r.entry.category === cat);
			return { key: cat, label: CATEGORY_LABELS[cat], rows, sum: subtotal(rows) };
		})
		.filter(s => s.rows.length > 0);
});
</script>

<style lang="scss" module>
.toolbar {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px 14px;
}

.seg {
	display: inline-flex;
	padding: 2px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 7%, transparent);
}

.segBtn {
	padding: 4px 10px;
	border-radius: 6px;
	font-size: 0.82em;
	opacity: 0.7;
}

.segBtnOn {
	background: var(--MI_THEME-panel);
	opacity: 1;
	font-weight: 600;
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}

.hint {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	font-size: 0.78em;
	opacity: 0.56;
}

.muted {
	opacity: 0.56;
	font-weight: 400;
}

.bad {
	color: var(--MI_THEME-error);
}

/*
 * One grid for the whole table, rows display:contents: columns align across rows by max-content,
 * the table scrolls horizontally, nothing is truncated.
 */
.table {
	display: grid;
	grid-template-columns: minmax(max-content, 2.4fr) repeat(16, minmax(max-content, 1fr));
	overflow-x: auto;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 10px;
	font-size: 0.86em;
	font-variant-numeric: tabular-nums;
}

.head,
.row,
.subtotal {
	display: contents;

	> * {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding: 8px 8px;
		white-space: nowrap;
		border-bottom: solid 1px var(--MI_THEME-divider);
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

.sortBtn {
	gap: 2px;

	&:hover {
		color: var(--MI_THEME-accent);
	}
}

.sortBtnOn {
	color: var(--MI_THEME-accent);
}

.subtotal > * {
	font-weight: 700;
	font-size: 0.92em;
	background: color-mix(in srgb, var(--MI_THEME-fg) 4%, transparent);
}

.row {
	cursor: pointer;

	&:hover > * {
		background: color-mix(in srgb, var(--MI_THEME-accent) 6%, transparent);
	}

	&:focus-visible > * {
		background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	}

	&:last-child > * {
		border-bottom: none;
	}
}

.rowOn > * {
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
}

.rowOn > *:first-child {
	box-shadow: inset 3px 0 0 var(--MI_THEME-accent);
}

.rowDim > * {
	opacity: 0.5;
}

.name {
	gap: 6px;
	font-weight: 600;
}

.cat,
.state {
	padding: 1px 6px;
	border-radius: 999px;
	font-size: 0.78em;
	font-weight: 500;
	background: color-mix(in srgb, var(--MI_THEME-fg) 10%, transparent);
}

.state {
	background: color-mix(in srgb, var(--MI_THEME-warn) 22%, transparent);
}
</style>
