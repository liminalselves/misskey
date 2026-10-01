<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- 网盘文件被主人清理后的占位：保留版位并标注归属者，避免内容隐式消失 -->
<template>
<div :class="[$style.root, compact ? $style.compact : null]" :title="titleText">
	<i :class="[$style.icon, iconClass]"></i>
	<div :class="$style.texts">
		<span :class="$style.title">{{ kindLabel }}已被清理</span>
		<span v-if="file.user" :class="$style.owner">
			来自
			<MkA :to="userPage(file.user)" :class="$style.ownerLink" @click.stop>
				<MkAvatar :user="file.user" :class="$style.ownerAvatar" :link="false"/>
				<MkAcct :user="file.user"/>
			</MkA>
			，可联系 TA 补发
		</span>
		<span v-else-if="file.userId" :class="$style.owner">原主人已注销</span>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import { userPage } from '@/filters/user.js';

const props = withDefaults(defineProps<{
	file: Misskey.entities.DriveFile;
	compact?: boolean;
}>(), {
	compact: false,
});

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
	const lines = [`原文件：${props.file.name}`];
	if (props.file.deletedAt) lines.push(`清理时间：${new Date(props.file.deletedAt).toLocaleString()}`);
	return lines.join('\n');
});
</script>

<style lang="scss" module>
.root {
	box-sizing: border-box;
	width: 100%;
	height: 100%;
	min-height: 90px;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 12px;
	background: var(--MI_THEME-bg);
	border: 1.5px dashed var(--MI_THEME-divider);
	border-radius: 8px;
	text-align: center;
	overflow: hidden;
}

.icon {
	font-size: 2em;
	color: var(--MI_THEME-fg);
	opacity: 0.3;
}

.texts {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 3px;
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
	display: flex;
	align-items: center;
	justify-content: center;
	flex-wrap: wrap;
	gap: 2px;
	max-width: 100%;
}

.ownerLink {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--MI_THEME-link);
}

.ownerAvatar {
	width: 16px;
	height: 16px;
	border-radius: 50%;
	flex-shrink: 0;
}

.compact {
	width: auto;
	height: auto;
	min-height: 0;
	display: inline-flex;
	flex-direction: row;
	gap: 6px;
	padding: 6px 10px;
	border-radius: var(--MI-radius);

	.icon {
		font-size: 1.1em;
		align-self: center;
	}

	.texts {
		flex-direction: row;
		align-items: baseline;
		gap: 6px;
	}

	.title {
		font-size: 0.8em;
	}

	.owner {
		font-size: 0.72em;
	}

	.ownerAvatar {
		width: 14px;
		height: 14px;
	}
}
</style>
