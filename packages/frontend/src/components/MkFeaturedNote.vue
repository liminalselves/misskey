<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.wrapper">
	<MkNote :note="note" :withHardMute="true" :class="$style.note"/>
	<!-- 分数显示徽章 -->
	<div v-if="featuredScore > 0" :class="$style.scoreBadge" :title="`热度分数: ${featuredScore.toFixed(1)}`">
		<i class="ti ti-flame"></i>
		<span>{{ formatScore(featuredScore) }}</span>
	</div>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import MkNote from '@/components/MkNote.vue';

const props = defineProps<{
	note: Misskey.entities.Note & { _featuredScore_?: number };
}>();

const featuredScore = props.note._featuredScore_ ?? 0;

function formatScore(score: number): string {
	if (score >= 100) {
		return Math.floor(score).toString();
	} else if (score >= 10) {
		return score.toFixed(1);
	} else {
		return score.toFixed(2);
	}
}
</script>

<style lang="scss" module>
.wrapper {
	position: relative;
}

.note {
	// 继承 MkNote 的样式
}

.scoreBadge {
	position: absolute;
	bottom: 12px;
	right: 12px;
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 4px 8px;
	font-size: 12px;
	font-weight: 500;
	color: var(--MI_THEME-fgOnAccent);
	background: linear-gradient(135deg, #ff6b35, #f7931e);
	border-radius: 12px;
	box-shadow: 0 2px 8px rgba(255, 107, 53, 0.3);
	opacity: 0.9;
	transition: opacity 0.2s;

	&:hover {
		opacity: 1;
	}

	i {
		font-size: 11px;
	}
}
</style>
