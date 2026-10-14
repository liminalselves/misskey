<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<div v-if="loading || listLoading" class="_gaps">
		<XControlLoading v-if="embedded" compact/>
		<MkLoading v-else/>
	</div>
	<div v-else class="_gaps">
		<MkInfo v-if="rules.length === 0">当前会话使用的角色没有配置规则。</MkInfo>
		<template v-else>
			<div :class="$style.ruleSummary">
				<span :class="$style.ruleSummaryItem"><i class="ti ti-shield-check"></i> {{ rules.length }} 条规则</span>
				<span :class="$style.ruleSummaryItem"><i class="ti ti-lock"></i> {{ rules.filter(r => r.type === 'persistent').length }} 常驻</span>
				<span :class="$style.ruleSummaryItem"><i class="ti ti-toggle-right"></i> {{ rules.filter(r => r.type === 'toggleable').length }} 可切换</span>
			</div>
			<div
				v-for="rule in rules"
				:key="rule.id"
				v-panel
				:class="[$style.ruleCard, rule.type === 'toggleable' && rule.currentEnabled && $style.ruleCardActive]"
			>
				<div :class="$style.ruleHeader">
					<div :class="$style.ruleInfo">
						<div :class="$style.ruleName">
							{{ rule.name }}
							<span v-if="rule.type === 'persistent'" :class="$style.ruleBadge">常驻</span>
							<span v-else-if="rule.hasDisabledPrompt" :class="[$style.ruleBadge, $style.ruleBadgeBidirectional]">双向</span>
						</div>
						<div v-if="rule.description" :class="$style.ruleDesc">{{ rule.description }}</div>
						<div v-if="rule.type === 'toggleable'" :class="$style.ruleStatus">
							<span :class="[$style.ruleStatusDot, rule.currentEnabled ? $style.ruleStatusDotOn : $style.ruleStatusDotOff]"></span>
							{{ rule.currentEnabled ? '已开启' : '已关闭' }}
							<template v-if="rule.hasDisabledPrompt">（{{ rule.currentEnabled ? '注入开启提示词' : '注入关闭提示词' }}）</template>
						</div>
					</div>
					<MkSwitch
						v-if="rule.type === 'toggleable'"
						:modelValue="rule.currentEnabled"
						:disabled="ruleSaving || review"
						@update:modelValue="emit('toggle', rule, $event)"
					/>
				</div>
			</div>
			<MkInfo>规则内容由角色作者设定，此处仅显示名称与简介。开关状态即时生效，下一轮对话将使用更新后的规则。</MkInfo>
		</template>
	</div>
</div>
</template>

<script lang="ts" setup>
import MkInfo from '@/components/MkInfo.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import XControlLoading from '@/pages/agents/control-embed-loading.vue';

/** 会话面板共用的规则形状（agents/sessions/rule-list 行） */
export type SessionRule = {
	id: string;
	name: string;
	description: string;
	type: 'persistent' | 'toggleable';
	defaultEnabled: boolean;
	currentEnabled: boolean;
	hasDisabledPrompt: boolean;
};

withDefaults(defineProps<{
	loading: boolean;
	listLoading: boolean;
	rules: SessionRule[];
	ruleSaving: boolean;
	/** 会话审查模式：开关禁用（写操作在父级/后端双重拦截） */
	review?: boolean;
	embedded?: boolean;
}>(), {
	review: false,
	embedded: false,
});

const emit = defineEmits<{
	(ev: 'toggle', rule: SessionRule, enabled: boolean): void;
}>();
</script>

<style lang="scss" module>
.ruleCard {
	padding: 14px 16px;
	border-radius: var(--MI-radius);
	transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.ruleCardActive {
	border-color: color-mix(in srgb, var(--MI_THEME-accent) 40%, transparent);
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--MI_THEME-accent) 20%, transparent);
}

.ruleSummary {
	display: flex;
	gap: 16px;
	padding: 10px 14px;
	border-radius: var(--MI-radius);
	background: color-mix(in srgb, var(--MI_THEME-panel) 60%, transparent);
	font-size: 0.85em;
}

.ruleSummaryItem {
	display: flex;
	align-items: center;
	gap: 5px;
	opacity: 0.8;
}

.ruleBadgeBidirectional {
	background: color-mix(in srgb, var(--MI_THEME-warn) 12%, transparent);
	color: var(--MI_THEME-warn);
	border-color: color-mix(in srgb, var(--MI_THEME-warn) 25%, transparent);
}

.ruleStatus {
	margin-top: 6px;
	font-size: 0.8em;
	display: flex;
	align-items: center;
	gap: 6px;
	opacity: 0.7;
}

.ruleStatusDot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	flex-shrink: 0;
}

.ruleStatusDotOn {
	background: var(--MI_THEME-accent);
	box-shadow: 0 0 6px color-mix(in srgb, var(--MI_THEME-accent) 50%, transparent);
}

.ruleStatusDotOff {
	background: var(--MI_THEME-divider);
}

.ruleHeader {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 12px;
}

.ruleInfo {
	flex: 1;
	min-width: 0;
}

.ruleName {
	font-weight: 600;
	font-size: 0.95em;
	display: flex;
	align-items: center;
	gap: 8px;
}

.ruleBadge {
	font-size: 0.75em;
	font-weight: 500;
	padding: 2px 8px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
	color: var(--MI_THEME-accent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 25%, transparent);
	white-space: nowrap;
}

.ruleDesc {
	margin-top: 4px;
	font-size: 0.85em;
	opacity: 0.75;
	line-height: 1.4;
}
</style>
