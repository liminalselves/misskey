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
		<div v-panel :class="$style.worldbookOverview">
			<div :class="$style.worldbookOverviewIcon"><i class="ti ti-book"></i></div>
			<div>
				<div :class="$style.worldbookOverviewTitle">世界书 · {{ stats.enabledCount }} / {{ stats.totalCount }}</div>
				<div :class="$style.worldbookOverviewText">这里只显示世界书规模和提示设置，不展示条目标题、关键词或正文，避免剧透。</div>
			</div>
		</div>
		<MkInfo v-if="entries.length === 0">当前会话使用的角色版本没有世界书条目。</MkInfo>
		<template v-else>
			<div :class="$style.worldbookStatsGrid">
				<div v-panel :class="$style.worldbookStatCard">
					<span>启用条目</span>
					<b>{{ stats.enabledCount }}</b>
				</div>
				<div v-panel :class="$style.worldbookStatCard">
					<span>总条目</span>
					<b>{{ stats.totalCount }}</b>
				</div>
				<div v-panel :class="$style.worldbookStatCard">
					<span>正文量级</span>
					<b>{{ stats.textScaleLabel }}</b>
				</div>
				<div v-panel :class="$style.worldbookStatCard">
					<span>触发方式</span>
					<b>{{ stats.modeSummary }}</b>
				</div>
			</div>
			<div v-panel :class="$style.worldbookSettingCard">
				<MkSwitch :modelValue="showHitHint" @update:modelValue="value => emit('update:showHitHint', value)">
					<template #label>命中世界书时显示提示</template>
					<template #caption>开启后，发送消息命中世界书时会在聊天边缘显示标志。桌面端悬浮查看详情，触屏设备点击显示、再点隐藏。</template>
				</MkSwitch>
			</div>
			<MkInfo>为避免剧透，此页不展示世界书条目、关键词和正文。命中提示只展示本轮实际命中的条目标题和命中原因。</MkInfo>
		</template>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import MkInfo from '@/components/MkInfo.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import XControlLoading from '@/pages/agents/control-embed-loading.vue';

/** 会话面板共用的世界书条目形状（agents/sessions/worldbook-list 行） */
export type SessionWorldbookEntry = {
	id: string;
	title: string;
	keywords: string[];
	triggerMode: 'keyword' | 'manual' | 'always';
	priority: number;
	enabled: boolean;
	revision: number;
	contentLength: number;
};

const props = withDefaults(defineProps<{
	loading: boolean;
	listLoading: boolean;
	entries: SessionWorldbookEntry[];
	/** 命中提示开关（父级持有：聊天时间线的命中标志也依赖它，localStorage 持久化在父级） */
	showHitHint: boolean;
	embedded?: boolean;
}>(), {
	embedded: false,
});

const emit = defineEmits<{
	(ev: 'update:showHitHint', value: boolean): void;
}>();

const stats = computed(() => {
	const totalCount = props.entries.length;
	const enabled = props.entries.filter(entry => entry.enabled);
	const totalTextLength = enabled.reduce((sum, entry) => sum + Math.max(0, entry.contentLength ?? 0), 0);
	const modeCounts = enabled.reduce((acc, entry) => {
		acc[entry.triggerMode] += 1;
		return acc;
	}, { keyword: 0, manual: 0, always: 0 });
	const modes = [
		modeCounts.keyword > 0 ? `关键词 ${modeCounts.keyword}` : '',
		modeCounts.manual > 0 ? `手动 ${modeCounts.manual}` : '',
		modeCounts.always > 0 ? `常驻 ${modeCounts.always}` : '',
	].filter(Boolean);
	return {
		totalCount,
		enabledCount: enabled.length,
		totalTextLength,
		textScaleLabel: textScaleLabel(totalTextLength),
		modeSummary: modes.length > 0 ? modes.join(' / ') : '无启用条目',
	};
});

function textScaleLabel(chars: number): string {
	if (chars <= 0) return '无正文';
	if (chars < 1000) return `${chars} 字符`;
	if (chars < 10000) return `${(chars / 1000).toFixed(1)}k 字符`;
	return `${Math.round(chars / 1000)}k 字符`;
}
</script>

<style lang="scss" module>
.worldbookOverview {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	gap: 14px;
	align-items: center;
	padding: 16px;
	border-radius: var(--MI-radius);
}

.worldbookOverviewIcon {
	width: 46px;
	height: 46px;
	border-radius: 14px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 1.45rem;
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, transparent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 30%, transparent);
}

.worldbookOverviewTitle {
	font-weight: 800;
	font-size: 1.05rem;
	line-height: 1.35;
}

.worldbookOverviewText {
	margin-top: 3px;
	font-size: 0.88rem;
	line-height: 1.45;
	color: var(--MI_THEME-fgTransparentWeak);
}

.worldbookStatsGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
	gap: 12px;
}

.worldbookStatCard {
	padding: 14px 16px;
	border-radius: var(--MI-radius);

	> span {
		display: block;
		font-size: 0.84rem;
		color: var(--MI_THEME-fgTransparentWeak);
	}

	> b {
		display: block;
		margin-top: 5px;
		font-size: 1.25rem;
		line-height: 1.25;
		word-break: break-word;
	}
}

.worldbookSettingCard {
	padding: 14px 16px;
	border-radius: var(--MI-radius);
}
</style>
