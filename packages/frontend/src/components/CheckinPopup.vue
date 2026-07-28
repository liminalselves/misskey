<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" @click.self="close">
	<div :class="$style.card">
		<div :class="$style.banner">
			<div :class="$style.bannerIcon">
				<i class="ti ti-calendar-check"></i>
			</div>
			<div :class="$style.bannerTitle">签到成功</div>
			<div :class="$style.bannerStreak">已连续签到 {{ streak }} 天</div>
		</div>
		<div :class="$style.body">
			<div :class="$style.rewardLine">
				<span :class="$style.rewardNum">+{{ reward.toFixed(2) }}</span>
				<span :class="$style.rewardUnit">额度</span>
			</div>
			<div :class="$style.formulaBox">
				<div :class="$style.formulaRow">
					<span :class="$style.formulaTag">今日手气</span>
					<span :class="$style.formulaVal">{{ baseValue.toFixed(2) }}</span>
				</div>
				<div :class="$style.formulaRow">
					<span :class="$style.formulaTag">连续签到</span>
					<span :class="$style.formulaVal">×{{ streakMultiplier.toFixed(2) }}</span>
				</div>
				<div v-if="roleMultiplier > 1" :class="$style.formulaRow">
					<span :class="$style.formulaTag">身份组加成</span>
					<span :class="$style.formulaVal">×{{ roleMultiplier.toFixed(2) }}</span>
				</div>
				<div v-if="dayMultiplier > 1" :class="$style.formulaRow">
					<span :class="$style.formulaTag">节日加成</span>
					<span :class="$style.formulaVal">×{{ dayMultiplier.toFixed(1) }}</span>
				</div>
			</div>
			<button class="_button" :class="$style.closeBtn" @click="close">收下</button>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
const props = defineProps<{
	reward: number;
	streak: number;
	baseValue: number;
	streakMultiplier: number;
	roleMultiplier: number;
	dayMultiplier: number;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

function close() {
	emit('closed');
}
</script>

<style module lang="scss">
.root {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 9999;
	background: rgba(0, 0, 0, 0.5);
	backdrop-filter: blur(4px);
	animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
	from { opacity: 0; }
	to { opacity: 1; }
}

@keyframes slideUp {
	from { transform: translateY(20px); opacity: 0; }
	to { transform: translateY(0); opacity: 1; }
}

.card {
	width: min(88vw, 340px);
	border-radius: 20px;
	overflow: hidden;
	background: var(--MI_THEME-panel);
	box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
	animation: slideUp 0.3s ease;
}

.banner {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
	padding: 28px 20px 20px;
	background: linear-gradient(135deg, color-mix(in srgb, var(--MI_THEME-accent) 18%, var(--MI_THEME-panel)), var(--MI_THEME-panel));
}

.bannerIcon {
	width: 56px;
	height: 56px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 50%;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-size: 1.6em;
	box-shadow: 0 4px 16px color-mix(in srgb, var(--MI_THEME-accent) 40%, transparent);
}

.bannerTitle {
	font-size: 1.3em;
	font-weight: 800;
	color: var(--MI_THEME-fg);
}

.bannerStreak {
	display: flex;
	align-items: center;
	gap: 4px;
	font-size: 0.88em;
	font-weight: 600;
	color: var(--MI_THEME-accent);
}

.body {
	padding: 20px 24px 24px;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 16px;
}

.rewardLine {
	display: flex;
	align-items: baseline;
	gap: 6px;
}

.rewardNum {
	font-size: 2.2em;
	font-weight: 800;
	color: var(--MI_THEME-accent);
	font-variant-numeric: tabular-nums;
}

.rewardUnit {
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.formulaBox {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 14px 16px;
	border-radius: 12px;
	background: var(--MI_THEME-bg);
}

.formulaRow {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.formulaTag {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.formulaVal {
	font-size: 0.9em;
	font-weight: 700;
	color: var(--MI_THEME-fg);
	font-variant-numeric: tabular-nums;
}

.closeBtn {
	width: 100%;
	padding: 12px;
	border-radius: 12px;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-size: 1em;
	font-weight: 700;
	cursor: pointer;
	transition: opacity 0.15s;

	&:hover {
		opacity: 0.85;
	}
}
</style>
