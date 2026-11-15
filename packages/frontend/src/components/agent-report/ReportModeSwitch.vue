<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.seg" role="group" aria-label="报表模式">
		<button type="button" class="_button" :class="[$style.btn, mode === 'simple' ? $style.btnOn : null]" :aria-pressed="mode === 'simple'" @click="mode = 'simple'">简洁</button>
		<button type="button" class="_button" :class="[$style.btn, mode === 'detailed' ? $style.btnOn : null]" :aria-pressed="mode === 'detailed'" @click="mode = 'detailed'">详细</button>
	</div>
	<span :class="$style.hint">{{ mode === 'simple' ? '只看核心指标' : '完整筛选与分析' }}</span>
</div>
</template>

<script lang="ts" setup>
import type { ReportMode } from './use-report-mode.js';

const mode = defineModel<ReportMode>({ required: true });
</script>

<style lang="scss" module>
.root {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
}

.seg {
	display: inline-flex;
	flex-shrink: 0;
	padding: 2px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 7%, transparent);
}

.btn {
	padding: 4px 14px;
	border-radius: 6px;
	font-size: 0.85em;
	opacity: 0.72;

	&:hover {
		opacity: 1;
	}

	@media (pointer: coarse) {
		padding: 6px 16px;
	}
}

.btnOn {
	background: var(--MI_THEME-panel);
	opacity: 1;
	font-weight: 600;
	color: var(--MI_THEME-accent);
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}

.hint {
	min-width: 0;
	font-size: 0.78em;
	opacity: 0.56;
}
</style>
