<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- 嵌入页中网盘文件被主人清理后的不可交互占位：避免渲染失效图片/视频或触发预览跳转 -->
<template>
<div :class="$style.root" :title="titleText">
	<i :class="[$style.icon, iconClass]"></i>
	<div :class="$style.texts">
		<span :class="$style.title">{{ kindLabel }}已被清理</span>
		<span v-if="file.user" :class="$style.owner">
			来自 <EmAcct :user="file.user" :class="$style.ownerAcct"/>
		</span>
		<span v-else-if="file.userId" :class="$style.owner">原主人已注销</span>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type * as Misskey from 'misskey-js';
import EmAcct from '@/components/EmAcct.vue';

const props = defineProps<{
	file: Misskey.entities.DriveFile;
}>();

const kindLabel = computed(() => {
	if (props.file.type.startsWith('image/')) return '图片';
	if (props.file.type.startsWith('video/')) return '视频';
	if (props.file.type.startsWith('audio/')) return '音频';
	return '文件';
});

const iconClass = computed(() => {
	if (props.file.type.startsWith('image/')) return 'ti ti-photo-off';
	if (props.file.type.startsWith('video/')) return 'ti ti-video-off';
	if (props.file.type.startsWith('audio/')) return 'ti ti-music-off';
	return 'ti ti-file-off';
});

const titleText = computed(() => {
	const lines: string[] = [];
	if (props.file.name) lines.push(`原文件：${props.file.name}`);
	if (props.file.deletedAt) lines.push(`清理时间：${new Date(props.file.deletedAt).toLocaleString()}`);
	return lines.length > 0 ? lines.join('\n') : undefined;
});
</script>

<style lang="scss" module>
.root {
	box-sizing: border-box;
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 4px;
	padding: 8px 12px;
	background: var(--MI_THEME-bg);
	border: 1.5px dashed var(--MI_THEME-divider);
	border-radius: 8px;
	text-align: center;
	overflow: hidden;
	cursor: default;
}

.icon {
	font-size: 1.5em;
	color: var(--MI_THEME-fg);
	opacity: 0.3;
}

.texts {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
	min-width: 0;
	max-width: 100%;
}

.title {
	font-size: 0.85em;
	font-weight: bold;
	color: var(--MI_THEME-fg);
	opacity: 0.7;
}

.owner {
	font-size: 0.75em;
	color: var(--MI_THEME-fg);
	opacity: 0.55;
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.ownerAcct {
	font-weight: 600;
}
</style>
