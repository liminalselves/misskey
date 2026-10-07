<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section :class="$style.band">
	<button type="button" class="_button" :class="$style.toggle" @click="open = !open">
		<i :class="open ? 'ti ti-filter-off' : 'ti ti-filter'"></i>
		<span>筛选条件</span>
		<span v-if="activeCount > 0" :class="$style.count">{{ activeCount }}</span>
		<i :class="[$style.chevron, open ? 'ti ti-chevron-up' : 'ti ti-chevron-down']"></i>
	</button>
	<template v-if="open">
		<slot></slot>
		<div class="_buttons">
			<MkButton small rounded :disabled="activeCount === 0 || loading" @click="emit('reset')"><i class="ti ti-filter-off"></i> 重置</MkButton>
		</div>
	</template>
</section>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import MkButton from '@/components/MkButton.vue';

const props = defineProps<{
	/** 相对默认值发生变化的筛选项数量 */
	activeCount: number;
	loading?: boolean;
}>();

const emit = defineEmits<{
	(e: 'reset'): void;
}>();

// 挂载时有生效筛选则默认展开，避免持久化恢复的条件被折叠隐藏
const open = ref(props.activeCount > 0);
</script>

<style lang="scss" module>
.band {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 14px;
	border-radius: 8px;
	background: var(--MI_THEME-panel);
	border: 1px solid var(--MI_THEME-divider);
}
.toggle {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 4px 0;
	cursor: pointer;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.92em;
	user-select: none;
}
.toggle:hover {
	color: var(--MI_THEME-fg);
}
.count {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	min-width: 18px;
	height: 18px;
	padding: 0 5px;
	border-radius: 999px;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-size: 0.78em;
	font-weight: 600;
}
.chevron {
	margin-left: auto;
}
@media (max-width: 600px) {
	.band {
		padding: 12px;
	}
}
</style>
