<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<!-- 吸顶筛选栏；折叠后只保留一行摘要，避免滚动时遮挡内容 -->
<div :class="[$style.filterBar, state.collapsed.value ? $style.filterBarCollapsed : null]">
	<div :class="$style.barHead">
		<button type="button" class="_button" :class="$style.collapseBtn" :aria-expanded="!state.collapsed.value" @click="state.collapsed.value = !state.collapsed.value">
			<i class="ti ti-filter"></i>
			<span :class="$style.summaryText">{{ state.summary.value }}</span>
			<i :class="state.collapsed.value ? 'ti ti-chevron-down' : 'ti ti-chevron-up'"></i>
		</button>
		<div :class="$style.filterActions">
			<button type="button" class="_button" :class="$style.iconBtn" :disabled="state.activeCount.value === 0" title="重置筛选" aria-label="重置筛选" @click="state.reset()"><i class="ti ti-filter-off"></i></button>
			<button v-if="exportable" type="button" class="_button" :class="$style.iconBtn" title="导出 CSV" aria-label="导出 CSV" @click="emit('export')"><i class="ti ti-download"></i></button>
			<button type="button" class="_button" :class="$style.iconBtn" title="刷新" aria-label="刷新" :disabled="loading" @click="emit('refresh')"><i class="ti ti-refresh" :class="loading ? $style.spin : null"></i></button>
		</div>
	</div>

	<template v-if="!state.collapsed.value">
		<div :class="$style.field">
			<span :class="$style.fieldLabel">时间</span>
			<div :class="[$style.seg, $style.scrollRow]" role="group" aria-label="时间范围">
				<button
					v-for="r in RANGE_PRESETS"
					:key="r.key"
					type="button"
					class="_button"
					:class="[$style.segBtn, f.range === r.key ? $style.segBtnOn : null]"
					@click="f.range = r.key"
				>
					{{ r.label }}
				</button>
			</div>
		</div>
		<div v-if="f.range === 'custom'" :class="$style.customRange">
			<input v-model="f.customFrom" type="date" :class="$style.dateInput" :max="todayStr" aria-label="开始日期"/>
			<span :class="$style.muted">至</span>
			<input v-model="f.customTo" type="date" :class="$style.dateInput" :max="todayStr" aria-label="结束日期"/>
		</div>
		<div :class="$style.fieldRow">
			<div :class="$style.field">
				<span :class="$style.fieldLabel">粒度</span>
				<div :class="$style.seg" role="group" aria-label="粒度">
					<button
						v-for="b in BUCKET_CHOICES"
						:key="b.key"
						type="button"
						class="_button"
						:class="[$style.segBtn, f.bucket === b.key ? $style.segBtnOn : null]"
						:disabled="!state.bucketAvail.value[b.key]"
						:title="!state.bucketAvail.value[b.key] ? '当前时间范围不支持该粒度' : ''"
						@click="f.bucket = b.key"
					>
						{{ b.label }}
					</button>
				</div>
			</div>
			<div :class="$style.field">
				<span :class="$style.fieldLabel">模型</span>
				<button ref="modelBtnEl" type="button" class="_button" :class="[$style.dropBtn, f.modelIds.length > 0 ? $style.dropBtnOn : null]" @click="openModelPicker">
					<i class="ti ti-cpu"></i>
					<span>{{ f.modelIds.length === 0 ? '全部模型' : `已选 ${f.modelIds.length} 个` }}</span>
					<i class="ti ti-chevron-down"></i>
				</button>
			</div>
			<label :class="$style.compare">
				<input v-model="f.compare" type="checkbox"/>
				<span>对比上一周期</span>
			</label>
		</div>
		<div :class="$style.field">
			<span :class="$style.fieldLabel">用途</span>
			<div :class="[$style.chips, $style.scrollRow]" role="group" aria-label="用途">
				<button
					v-for="k in USAGE_KINDS"
					:key="k"
					type="button"
					class="_button"
					:class="[$style.chip, f.usageKinds.includes(k) ? $style.chipOn : null]"
					:aria-pressed="f.usageKinds.includes(k)"
					@click="state.toggleUsageKind(k)"
				>
					{{ USAGE_KIND_LABELS[k] }}
				</button>
			</div>
		</div>
		<div v-if="f.modelIds.length > 0" :class="$style.selectedRow">
			<span v-for="id in f.modelIds" :key="id" :class="$style.selChip">
				{{ modelName(id) }}
				<button type="button" class="_button" :aria-label="`移除 ${modelName(id)}`" @click="state.toggleModel(id)"><i class="ti ti-x"></i></button>
			</span>
			<button type="button" class="_textButton" :class="$style.clearModels" @click="f.modelIds = []">清除模型筛选</button>
		</div>
		<div :class="$style.rangeText">{{ state.rangeText.value }}</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { useTemplateRef } from 'vue';
import ModelPicker from './ModelPicker.vue';
import { BUCKET_CHOICES } from './use-report-filters.js';
import { beijingDateString, RANGE_PRESETS, USAGE_KINDS, USAGE_KIND_LABELS } from './report-utils.js';
import type { ReportFiltersState } from './use-report-filters.js';
import type { CatalogEntry } from './report-utils.js';
import * as os from '@/os.js';

const props = defineProps<{
	state: ReportFiltersState;
	catalog: CatalogEntry[];
	modelName: (id: string) => string;
	loading: boolean;
	exportable?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'refresh'): void;
	(ev: 'export'): void;
}>();

// The reactive filter object itself; mutating it is the component's job.
// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const f = props.state.filters;
const todayStr = beijingDateString(Date.now());
const modelBtnEl = useTemplateRef('modelBtnEl');

function openModelPicker() {
	const { dispose } = os.popup(ModelPicker, {
		catalog: props.catalog,
		modelValue: f.modelIds,
		anchorElement: modelBtnEl.value,
	}, {
		'update:modelValue': (v: string[]) => { f.modelIds = v; },
		closed: () => dispose(),
	});
}
</script>

<style lang="scss" module>
.filterBar {
	position: sticky;
	top: var(--MI-stickyTop, 0);
	z-index: 3;
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px 12px;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-bg) 88%, transparent);
	backdrop-filter: var(--MI-blur, blur(12px));
}

.filterBarCollapsed {
	padding-top: 6px;
	padding-bottom: 6px;
}

.barHead {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
}

.collapseBtn {
	display: flex;
	align-items: center;
	gap: 8px;
	flex: 1;
	min-width: 0;
	min-height: 32px;
	padding: 0 4px;
	border-radius: 6px;
	text-align: left;
	font-size: 0.85em;
	font-weight: 600;

	> i {
		flex-shrink: 0;
		opacity: 0.7;
	}

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-fg) 6%, transparent);
	}
}

.summaryText {
	flex: 1;
	min-width: 0;
	overflow-wrap: anywhere;
}

.filterActions {
	display: flex;
	align-items: center;
	flex-shrink: 0;
	gap: 2px;
}

.field {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.fieldLabel {
	flex-shrink: 0;
	width: 2.4em;
	font-size: 0.78em;
	font-weight: 600;
	opacity: 0.6;
}

.fieldRow {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px 16px;
}

/* Long option rows scroll sideways on narrow screens instead of wrapping into a tall block. */
.scrollRow {
	min-width: 0;
	max-width: 100%;
	flex-wrap: nowrap;
	overflow-x: auto;
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}

	> * {
		flex-shrink: 0;
	}
}

.seg {
	display: inline-flex;
	flex-wrap: wrap;
	padding: 2px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 7%, transparent);
}

.segBtn {
	padding: 4px 10px;
	border-radius: 6px;
	font-size: 0.82em;
	white-space: nowrap;
	opacity: 0.72;

	&:hover:not(:disabled) {
		opacity: 1;
	}

	&:disabled {
		opacity: 0.3;
		cursor: default;
	}
}

@media (pointer: coarse) {
	.segBtn {
		padding: 6px 12px;
	}

	.chip {
		height: 30px;
	}

	.iconBtn,
	.dropBtn {
		height: 34px;
	}

	.iconBtn {
		width: 34px;
	}
}

.segBtnOn {
	background: var(--MI_THEME-panel);
	opacity: 1;
	font-weight: 600;
	color: var(--MI_THEME-accent);
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}

.customRange {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
	padding-left: calc(2.4em * 0.78 + 8px);
}

.dateInput {
	box-sizing: border-box;
	height: 30px;
	padding: 0 8px;
	border-radius: 6px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	font: inherit;
	font-size: 0.85em;
	color-scheme: light dark;

	/* iOS Safari zooms the whole page when focusing an input below 16px. */
	@media (pointer: coarse) {
		height: 34px;
		font-size: 16px;
	}
}

.dropBtn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 30px;
	padding: 0 10px;
	border-radius: 8px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	font-size: 0.85em;
	font-weight: 600;

	&:hover {
		border-color: var(--MI_THEME-accent);
	}
}

.dropBtnOn {
	border-color: var(--MI_THEME-accent);
	color: var(--MI_THEME-accent);
}

.chips {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.chip {
	height: 26px;
	padding: 0 10px;
	border-radius: 999px;
	border: solid 1px var(--MI_THEME-divider);
	font-size: 0.8em;
	opacity: 0.8;

	&:hover {
		opacity: 1;
		border-color: var(--MI_THEME-accent);
	}
}

.chipOn {
	opacity: 1;
	border-color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, transparent);
	color: var(--MI_THEME-accent);
	font-weight: 600;
}

.compare {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	margin-right: 4px;
	font-size: 0.82em;
	cursor: pointer;
	user-select: none;
}

.iconBtn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	border-radius: 8px;

	&:hover:not(:disabled) {
		background: color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
	}

	&:disabled {
		opacity: 0.35;
	}
}

.spin {
	animation: spin 0.9s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.selectedRow {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
}

.selChip {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 4px 2px 10px;
	border-radius: 999px;
	font-size: 0.8em;
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, transparent);
	color: var(--MI_THEME-accent);

	> button {
		display: inline-flex;
		padding: 2px;
		border-radius: 999px;

		&:hover {
			background: color-mix(in srgb, var(--MI_THEME-accent) 20%, transparent);
		}
	}
}

.clearModels {
	font-size: 0.8em;
}

.rangeText {
	font-size: 0.75em;
	opacity: 0.56;
	font-variant-numeric: tabular-nums;
}

.muted {
	opacity: 0.56;
}
</style>
