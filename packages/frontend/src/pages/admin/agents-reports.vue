<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps_m">
			<!-- 报表分类切换 -->
			<div :class="$style.reportTabRow">
				<button
					v-for="t in reportTabs"
					:key="t.value"
					type="button"
					:class="[$style.reportTab, activeReportTab === t.value ? $style.reportTabActive : null]"
					@click="activeReportTab = t.value"
				>
					<i :class="t.icon"></i> {{ t.label }}
				</button>
			</div>

			<!-- 模型报表（v-show保留状态，切换不重新加载） -->
			<div v-show="activeReportTab === 'model'">
				<XModelReports/>
			</div>

			<!-- 签到报表（KeepAlive缓存，切换回来不重新加载） -->
			<KeepAlive>
				<XCheckinReports v-if="activeReportTab === 'checkin'"/>
			</KeepAlive>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import XCheckinReports from './agents-checkin-reports.vue';
import XModelReports from './agents-model-reports.vue';
import { definePage } from '@/page.js';

// 报表分类切换：仅切换视图区域，不触发路由跳转
const reportTabs = [
	{ label: '模型报表', value: 'model' as const, icon: 'ti ti-cpu' },
	{ label: '签到报表', value: 'checkin' as const, icon: 'ti ti-calendar-check' },
];
const activeReportTab = ref<'model' | 'checkin'>('model');

const headerTabs = computed(() => []);

definePage(() => ({
	title: '智能体报表',
	icon: 'ti ti-report-analytics',
}));
</script>

<style lang="scss" module>
.reportTabRow {
	display: flex;
	gap: 8px;
}

.reportTab {
	padding: 8px 20px;
	border-radius: 999px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	font-size: 0.92em;
	font-weight: 600;
	cursor: pointer;
	transition: background 0.15s, border-color 0.15s;
	display: inline-flex;
	align-items: center;
	gap: 6px;

	&:hover {
		border-color: var(--MI_THEME-accent);
	}
}

.reportTabActive {
	background: var(--MI_THEME-accent);
	border-color: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent, #fff);
}
</style>
