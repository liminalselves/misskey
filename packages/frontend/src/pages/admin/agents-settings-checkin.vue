<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder :defaultOpen="true">
	<template #icon><i class="ti ti-calendar-check"></i></template>
	<template #label>每日签到</template>
	<div class="_gaps">
		<MkSwitch v-model="state.checkinEnabled">
			<template #label>启用每日签到</template>
			<template #caption>用户每日首次打开站点时自动签到，获得智能体额度</template>
		</MkSwitch>
		<FormSplit :minWidth="220">
			<MkInput v-model="state.checkinStreakMaxDays" type="text">
				<template #label>连续达标天数</template>
				<template #caption>连续签到多少天达到最大倍率（默认 365）</template>
			</MkInput>
			<MkInput v-model="state.checkinStreakMaxMultiplier" type="text">
				<template #label>连续最大倍率</template>
				<template #caption>达标时的倍率（默认 2.0 = 翻倍）</template>
			</MkInput>
		</FormSplit>
		<FormSplit :minWidth="220">
			<MkInput v-model="state.checkinSpecialDayMultiplier" type="text">
				<template #label>节日倍率</template>
				<template #caption>特殊日子的奖励倍率（默认 2.0）</template>
			</MkInput>
			<MkInput v-model="state.checkinSpecialDays" type="text">
				<template #label>特殊日子</template>
				<template #caption>MM-DD 格式，逗号分隔（如 01-01,05-01,10-01）</template>
			</MkInput>
		</FormSplit>
		<hr>
		<MkSwitch v-model="state.checkinMakeupEnabled">
			<template #label>启用补签</template>
		</MkSwitch>
		<FormSplit :minWidth="220">
			<MkInput v-model="state.checkinMakeupMaxPerMonth" type="text">
				<template #label>每月补签上限</template>
			</MkInput>
			<MkInput v-model="state.checkinMakeupBaseCost" type="text">
				<template #label>补签基础消耗</template>
				<template #caption>第 1 次补签消耗的额度</template>
			</MkInput>
		</FormSplit>
		<FormSplit :minWidth="220">
			<MkInput v-model="state.checkinMakeupCostIncrement" type="text">
				<template #label>补签消耗递增</template>
				<template #caption>第 N 次 = 基础 + (N-1) × 递增</template>
			</MkInput>
			<MkInput v-model="state.checkinMakeupAllowedWindowDays" type="text">
				<template #label>可补签回溯天数</template>
				<template #caption>只能补最近 N 天（默认 7）</template>
			</MkInput>
		</FormSplit>
		<hr>
		<MkFolder>
			<template #icon><i class="ti ti-calendar-plus"></i></template>
			<template #label>{{ i18n.ts._agents.adminCheckinMakeupTitle }}</template>
			<div class="_gaps">
				<MkInfo>{{ i18n.ts._agents.adminCheckinMakeupCaption }}</MkInfo>
				<MkInput v-model="makeupForm.userId" type="text">
					<template #label>{{ i18n.ts._agents.adminCheckinMakeupUser }}</template>
					<template #caption>{{ i18n.ts._agents.adminCheckinMakeupUserCaption }}</template>
				</MkInput>
				<MkInput v-model="makeupForm.date" type="date">
					<template #label>{{ i18n.ts._agents.adminCheckinMakeupDate }}</template>
				</MkInput>
				<MkButton primary rounded :disabled="makeupSubmitting || !makeupForm.userId.trim() || !makeupForm.date" @click="emit('makeup')">
					<i class="ti ti-calendar-plus"></i> {{ i18n.ts._agents.adminCheckinMakeupButton }}
				</MkButton>
			</div>
		</MkFolder>
		<MkButton danger rounded @click="emit('revokeToday')"><i class="ti ti-rotate-back"></i> 撤销当日签到（测试用）</MkButton>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import MkInfo from '@/components/MkInfo.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import FormSplit from '@/components/form/split.vue';
import { i18n } from '@/i18n.js';

/**
 * Checkin settings fields on the shared admin form state (agents-settings.vue
 * keeps ownership: the save bar reacts to mutations of these fields).
 */
export type CheckinSettingsState = {
	checkinEnabled: boolean;
	checkinStreakMaxDays: string;
	checkinStreakMaxMultiplier: string;
	checkinSpecialDayMultiplier: string;
	checkinSpecialDays: string;
	checkinMakeupEnabled: boolean;
	checkinMakeupMaxPerMonth: string;
	checkinMakeupBaseCost: string;
	checkinMakeupCostIncrement: string;
	checkinMakeupAllowedWindowDays: string;
};

defineProps<{
	state: CheckinSettingsState;
	/** Manual makeup checkin sub-form (owned by parent, cleared after success) */
	makeupForm: { userId: string; date: string };
	makeupSubmitting: boolean;
}>();

const emit = defineEmits<{
	(ev: 'makeup'): void;
	(ev: 'revokeToday'): void;
}>();
</script>
