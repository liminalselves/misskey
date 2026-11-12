<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<!-- 页码分页条：每页条数 + 左右箭头 + x / y（项目统一样式） -->
<div :class="$style.pagerBar">
	<div v-if="sizes != null" :class="$style.pageSizes">
		<button
			v-for="size in sizes"
			:key="size"
			type="button"
			class="_button"
			:class="[$style.pagerSizeBtn, pageSize === size ? $style.pagerSizeBtnActive : null]"
			@click="emit('update:pageSize', size)"
		>
			{{ size }}
		</button>
	</div>
	<button type="button" class="_button" :class="$style.pagerNavBtn" :disabled="page <= 1 || loading" aria-label="上一页" @click="emit('update:page', page - 1)"><i class="ti ti-chevron-left"></i></button>
	<span :class="$style.pagerText">{{ page }} / {{ totalPages }}</span>
	<button type="button" class="_button" :class="$style.pagerNavBtn" :disabled="page >= totalPages || loading" aria-label="下一页" @click="emit('update:page', page + 1)"><i class="ti ti-chevron-right"></i></button>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

const props = withDefaults(defineProps<{
	page: number;
	total: number;
	pageSize: number;
	loading: boolean;
	/** Page-size choices; null hides the size buttons. */
	sizes?: number[] | null;
}>(), {
	sizes: () => [10, 20, 50],
});

const emit = defineEmits<{
	(ev: 'update:page', v: number): void;
	(ev: 'update:pageSize', v: number): void;
}>();

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
</script>

<style lang="scss" module>
.pagerBar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 4px 0;
}

.pageSizes {
	display: inline-flex;
	overflow: hidden;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
}

.pagerSizeBtn {
	min-width: 36px;
	height: 28px;
	padding: 0 8px;
	border-right: solid 1px var(--MI_THEME-divider);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.82em;
	font-weight: 600;

	@media (pointer: coarse) {
		height: 34px;
	}
}

.pagerSizeBtn:last-child {
	border-right: none;
}

.pagerSizeBtnActive {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
}

.pagerNavBtn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 6px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);

	@media (pointer: coarse) {
		width: 34px;
		height: 34px;
	}
}

.pagerNavBtn:disabled {
	opacity: 0.4;
}

.pagerText {
	min-width: 4em;
	font-size: 0.85em;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	text-align: center;
}
</style>
