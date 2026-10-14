<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInfo v-if="lockNoticeVisible" warn>{{ lockNoticeMessage }}</MkInfo>
	<MkInfo v-if="!timeAwareness" warn>{{ proactiveTimeAwarenessRequired }}</MkInfo>
	<MkInfo v-if="randomProactiveLastError" warn>{{ randomProactiveLastErrorCaption }}</MkInfo>
	<MkInfo v-if="scheduledProactiveLastError" warn>{{ scheduledProactiveLastErrorCaption }}</MkInfo>
	<div v-panel :class="$style.proactivePanel">
		<div :class="$style.proactiveTitle">{{ proactiveTitleLabel }}</div>
		<MkSwitch
			v-model="randomProactiveEnabled"
			:disabled="saving || moderationLocked || !timeAwareness"
		>
			{{ randomProactiveLabel }}
			<template #caption>{{ randomProactiveCaption }}</template>
		</MkSwitch>
		<MkSwitch
			v-model="scheduledProactiveEnabled"
			:disabled="saving || moderationLocked || !timeAwareness"
		>
			{{ scheduledProactiveLabel }}
			<template #caption>{{ scheduledProactiveCaption }}</template>
		</MkSwitch>
		<div :class="$style.proactiveParamsGroup">
			<div :class="$style.proactiveParamsHead">
				<span :class="$style.proactiveParamsTitle">随机主动消息参数</span>
				<MkButton small rounded :disabled="paramsSaving || moderationLocked" @click="emit('resetParams')">
					<i class="ti ti-rotate-back"></i> 恢复默认
				</MkButton>
			</div>
			<div :class="$style.proactiveParamsGrid">
				<MkInput v-model="minSilence" type="number" :min="5" :max="1440" small>
					<template #label>最小静默时间（分钟）</template>
					<template #caption>助手回复后至少等待多久才发送。取值 5–1440</template>
				</MkInput>
				<MkInput v-model="maxWindow" type="number" :min="30" :max="10080" small>
					<template #label>最大等待窗口（分钟）</template>
					<template #caption>从静默时间起，在多大窗口内随机选取发送时刻。取值 30–10080</template>
				</MkInput>
				<MkInput v-model="daytimeWeight" type="number" :min="1" :max="10" small>
					<template #label>白天权重倍率</template>
					<template #caption>取值 1–10。1 = 白天与夜间概率相同；3 = 白天概率为夜间 3 倍</template>
				</MkInput>
				<MkInput v-model="recencyBias" type="number" :min="1" :max="10" small>
					<template #label>近期偏好系数</template>
					<template #caption>取值 1–10。1 = 窗口内均匀分布；值越大越偏向近期时间点发送</template>
				</MkInput>
				<MkInput v-model="chainLength" type="number" :min="1" :max="siteMaxChainLength" small>
					<template #label>连续主动次数</template>
					<template #caption>用户未回复时最多连续发送几次。取值 1–{{ siteMaxChainLength }}</template>
				</MkInput>
			</div>
			<MkButton small rounded :primary="paramsDirty" :disabled="paramsSaving || moderationLocked || !paramsDirty" @click="emit('saveParams')">
				<i class="ti ti-check"></i> 保存参数
			</MkButton>
		</div>
	</div>
	<div :class="$style.proactiveListHead">
		<div>
			<div :class="$style.proactiveTitle">{{ proactiveScheduleListLabel }}</div>
			<div :class="$style.proactiveCaption">{{ proactiveScheduleListCaption }}</div>
		</div>
		<MkButton rounded small :disabled="schedulesLoading" @click="emit('reloadSchedules')">
			<i class="ti ti-refresh"></i>
		</MkButton>
	</div>
	<XControlLoading v-if="schedulesLoading && embedded" compact/>
	<MkLoading v-else-if="schedulesLoading"/>
	<MkInfo v-else-if="schedules.length === 0">{{ proactiveScheduleEmpty }}</MkInfo>
	<div v-else :class="$style.proactiveScheduleList">
		<div v-for="schedule in schedules" :key="schedule.id" v-panel :class="$style.proactiveScheduleCard">
			<div :class="$style.proactiveScheduleTop">
				<div :class="$style.proactiveScheduleDescription">{{ schedule.description }}</div>
				<span :class="$style.proactiveScheduleStatus">{{ proactiveScheduleStatusLabel(schedule.status) }}</span>
			</div>
			<div :class="$style.proactiveScheduleMeta">
				<span>{{ proactiveScheduleTriggerLabel(schedule) }}</span>
				<span v-if="schedule.nextRunAt">{{ proactiveNextRunLabel }} {{ formatDateTimeString(new Date(schedule.nextRunAt), 'yyyy-MM-dd HH:mm') }}</span>
				<span>{{ proactiveRemainingLabel(schedule.remainingRuns) }}</span>
			</div>
			<div :class="$style.proactiveScheduleActions">
				<MkButton
					v-if="schedule.status === 'active' || schedule.status === 'paused'"
					rounded
					small
					:disabled="scheduleMutating === schedule.id || moderationLocked || (schedule.status === 'paused' && (!timeAwareness || !scheduledProactiveEnabled))"
					@click="emit('toggleSchedule', schedule)"
				>
					<i :class="schedule.status === 'active' ? 'ti ti-player-pause' : 'ti ti-player-play'"></i>
					{{ schedule.status === 'active' ? proactivePauseLabel : proactiveResumeLabel }}
				</MkButton>
				<MkButton rounded small danger :disabled="scheduleMutating === schedule.id || moderationLocked" @click="emit('deleteSchedule', schedule)">
					<i class="ti ti-trash"></i>
					{{ i18n.ts.delete }}
				</MkButton>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import MkInfo from '@/components/MkInfo.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import XControlLoading from '@/pages/agents/control-embed-loading.vue';
import { formatDateTimeString } from '@/utility/format-time-string.js';
import { agentI18nText } from '@/utility/agent-i18n.js';
import { i18n } from '@/i18n.js';

/** Proactive schedule row (agents/proactive-schedules/list) */
export type ProactiveSchedule = {
	id: string;
	description: string;
	trigger: { type: 'once'; at: string } | { type: 'recurring'; cron: string; repeat: { mode: 'count'; count: number } | { mode: 'unlimited' } };
	status: 'active' | 'paused' | 'completed' | 'cancelled';
	createdAt: string;
	nextRunAt: string | null;
	lastRunAt: string | null;
	remainingRuns: number | null;
};

/** Last execution failure recorded on the session (shown as a warning banner) */
export type ProactiveErrorBrief = { code: string; occurredAt: string } | null | undefined;

/**
 * Proactive message panel. Presentational only: all API calls, save/hydrate
 * state and cross-tab coupling (time awareness toggle in operations tab) stay
 * in the parent; this component just renders the form and forwards actions.
 */
withDefaults(defineProps<{
	/** Moderation lock disables every mutating control (review mode forces true in parent) */
	moderationLocked: boolean;
	lockNoticeVisible: boolean;
	lockNoticeMessage: string;
	/** Time awareness gate: proactive messaging requires it to be enabled */
	timeAwareness: boolean;
	randomProactiveLastError: ProactiveErrorBrief;
	scheduledProactiveLastError: ProactiveErrorBrief;
	saving: boolean;
	paramsSaving: boolean;
	paramsDirty: boolean;
	siteMaxChainLength: number;
	schedules: ProactiveSchedule[];
	schedulesLoading: boolean;
	scheduleMutating: string | null;
	embedded?: boolean;
}>(), {
	embedded: false,
});

const emit = defineEmits<{
	(ev: 'saveParams'): void;
	(ev: 'resetParams'): void;
	(ev: 'reloadSchedules'): void;
	(ev: 'toggleSchedule', schedule: ProactiveSchedule): void;
	(ev: 'deleteSchedule', schedule: ProactiveSchedule): void;
}>();

const randomProactiveEnabled = defineModel<boolean>('randomProactiveEnabled', { required: true });
const scheduledProactiveEnabled = defineModel<boolean>('scheduledProactiveEnabled', { required: true });
const minSilence = defineModel<number | null>('minSilence', { required: true });
const maxWindow = defineModel<number | null>('maxWindow', { required: true });
const daytimeWeight = defineModel<number | null>('daytimeWeight', { required: true });
const recencyBias = defineModel<number | null>('recencyBias', { required: true });
const chainLength = defineModel<number>('chainLength', { required: true });

const agentText = (key: string, fallback: string) => agentI18nText(`_agents.${key}`, fallback);

const proactiveTitleLabel = computed(() => agentText('proactiveMessages', '主动消息'));
const randomProactiveLabel = computed(() => agentText('randomProactiveMessages', '随机主动消息'));
const randomProactiveCaption = computed(() => agentText('randomProactiveMessagesCaption', '会话静默 30 分钟后，按北京时间昼夜权重随机安排一次主动消息。'));
const scheduledProactiveLabel = computed(() => agentText('scheduledProactiveMessages', '定时主动消息'));
const scheduledProactiveCaption = computed(() => agentText('scheduledProactiveMessagesCaption', '智能体可自主创建、调整或取消最多 5 个定时计划。'));
const proactiveTimeAwarenessRequired = computed(() => agentText('proactiveTimeAwarenessRequired', '开启主动消息前需要先开启时间感知。'));
const randomProactiveLastErrorCaption = computed(() => agentText('proactiveRandomLastError', '上次随机主动消息执行失败，本次已跳过。'));
const scheduledProactiveLastErrorCaption = computed(() => agentText('proactiveScheduledLastError', '上次定时主动消息执行失败，本次已跳过。'));
const proactiveScheduleListLabel = computed(() => agentText('proactiveScheduleList', '当前定时计划'));
const proactiveScheduleListCaption = computed(() => agentText('proactiveScheduleListCaption', '计划由智能体维护，你可以暂停、恢复或删除。'));
const proactiveScheduleEmpty = computed(() => agentText('proactiveScheduleEmpty', '当前没有定时计划。'));
const proactivePauseLabel = computed(() => agentText('proactivePause', '暂停'));
const proactiveResumeLabel = computed(() => agentText('proactiveResume', '恢复'));
const proactiveNextRunLabel = computed(() => agentText('proactiveNextRun', '下次执行'));

function proactiveScheduleStatusLabel(status: ProactiveSchedule['status']): string {
	if (status === 'active') return agentText('proactiveScheduleActive', '执行中');
	if (status === 'paused') return agentText('proactiveSchedulePaused', '已暂停');
	if (status === 'completed') return agentText('proactiveScheduleCompleted', '已完成');
	return agentText('proactiveScheduleCancelled', '已取消');
}

function proactiveScheduleTriggerLabel(schedule: ProactiveSchedule): string {
	if (schedule.trigger.type === 'once') {
		return agentText('proactiveScheduleOnce', '一次性') + ` · ${schedule.trigger.at}`;
	}
	const repeat = schedule.trigger.repeat.mode === 'unlimited'
		? agentText('proactiveScheduleUnlimited', '无限重复')
		: agentText('proactiveScheduleCount', '重复 {count} 次').replace('{count}', String(schedule.trigger.repeat.count));
	return `${repeat} · ${schedule.trigger.cron}`;
}

function proactiveRemainingLabel(remainingRuns: number | null): string {
	if (remainingRuns == null) return agentText('proactiveScheduleUnlimited', '无限重复');
	return agentText('proactiveScheduleRemaining', '剩余 {count} 次').replace('{count}', String(remainingRuns));
}
</script>

<style lang="scss" module>
.proactivePanel {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 16px;
	border-radius: 8px;
}

.proactiveTitle {
	font-weight: 700;
	font-size: 1em;
	line-height: 1.35;
}

.proactiveCaption {
	margin-top: 3px;
	font-size: 0.88em;
	line-height: 1.45;
	color: var(--MI_THEME-fgTransparentWeak);
}

.proactiveParamsGroup {
	display: flex;
	flex-direction: column;
	gap: 10px;
	margin-top: 4px;
	padding: 14px;
	border-radius: 8px;
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
}

.proactiveParamsHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.proactiveParamsTitle {
	font-weight: 600;
	font-size: 0.92em;
	color: var(--MI_THEME-fg);
}

.proactiveParamsGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 10px;
}

.proactiveListHead {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}

.proactiveScheduleList {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.proactiveScheduleCard {
	padding: 14px;
	border-radius: 8px;
}

.proactiveScheduleTop {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}

.proactiveScheduleDescription {
	min-width: 0;
	font-weight: 700;
	line-height: 1.5;
	word-break: break-word;
}

.proactiveScheduleStatus {
	flex: 0 0 auto;
	padding: 2px 7px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--MI_THEME-accent) 13%, var(--MI_THEME-panel));
	color: var(--MI_THEME-accent);
	font-size: 0.78em;
	font-weight: 700;
}

.proactiveScheduleMeta {
	display: flex;
	flex-wrap: wrap;
	gap: 4px 12px;
	margin-top: 9px;
	font-size: 0.86em;
	line-height: 1.45;
	color: var(--MI_THEME-fgTransparentWeak);
	word-break: break-word;
}

.proactiveScheduleActions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 12px;
}
</style>
