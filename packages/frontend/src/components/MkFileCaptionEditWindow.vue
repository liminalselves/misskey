<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="400"
	:height="450"
	:withOkButton="true"
	:okButtonDisabled="false"
	@ok="ok()"
	@close="dialog?.close()"
	@closed="emit('closed')"
>
	<template #header>{{ i18n.ts.describeFile }}</template>
	<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
		<div v-if="isBlockedAgentImage" :class="$style.blockedPreview">
			<i class="ti ti-ban"></i>
			<span>图片已封禁</span>
		</div>
		<MkDriveFileThumbnail v-else-if="file" :file="file" fit="contain" style="height: 100px; margin-bottom: 16px;"/>
		<MkTextarea v-model="caption" autofocus :placeholder="i18n.ts.inputNewDescription">
			<template #label>{{ i18n.ts.caption }}</template>
		</MkTextarea>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { useTemplateRef, ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	file?: Misskey.entities.DriveFile | null;
	default?: string | null;
}>();

const emit = defineEmits<{
	(ev: 'done', v: string): void;
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');

const caption = ref(props.default ?? '');
const isBlockedAgentImage = computed(() => props.file?.isAgentImageBlocked === true);

async function ok() {
	emit('done', caption.value);
	dialog.value?.close();
}
</script>

<style lang="scss" module>
.blockedPreview {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	height: 100px;
	margin-bottom: 16px;
	border-radius: 8px;
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-error);
	font-weight: 700;
	gap: 8px;

	> i {
		font-size: 28px;
	}
}
</style>
