<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, compact && $style.compact]" role="status" aria-label="正在加载">
	<div :class="$style.hero">
		<span :class="[$style.line, $style.lineTitle]"></span>
		<span :class="[$style.line, $style.lineCaption]"></span>
	</div>
	<div :class="$style.card">
		<span :class="[$style.line, $style.lineMedium]"></span>
		<span :class="[$style.line, $style.lineWide]"></span>
		<span :class="[$style.line, $style.lineShort]"></span>
	</div>
	<div v-if="!compact" :class="$style.card">
		<span :class="[$style.line, $style.lineShort]"></span>
		<span :class="[$style.line, $style.lineWide]"></span>
	</div>
</div>
</template>

<script lang="ts" setup>
withDefaults(defineProps<{
	compact?: boolean;
}>(), {
	compact: false,
});
</script>

<style lang="scss" module>
@keyframes shimmer {
	0% { transform: translateX(-110%); }
	100% { transform: translateX(110%); }
}

.root {
	display: grid;
	gap: var(--agent-control-spacing, var(--MI-margin));
	width: 100%;
	box-sizing: border-box;
	cursor: wait;
}

.compact {
	gap: 10px;
}

.hero,
.card {
	position: relative;
	display: grid;
	gap: 12px;
	overflow: hidden;
	padding: 20px;
	box-sizing: border-box;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
}

.compact .hero,
.compact .card {
	padding: 14px;
}

.hero::after,
.card::after {
	content: '';
	position: absolute;
	inset: 0;
	background: linear-gradient(100deg, transparent 25%, color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent) 50%, transparent 75%);
	animation: shimmer 1.4s ease-in-out infinite;
	pointer-events: none;
}

.line {
	display: block;
	height: 11px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 12%, var(--MI_THEME-panel));
}

.lineTitle {
	width: 36%;
	height: 15px;
	background: color-mix(in srgb, var(--MI_THEME-accent) 28%, var(--MI_THEME-panel));
}

.lineCaption { width: 68%; }
.lineMedium { width: 48%; }
.lineWide { width: 86%; }
.lineShort { width: 28%; }

@media (prefers-reduced-motion: reduce) {
	.hero::after,
	.card::after {
		animation: none;
		display: none;
	}
}
</style>
