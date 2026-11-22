<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal
	ref="modal"
	:zPriority="'middle'"
	:preferType="'dialog'"
	@click="close"
	@esc="close"
	@closed="emit('closed')"
>
	<div :class="$style.card">
		<div :class="$style.banner">
			<div :class="$style.bannerIcon">
				<i class="ti ti-calendar-check"></i>
			</div>
			<div :class="$style.bannerTitle">{{ i18n.ts._agents.checkinPopupTitle }}</div>
			<div :class="$style.bannerStreak">{{ i18n.tsx._agents.checkinPopupStreak({ days: streak }) }}</div>
		</div>
		<div :class="$style.body">
			<div :class="$style.rewardLine">
				<span :class="$style.rewardNum">+{{ reward.toFixed(2) }}</span>
				<span :class="$style.rewardUnit">{{ i18n.ts._agents.checkinPopupRewardUnit }}</span>
			</div>
			<div :class="$style.formulaBox">
				<div :class="$style.formulaRow">
					<span :class="$style.formulaTag">{{ i18n.ts._agents.checkinPopupTodayLuck }}</span>
					<span :class="$style.formulaVal">{{ baseValue.toFixed(2) }}</span>
				</div>
				<div :class="$style.formulaRow">
					<span :class="$style.formulaTag">{{ i18n.ts._agents.checkinPopupStreakFactor }}</span>
					<span :class="$style.formulaVal">×{{ streakMultiplier.toFixed(2) }}</span>
				</div>
				<div v-if="roleMultiplier > 1" :class="$style.formulaRow">
					<span :class="$style.formulaTag">{{ i18n.ts._agents.checkinPopupRoleBonus }}</span>
					<span :class="$style.formulaVal">×{{ roleMultiplier.toFixed(2) }}</span>
				</div>
				<div v-if="dayMultiplier > 1" :class="$style.formulaRow">
					<span :class="$style.formulaTag">{{ i18n.ts._agents.checkinPopupHolidayBonus }}</span>
					<span :class="$style.formulaVal">×{{ dayMultiplier.toFixed(1) }}</span>
				</div>
			</div>
			<button class="_button" :class="$style.closeBtn" @click="close">{{ i18n.ts._agents.checkinPopupClaim }}</button>
		</div>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { useTemplateRef } from 'vue';
import MkModal from '@/components/MkModal.vue';
import { i18n } from '@/i18n.js';

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

const modal = useTemplateRef('modal');

function close() {
	modal.value?.close();
}
</script>

<style module lang="scss">
@keyframes slideUp {
	from { transform: translateY(20px); opacity: 0; }
	to { transform: translateY(0); opacity: 1; }
}

.card {
	margin: auto;
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
