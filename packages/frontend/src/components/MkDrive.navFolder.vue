<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="[$style.root, { [$style.draghover]: draghover || touchDragHover }]"
	:data-drive-nav-folder="folder == null ? 'root' : folder.id"
	@dragover.prevent.stop="onDragover"
	@dragenter="onDragenter"
	@dragleave="onDragleave"
	@drop.stop="onDrop"
>
	<i v-if="folder == null" class="ti ti-cloud" style="margin-right: 4px;"></i>
	<span>{{ folder == null ? i18n.ts.drive : folder.name }}</span>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { globalEvents } from '@/events.js';
import { checkDragDataType, getDragData } from '@/drag-and-drop.js';

const props = withDefaults(defineProps<{
	folder?: Misskey.entities.DriveFolder;
	parentFolder: Misskey.entities.DriveFolder | null;
	touchDragHover?: boolean;
}>(), {
	touchDragHover: false,
});

const emit = defineEmits<{
	(ev: 'upload', files: File[], folder?: Misskey.entities.DriveFolder | null): void;
}>();

const draghover = ref(false);

function onDragover(ev: DragEvent) {
	if (!ev.dataTransfer) return;

	// このフォルダがルートかつカレントディレクトリならドロップ禁止
	if (props.folder == null && props.parentFolder == null) {
		ev.dataTransfer.dropEffect = 'none';
	}

	const isFile = ev.dataTransfer.items[0].kind === 'file';
	if (isFile || checkDragDataType(ev, ['driveFiles', 'driveFolders'])) {
		switch (ev.dataTransfer.effectAllowed) {
			case 'all':
			case 'uninitialized':
			case 'copy':
			case 'copyLink':
			case 'copyMove':
				ev.dataTransfer.dropEffect = 'copy';
				break;
			case 'linkMove':
			case 'move':
				ev.dataTransfer.dropEffect = 'move';
				break;
			default:
				ev.dataTransfer.dropEffect = 'none';
				break;
		}
	} else {
		ev.dataTransfer.dropEffect = 'none';
	}

	return false;
}

function onDragenter() {
	if (props.folder || props.parentFolder) draghover.value = true;
}

function onDragleave(ev: DragEvent) {
	// 移入自身子元素不算离开，避免高亮闪烁
	if (ev.relatedTarget instanceof Node && (ev.currentTarget as HTMLElement).contains(ev.relatedTarget)) return;
	if (props.folder || props.parentFolder) draghover.value = false;
}

function onDrop(ev: DragEvent) {
	draghover.value = false;

	if (!ev.dataTransfer) return;

	// ファイルだったら
	if (ev.dataTransfer.files.length > 0) {
		emit('upload', Array.from(ev.dataTransfer.files), props.folder);
		return;
	}

	//#region ドライブのファイル
	{
		const droppedData = getDragData(ev, 'driveFiles');
		if (droppedData != null) {
			misskeyApi('drive/files/move-bulk', {
				fileIds: droppedData.map(f => f.id),
				folderId: props.folder ? props.folder.id : null,
			}).then(() => {
				globalEvents.emit('driveFilesUpdated', droppedData.map(x => ({
					...x,
					folderId: props.folder ? props.folder.id : null,
					folder: props.folder ?? null,
				})));
			});
		}
	}
	//#endregion

	//#region ドライブのフォルダ
	{
		const droppedData = getDragData(ev, 'driveFolders');
		if (droppedData != null) {
			const droppedFolder = droppedData[0];
			// 移動先が自分自身ならreject
			if (props.folder && droppedFolder.id === props.folder.id) return;
			misskeyApi('drive/folders/update', {
				folderId: droppedFolder.id,
				parentId: props.folder ? props.folder.id : null,
			}).then(() => {
				globalEvents.emit('driveFoldersUpdated', [droppedFolder].map(x => ({
					...x,
					parentId: props.folder ? props.folder.id : null,
					parent: props.folder ?? null,
				})));
			});
		}
	}
	//#endregion
}
</script>

<style lang="scss" module>
.root {
	border-radius: 4px;

	&.draghover {
		background: var(--MI_THEME-accentedBg);
	}
}
</style>
