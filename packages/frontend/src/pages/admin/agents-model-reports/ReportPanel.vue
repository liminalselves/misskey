<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section v-panel :class="$style.root">
	<header :class="$style.head">
		<div :class="$style.title">
			<i v-if="icon" :class="icon"></i>
			<span>{{ title }}</span>
			<span v-if="caption" :class="$style.caption">{{ caption }}</span>
		</div>
		<div :class="$style.actions"><slot name="actions"></slot></div>
	</header>
	<div v-if="error && hasData" :class="$style.staleBar">
		<i class="ti ti-alert-triangle"></i> 刷新失败，当前显示的是上次的数据。
		<button type="button" class="_textButton" @click="emit('retry')">重试</button>
	</div>
	<div v-if="!hasData && loading" :class="$style.placeholder"><MkLoading/></div>
	<div v-else-if="!hasData && error" :class="$style.placeholder">
		<MkResult type="error" text="加载失败"/>
		<MkButton rounded small @click="emit('retry')"><i class="ti ti-refresh"></i> 重试</MkButton>
	</div>
	<div v-else-if="hasData" :class="[$style.body, loading ? $style.bodyLoading : null]">
		<slot></slot>
	</div>
</section>
</template>

<script lang="ts" setup>
import MkButton from '@/components/MkButton.vue';

defineProps<{
	title: string;
	icon?: string;
	caption?: string;
	loading: boolean;
	error: boolean;
	hasData: boolean;
}>();

const emit = defineEmits<{
	(ev: 'retry'): void;
}>();
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 12px;
	box-sizing: border-box;
	min-width: 0;
	padding: 16px;
	border-radius: var(--MI-radius);
}

.head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px 12px;
}

.title {
	display: flex;
	align-items: baseline;
	gap: 8px;
	font-weight: 700;

	> i {
		align-self: center;
		opacity: 0.7;
	}
}

.caption {
	font-size: 0.8em;
	font-weight: 400;
	opacity: 0.56;
}

.actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
}

.staleBar {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 6px 10px;
	border-radius: 6px;
	font-size: 0.82em;
	color: var(--MI_THEME-warn);
	background: color-mix(in srgb, var(--MI_THEME-warn) 10%, transparent);
}

.placeholder {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	padding: 24px 0;
}

.body {
	min-width: 0;
	transition: opacity 0.15s;
}

.bodyLoading {
	opacity: 0.5;
	pointer-events: none;
}
</style>
