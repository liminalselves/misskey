<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer style="background: var(--MI_THEME-bg);">
	<template #header>
		<nav :class="$style.nav">
			<div :class="$style.navPath" @contextmenu.prevent.stop="() => {}">
				<XNavFolder
					:class="[$style.navPathItem, { [$style.navCurrent]: folder == null }]"
					:parentFolder="folder"
					:touchDragHover="touchDragHoverNavKey === 'root'"
					@click="cd(null)"
					@upload="onUploadRequested"
				/>
				<template v-for="f in hierarchyFolders">
					<span :class="[$style.navPathItem, $style.navSeparator]"><i class="ti ti-chevron-right"></i></span>
					<XNavFolder
						:folder="f"
						:parentFolder="folder"
						:class="[$style.navPathItem]"
						:touchDragHover="touchDragHoverNavKey === f.id"
						@click="cd(f)"
						@upload="onUploadRequested"
					/>
				</template>
				<span v-if="folder != null" :class="[$style.navPathItem, $style.navSeparator]"><i class="ti ti-chevron-right"></i></span>
				<span v-if="folder != null" :class="[$style.navPathItem, $style.navCurrent]">{{ folder.name }}</span>
			</div>
			<button class="_button" :class="$style.navMenu" @click="showMenu"><i class="ti ti-dots"></i></button>
		</nav>
	</template>

	<div>
		<div v-if="select === 'folder'">
			<template v-if="folder == null">
				<MkButton v-if="!isRootSelected" @click="isRootSelected = true">
					<i class="ti ti-square"></i> {{ i18n.ts.selectFolder }}
				</MkButton>
				<MkButton v-else @click="isRootSelected = false">
					<i class="ti ti-checkbox"></i> {{ i18n.ts.unselectFolder }}
				</MkButton>
			</template>
			<template v-else>
				<MkButton v-if="!selectedFolders.some(f => f.id === folder!.id)" @click="selectedFolders.push(folder)">
					<i class="ti ti-square"></i> {{ i18n.ts.selectFolder }}
				</MkButton>
				<MkButton v-else @click="selectedFolders = selectedFolders.filter(f => f.id !== folder!.id)">
					<i class="ti ti-checkbox"></i> {{ i18n.ts.unselectFolder }}
				</MkButton>
			</template>
		</div>

			<div
				ref="main"
				:class="[$style.main, { [$style.fetching]: fetching }]"
				@dragover.prevent.stop="onDragover"
				@dragenter="onDragenter"
				@dragleave="onDragleave"
				@drop.prevent.stop="onDrop"
				@contextmenu.capture="onContextmenuCapture"
				@contextmenu.stop="onContextmenu"
				@pointerdown="onMarqueePointerDown"
			>
			<div :class="$style.tipContainer">
				<MkTip k="drive"><div v-html="i18n.ts.driveAboutTip"></div></MkTip>
			</div>
			<div v-if="driveStats" :class="$style.usageGrid">
				<div :class="$style.usage">
					<div :class="$style.usageHeader">
						<span>普通网盘使用量</span>
						<span>{{ driveStats.usagePercent }}%</span>
					</div>
					<div :class="$style.usageBar">
						<div :class="$style.usageBarValue" :style="{ width: `${driveStats.usagePercent}%` }"></div>
					</div>
					<div :class="$style.usageText">
						已使用 {{ bytes(driveStats.usage) }} / 可使用 {{ bytes(driveStats.capacity) }}
					</div>
					<div :class="$style.usageText">
						AI 生图使用独立额度；图片移出 AI 生图文件夹后会占用普通网盘空间。
					</div>
				</div>

				<div v-if="folder?.systemType === 'agentGeneratedImages'" :class="$style.usage">
					<div :class="$style.usageHeader">
						<span>AI 生图空间</span>
						<span>{{ driveStats.agentImageUsagePercent }}%</span>
					</div>
					<div :class="$style.usageBar">
						<div :class="$style.usageBarValue" :style="{ width: `${driveStats.agentImageUsagePercent}%` }"></div>
					</div>
					<div :class="$style.usageText">
						已使用 {{ bytes(driveStats.agentImageUsage) }} / 可使用 {{ bytes(driveStats.agentImageCapacity) }}。低于 {{ bytes(driveStats.agentImageCleanupThreshold) }} 可用空间时，系统会自动清理最旧的 AI 生图，清理后聊天会显示“图片已被清理”。
					</div>
					<div :class="$style.usageText">
						如需长期保存，请将图片移出该文件夹；移出后会消耗普通网盘额度，并不再受 AI 生图自动清理管理。
					</div>
				</div>
			</div>

			<div :class="$style.folders">
				<XFolder
					v-for="(f, i) in foldersPaginator.items.value"
					:key="f.id"
					v-anim="i"
					:folder="f"
					:selectMode="select === 'folder'"
					:isSelected="selectedFolders.some(x => x.id === f.id)"
					:touchDragHover="touchDragHoverFolderId === f.id"
					@chosen="chooseFolder"
					@unchose="unchoseFolder"
					@click="cd(f)"
					@upload="onUploadRequested"
					@dragstart="isDragSource = true"
					@dragend="isDragSource = false"
				/>
			</div>
			<MkButton v-if="foldersPaginator.canFetchOlder.value" primary rounded @click="foldersPaginator.fetchOlder()">{{ i18n.ts.loadMore }}</MkButton>

			<template v-if="shouldBeGroupedByDate">
				<MkStickyContainer v-for="(item, i) in filesTimeline" :key="`${item.date.getFullYear()}/${item.date.getMonth() + 1}`">
					<template #header>
						<div :class="$style.date">
							<span><i class="ti ti-chevron-down"></i> {{ item.date.getFullYear() }}/{{ item.date.getMonth() + 1 }}</span>
						</div>
					</template>

					<TransitionGroup
						tag="div"
						:enterActiveClass="prefer.s.animation ? $style.transition_files_enterActive : ''"
						:leaveActiveClass="prefer.s.animation ? $style.transition_files_leaveActive : ''"
						:enterFromClass="prefer.s.animation ? $style.transition_files_enterFrom : ''"
						:leaveToClass="prefer.s.animation ? $style.transition_files_leaveTo : ''"
						:moveClass="prefer.s.animation ? $style.transition_files_move : ''"
						:class="$style.files"
					>
						<XFile
							v-for="file in item.items" :key="file.id"
							:file="file"
							:folder="folder"
							:isSelected="selectedFiles.some(x => x.id === file.id)"
							@click="onFileClick($event, file)"
							@dragstart="onFileDragstart(file, $event)"
							@dragend="onItemDragend"
						/>
					</TransitionGroup>
				</MkStickyContainer>
			</template>
			<TransitionGroup
				v-else
				tag="div"
				:enterActiveClass="prefer.s.animation ? $style.transition_files_enterActive : ''"
				:leaveActiveClass="prefer.s.animation ? $style.transition_files_leaveActive : ''"
				:enterFromClass="prefer.s.animation ? $style.transition_files_enterFrom : ''"
				:leaveToClass="prefer.s.animation ? $style.transition_files_leaveTo : ''"
				:moveClass="prefer.s.animation ? $style.transition_files_move : ''"
				:class="$style.files"
			>
				<XFile
					v-for="file in filesPaginator.items.value" :key="file.id"
					:file="file"
					:folder="folder"
					:isSelected="selectedFiles.some(x => x.id === file.id)"
						@click="onFileClick($event, file)"
						@dragstart="onFileDragstart(file, $event)"
						@dragend="onItemDragend"
					/>
			</TransitionGroup>

			<MkButton
				v-show="canFetchFiles"
				v-appear="shouldEnableInfiniteScroll ? fetchMoreFiles : null"
				:class="$style.loadMore"
				primary
				rounded
				@click="fetchMoreFiles"
			>
				{{ i18n.ts.loadMore }}
			</MkButton>

			<div v-if="filesPaginator.items.value.length == 0 && foldersPaginator.items.value.length == 0 && !fetching" :class="$style.empty">
				<div v-if="draghover">{{ i18n.ts.dropHereToUpload }}</div>
				<div v-if="!draghover && folder == null"><strong>{{ i18n.ts.emptyDrive }}</strong></div>
				<div v-if="!draghover && folder != null">{{ i18n.ts.emptyFolder }}</div>
			</div>
		</div>
		<MkLoading v-if="fetching"/>
		<div v-if="draghover" :class="$style.dropzone"></div>
		<Teleport to="body">
			<div
				v-if="marqueeRect"
				:class="$style.marquee"
				:style="{ left: marqueeRect.left + 'px', top: marqueeRect.top + 'px', width: marqueeRect.width + 'px', height: marqueeRect.height + 'px', zIndex: dragOverlayZIndex }"
			></div>
			<div
				v-if="touchDragGhost"
				:class="$style.touchDragGhost"
				:style="{ left: touchDragGhost.x + 'px', top: touchDragGhost.y + 'px', zIndex: dragOverlayZIndex }"
			>
				<i class="ti ti-folder-symlink"></i>
				<span>移动 {{ touchDragGhost.count }} 个文件</span>
			</div>
		</Teleport>
	</div>

	<template #footer>
		<div v-if="isEditMode" :class="$style.footer">
			<MkButton primary rounded :disabled="selectedFiles.length === 0" @click="moveFilesBulk()"><i class="ti ti-folder-symlink"></i> {{ i18n.ts.move }}...</MkButton>
			<MkButton danger rounded :disabled="selectedFiles.length === 0" @click="deleteFilesBulk()"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
		</div>
	</template>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { nextTick, onActivated, onBeforeUnmount, onMounted, ref, useTemplateRef, watch, computed, TransitionGroup, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from './MkButton.vue';
import type { MenuItem } from '@/types/menu.js';
import XNavFolder from '@/components/MkDrive.navFolder.vue';
import XFolder from '@/components/MkDrive.folder.vue';
import XFile from '@/components/MkDrive.file.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useStream } from '@/stream.js';
import { i18n } from '@/i18n.js';
import { claimAchievement } from '@/utility/achievements.js';
import { prefer } from '@/preferences.js';
import { chooseFileFromPcAndUpload, selectDriveFolder } from '@/utility/drive.js';
import { store } from '@/store.js';
import { makeDateGroupedTimelineComputedRef } from '@/utility/timeline-date-separate.js';
import { globalEvents, useGlobalEvent } from '@/events.js';
import { checkDragDataType, getDragData, setDragData } from '@/drag-and-drop.js';
import { getDriveFileMenu } from '@/utility/get-drive-file-menu.js';
import { Paginator } from '@/utility/paginator.js';
import bytes from '@/filters/bytes.js';
import { useRouter } from '@/router.js';

const router = useRouter();

const props = withDefaults(defineProps<{
	initialFolder?: Misskey.entities.DriveFolder | Misskey.entities.DriveFolder['id'] | null;
	type?: string;
	multiple?: boolean;
	select?: 'file' | 'folder' | null;
	forceDisableInfiniteScroll?: boolean;
}>(), {
	initialFolder: null,
	multiple: false,
	select: null,
	forceDisableInfiniteScroll: false,
});

const emit = defineEmits<{
	(ev: 'changeSelectedFiles', v: Misskey.entities.DriveFile[]): void;
	(ev: 'changeSelectedFolders', v: (Misskey.entities.DriveFolder | null)[]): void;
	(ev: 'cd', v: Misskey.entities.DriveFolder | null): void;
}>();

const shouldEnableInfiniteScroll = computed(() => {
	return prefer.r.enableInfiniteScroll.value && !props.forceDisableInfiniteScroll;
});

const folder = ref<Misskey.entities.DriveFolder | null>(null);
const hierarchyFolders = ref<Misskey.entities.DriveFolder[]>([]);

// ドロップされようとしているか
const draghover = ref(false);

// 自身の所有するアイテムがドラッグをスタートさせたか
// (自分自身の階層にドロップできないようにするためのフラグ)
const isDragSource = ref(false);

const isEditMode = ref(false);

const selectedFiles = ref<Misskey.entities.DriveFile[]>([]);
const selectedFolders = ref<Misskey.entities.DriveFolder[]>([]);
const isRootSelected = ref(false);

watch(selectedFiles, () => {
	emit('changeSelectedFiles', selectedFiles.value);
}, { deep: true });

watch([selectedFolders, isRootSelected], () => {
	emit('changeSelectedFolders', isRootSelected.value ? [null, ...selectedFolders.value] : selectedFolders.value);
});

const fetching = ref(true);
const driveStats = ref<{
	usage: number;
	capacity: number;
	usagePercent: number;
	agentImageUsage: number;
	agentImageCapacity: number;
	agentImageUsagePercent: number;
	agentImageCleanupThreshold: number;
	agentImageCleanupTarget: number;
} | null>(null);

const sortModeSelect = ref<NonNullable<Misskey.entities.DriveFilesRequest['sort']>>('+createdAt');

const filesPaginator = markRaw(new Paginator('drive/files', {
	limit: 30,
	canFetchDetection: 'limit',
	params: () => ({ // 自動でリロードしたくないためcomputedParamsは使わない
		folderId: folder.value ? folder.value.id : null,
		type: props.type,
		sort: ['-createdAt', '+createdAt'].includes(sortModeSelect.value) ? null : sortModeSelect.value,
	}),
}));
const foldersPaginator = markRaw(new Paginator('drive/folders', {
	limit: 30,
	canFetchDetection: 'limit',
	params: () => ({ // 自動でリロードしたくないためcomputedParamsは使わない
		folderId: folder.value ? folder.value.id : null,
	}),
}));

const canFetchFiles = computed(() => !fetching.value && (filesPaginator.order.value === 'oldest' ? filesPaginator.canFetchNewer.value : filesPaginator.canFetchOlder.value));

async function fetchMoreFiles() {
	if (filesPaginator.order.value === 'oldest') {
		filesPaginator.fetchNewer();
	} else {
		filesPaginator.fetchOlder();
	}
}

const filesTimeline = makeDateGroupedTimelineComputedRef(filesPaginator.items, 'month');
const shouldBeGroupedByDate = computed(() => ['+createdAt', '-createdAt'].includes(sortModeSelect.value));

watch(folder, () => emit('cd', folder.value));
watch(sortModeSelect, () => {
	initialize();
});

async function initialize() {
	fetching.value = true;
	await fetchDriveStats();
	await foldersPaginator.reload();
	filesPaginator.initialDirection = sortModeSelect.value === '-createdAt' ? 'newer' : 'older';
	filesPaginator.order.value = sortModeSelect.value === '-createdAt' ? 'oldest' : 'newest';
	await filesPaginator.reload();
	fetching.value = false;
}

function isProtectedAgentImageFolderError(err: unknown): boolean {
	return err != null && typeof err === 'object' && 'code' in err && (
		(err as { code?: unknown }).code === 'PROTECTED_AGENT_IMAGE_FOLDER' ||
		(err as { code?: unknown }).code === 'PROTECTED_FOLDER'
	);
}

function showProtectedAgentImageFolderError(kind: 'upload' | 'move' = 'move') {
	os.alert({
		type: 'error',
		title: kind === 'upload' ? i18n.ts.failedToUpload : '无法移动',
		text: kind === 'upload'
			? 'AI 生图专用文件夹只能保存智能体生成的图片，不能上传或移入其他图片。'
			: 'AI 生图专用文件夹只能保存智能体生成的图片，不能移入其他图片。AI 生图移出后会占用普通网盘空间。',
	});
}

async function fetchDriveStats() {
	const stats = await misskeyApi('drive/stats' as any, {}) as Partial<NonNullable<typeof driveStats.value>> & { usage: number; capacity: number; usagePercent: number };
	driveStats.value = {
		usage: stats.usage,
		capacity: stats.capacity,
		usagePercent: stats.usagePercent,
		agentImageUsage: stats.agentImageUsage ?? 0,
		agentImageCapacity: stats.agentImageCapacity ?? 0,
		agentImageUsagePercent: stats.agentImageUsagePercent ?? 0,
		agentImageCleanupThreshold: stats.agentImageCleanupThreshold ?? 0,
		agentImageCleanupTarget: stats.agentImageCleanupTarget ?? 0,
	};
}

function onStreamDriveFileCreated(file: Misskey.entities.DriveFile) {
	if (file.folderId === (folder.value?.id ?? null)) {
		filesPaginator.prepend(file);
	}
	void fetchDriveStats();
}

let nativeDragImageEl: HTMLElement | null = null;

function onFileDragstart(file: Misskey.entities.DriveFile, ev: DragEvent) {
	if (isEditMode.value) {
		if (!selectedFiles.value.some(f => f.id === file.id)) {
			selectedFiles.value.push(file);
		}

		if (ev.dataTransfer) {
			ev.dataTransfer.effectAllowed = 'move';
			setDragData(ev, 'driveFiles', selectedFiles.value);

			// 多选拖动时使用带数量的自定义拖拽图像，替代单个文件缩略图
			if (selectedFiles.value.length > 1) {
				if (nativeDragImageEl != null) nativeDragImageEl.remove();
				const el = window.document.createElement('div');
				Object.assign(el.style, {
					position: 'fixed',
					top: '-200px',
					left: '-200px',
					padding: '8px 16px',
					borderRadius: '999px',
					background: 'var(--MI_THEME-accent)',
					color: 'var(--MI_THEME-fgOnAccent)',
					fontSize: '13px',
					fontWeight: '700',
					whiteSpace: 'nowrap',
					pointerEvents: 'none',
				});
				el.textContent = `移动 ${selectedFiles.value.length} 个文件`;
				window.document.body.appendChild(el);
				// 热点取图像中心，用户用胶囊对准哪里，落下判定就在哪里
				ev.dataTransfer.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2);
				nativeDragImageEl = el;
			}
		}
	}

	isDragSource.value = true;
}

function onItemDragend() {
	isDragSource.value = false;
	if (nativeDragImageEl != null) {
		nativeDragImageEl.remove();
		nativeDragImageEl = null;
	}
}

// 原生 HTML5 拖拽不会滚动自定义 overflow 容器，记录指针位置供自动滚动
let nativeDragPointer: { x: number; y: number; time: number } | null = null;
let nativeDragRafId: number | null = null;
let nativeDragScrollParent: HTMLElement | null = null;

function onDragover(ev: DragEvent) {
	if (!ev.dataTransfer) return;

	// ドラッグ元が自分自身の所有するアイテムだったら
	if (isDragSource.value) {
		// 自分自身にはドロップさせない
		ev.dataTransfer.dropEffect = 'none';
		return;
	}

	const isFile = ev.dataTransfer.items[0].kind === 'file';
	if (isFile && folder.value?.systemType === 'agentGeneratedImages') {
		ev.dataTransfer.dropEffect = 'none';
		return false;
	}

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
	// AI 生图专用文件夹不接受拖入，不显示可投放高亮
	if (folder.value?.systemType === 'agentGeneratedImages') return;
	if (!isDragSource.value) draghover.value = true;
}

function onDragleave(ev: DragEvent) {
	// 移入自身子元素不算离开，避免高亮闪烁
	if (ev.relatedTarget instanceof Node && (ev.currentTarget as HTMLElement).contains(ev.relatedTarget)) return;
	draghover.value = false;
}

function onDrop(ev: DragEvent): void | boolean {
	draghover.value = false;

	if (!ev.dataTransfer) return;

	// ドロップされてきたものがファイルだったら
	if (ev.dataTransfer.files.length > 0) {
		if (folder.value?.systemType === 'agentGeneratedImages') {
			showProtectedAgentImageFolderError('upload');
			return;
		}
		os.launchUploader(Array.from(ev.dataTransfer.files), {
			folderId: folder.value?.id ?? null,
		});
		return;
	}

	//#region ドライブのファイル
	{
		const droppedData = getDragData(ev, 'driveFiles');
		if (droppedData != null) {
			const targetFolderId = folder.value ? folder.value.id : null;
			// 拖到当前文件夹的空白处，位置没有变化，直接忽略
			if (droppedData.every(f => f.folderId === targetFolderId)) return;
			misskeyApi('drive/files/move-bulk', {
				fileIds: droppedData.map(f => f.id),
				folderId: targetFolderId,
			}).then(() => {
				globalEvents.emit('driveFilesUpdated', droppedData.map(x => ({
					...x,
					folderId: targetFolderId,
					folder: folder.value,
				})));
				void fetchDriveStats();
			}).catch(err => {
				if (isProtectedAgentImageFolderError(err)) {
					showProtectedAgentImageFolderError('move');
					return;
				}
				os.alert({
					type: 'error',
					text: i18n.ts.somethingHappened,
				});
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
			if (folder.value && droppedFolder.id === folder.value.id) return false;
			if (foldersPaginator.items.value.some(f => f.id === droppedFolder.id)) return false;
			misskeyApi('drive/folders/update', {
				folderId: droppedFolder.id,
				parentId: folder.value ? folder.value.id : null,
			}).then(() => {
				globalEvents.emit('driveFoldersUpdated', [droppedFolder].map(x => ({
					...x,
					parentId: folder.value ? folder.value.id : null,
					parent: folder.value,
				})));
			}).catch(err => {
				switch (err.code) {
					case 'RECURSIVE_NESTING':
						claimAchievement('driveFolderCircularReference');
						os.alert({
							type: 'error',
							title: i18n.ts.unableToProcess,
							text: i18n.ts.circularReferenceFolder,
						});
						break;
					default:
						os.alert({
							type: 'error',
							text: i18n.ts.somethingHappened,
						});
				}
			});
		}
	}
	//#endregion
}

function onUploadRequested(files: File[], folder?: Misskey.entities.DriveFolder | null) {
	if (folder?.systemType === 'agentGeneratedImages') {
		showProtectedAgentImageFolderError('upload');
		return;
	}
	os.launchUploader(files, {
		folderId: folder?.id ?? null,
	});
}

async function urlUpload() {
	if (folder.value?.systemType === 'agentGeneratedImages') {
		showProtectedAgentImageFolderError('upload');
		return;
	}

	const { canceled, result: url } = await os.inputText({
		title: i18n.ts.uploadFromUrl,
		type: 'url',
		placeholder: i18n.ts.uploadFromUrlDescription,
	});
	if (canceled || !url) return;

	await os.apiWithDialog('drive/files/upload-from-url', {
		url: url,
		folderId: folder.value ? folder.value.id : undefined,
	});

	os.alert({
		title: i18n.ts.uploadFromUrlRequested,
		text: i18n.ts.uploadFromUrlMayTakeTime,
	});
}

async function createFolder() {
	const { canceled, result: name } = await os.inputText({
		title: i18n.ts.createFolder,
		placeholder: i18n.ts.folderName,
	});
	if (canceled || name == null) return;

	const createdFolder = await os.apiWithDialog('drive/folders/create', {
		name: name,
		parentId: folder.value ? folder.value.id : undefined,
	});

	foldersPaginator.prepend(createdFolder);
}

async function renameFolder(folderToRename: Misskey.entities.DriveFolder) {
	const { canceled, result: name } = await os.inputText({
		title: i18n.ts.renameFolder,
		placeholder: i18n.ts.inputNewFolderName,
		default: folderToRename.name,
	});
	if (canceled) return;

	const updatedFolder = await os.apiWithDialog('drive/folders/update', {
		folderId: folderToRename.id,
		name: name,
	});

	globalEvents.emit('driveFoldersUpdated', [updatedFolder]);
}

function deleteFolder(folderToDelete: Misskey.entities.DriveFolder) {
	misskeyApi('drive/folders/delete', {
		folderId: folderToDelete.id,
	}).then(() => {
		// 削除時に親フォルダに移動
		cd(folderToDelete.parentId);
		globalEvents.emit('driveFoldersDeleted', [folderToDelete]);
	}).catch(err => {
		switch (err.id) {
			case 'b0fc8a17-963c-405d-bfbc-859a487295e1':
				os.alert({
					type: 'error',
					title: i18n.ts.unableToDelete,
					text: i18n.ts.hasChildFilesOrFolders,
				});
				break;
			default:
				os.alert({
					type: 'error',
					text: i18n.ts.unableToDelete,
				});
		}
	});
}

function onFileClick(ev: PointerEvent, file: Misskey.entities.DriveFile) {
	if (ev.shiftKey) {
		isEditMode.value = true;
	}

	if (props.select === 'file' || isEditMode.value) {
		const isAlreadySelected = selectedFiles.value.some(f => f.id === file.id);

		if (isEditMode.value) {
			if (isAlreadySelected) {
				selectedFiles.value = selectedFiles.value.filter(f => f.id !== file.id);
			} else {
				selectedFiles.value.push(file);
			}
			return;
		}

		if (props.multiple) {
			if (isAlreadySelected) {
				selectedFiles.value = selectedFiles.value.filter(f => f.id !== file.id);
			} else {
				selectedFiles.value.push(file);
			}
		} else {
			if (isAlreadySelected) {
				//emit('selected', file);
			} else {
				selectedFiles.value = [file];
			}
		}
	} else {
		// 短点击导航到文件详情页面（媒体预览）
		// 右键菜单仍可通过 @contextmenu 触发
		router.pushByPath(`/my/drive/file/${file.id}`, 'forcePage');
	}
}

function chooseFolder(folderToChoose: Misskey.entities.DriveFolder) {
	const isAlreadySelected = selectedFolders.value.some(f => f.id === folderToChoose.id);
	if (props.multiple) {
		if (isAlreadySelected) {
			selectedFolders.value = selectedFolders.value.filter(f => f.id !== folderToChoose.id);
		} else {
			selectedFolders.value.push(folderToChoose);
		}
	} else {
		if (isAlreadySelected) {
			//emit('selected', folderToChoose);
		} else {
			selectedFolders.value = [folderToChoose];
		}
	}
}

function unchoseFolder(folderToUnchose: Misskey.entities.DriveFolder) {
	selectedFolders.value = selectedFolders.value.filter(f => f.id !== folderToUnchose.id);
}

function cd(target?: Misskey.entities.DriveFolder | Misskey.entities.DriveFolder['id' | 'parentId']) {
	if (!target) {
		goRoot();
		return;
	} else if (typeof target === 'object') {
		target = target.id;
	}

	fetching.value = true;

	misskeyApi('drive/folders/show', {
		folderId: target,
	}).then(folderToMove => {
		folder.value = folderToMove;
		hierarchyFolders.value = [];

		const dive = (folderToDive: Misskey.entities.DriveFolder) => {
			hierarchyFolders.value.unshift(folderToDive);
			if (folderToDive.parent) dive(folderToDive.parent);
		};

		if (folderToMove.parent) dive(folderToMove.parent);

		initialize();
	});
}

async function moveFilesBulk() {
	if (selectedFiles.value.length === 0) return;

	const { canceled, folders } = await selectDriveFolder(folder.value ? folder.value.id : null);

	if (canceled) return;

	try {
		await misskeyApi('drive/files/move-bulk', {
			fileIds: selectedFiles.value.map(f => f.id),
			folderId: folders[0] ? folders[0].id : null,
		});
	} catch (err) {
		if (isProtectedAgentImageFolderError(err)) {
			showProtectedAgentImageFolderError('move');
			return;
		}
		os.alert({
			type: 'error',
			text: i18n.ts.somethingHappened,
		});
		return;
	}

	globalEvents.emit('driveFilesUpdated', selectedFiles.value.map(x => ({
		...x,
		folderId: folders[0] ? folders[0].id : null,
		folder: folders[0] ?? null,
	})));
	void fetchDriveStats();
}

async function deleteFilesBulk() {
	if (selectedFiles.value.length === 0) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.delete,
		text: `确定要删除选中的 ${selectedFiles.value.length} 个文件吗？此操作不可撤销`,
	});
	if (canceled) return;

	// 逐一删除，已成功删除的文件从列表中移除，失败时提示并保留未删除的选中状态
	const deletedFiles: Misskey.entities.DriveFile[] = [];
	for (const file of [...selectedFiles.value]) {
		try {
			await misskeyApi('drive/files/delete', {
				fileId: file.id,
			});
			deletedFiles.push(file);
		} catch (err) {
			os.alert({
				type: 'error',
				text: i18n.ts.somethingHappened,
			});
			break;
		}
	}

	if (deletedFiles.length > 0) {
		globalEvents.emit('driveFilesDeleted', deletedFiles);
		selectedFiles.value = selectedFiles.value.filter(f => !deletedFiles.some(x => x.id === f.id));
		void fetchDriveStats();
	}
}

function goRoot() {
	// 既にrootにいるなら何もしない
	if (folder.value == null) return;

	folder.value = null;
	hierarchyFolders.value = [];
	initialize();
}

function getMenu() {
	const menu: MenuItem[] = [];

	menu.push({
		text: i18n.ts.addFile,
		type: 'label',
	}, {
		text: i18n.ts.upload,
		icon: 'ti ti-upload',
		action: () => {
			if (folder.value?.systemType === 'agentGeneratedImages') {
				showProtectedAgentImageFolderError('upload');
				return;
			}
			chooseFileFromPcAndUpload({
				multiple: true,
				folderId: folder.value?.id,
			});
		},
	}, {
		text: i18n.ts.fromUrl,
		icon: 'ti ti-link',
		action: () => { urlUpload(); },
	}, { type: 'divider' }, {
		text: folder.value ? folder.value.name : i18n.ts.drive,
		type: 'label',
	});

	menu.push({
		type: 'parent',
		text: i18n.ts.sort,
		icon: 'ti ti-arrows-sort',
		children: [{
			text: `${i18n.ts.registeredDate} (${i18n.ts.descendingOrder})`,
			icon: 'ti ti-sort-descending-letters',
			action: () => { sortModeSelect.value = '+createdAt'; },
			active: sortModeSelect.value === '+createdAt',
		}, {
			text: `${i18n.ts.registeredDate} (${i18n.ts.ascendingOrder})`,
			icon: 'ti ti-sort-ascending-letters',
			action: () => { sortModeSelect.value = '-createdAt'; },
			active: sortModeSelect.value === '-createdAt',
		}, {
			text: `${i18n.ts.size} (${i18n.ts.descendingOrder})`,
			icon: 'ti ti-sort-descending-letters',
			action: () => { sortModeSelect.value = '+size'; },
			active: sortModeSelect.value === '+size',
		}, {
			text: `${i18n.ts.size} (${i18n.ts.ascendingOrder})`,
			icon: 'ti ti-sort-ascending-letters',
			action: () => { sortModeSelect.value = '-size'; },
			active: sortModeSelect.value === '-size',
		}, {
			text: `${i18n.ts.name} (${i18n.ts.descendingOrder})`,
			icon: 'ti ti-sort-descending-letters',
			action: () => { sortModeSelect.value = '+name'; },
			active: sortModeSelect.value === '+name',
		}, {
			text: `${i18n.ts.name} (${i18n.ts.ascendingOrder})`,
			icon: 'ti ti-sort-ascending-letters',
			action: () => { sortModeSelect.value = '-name'; },
			active: sortModeSelect.value === '-name',
		}],
	});

	if (folder.value) {
		menu.push({
			text: i18n.ts.renameFolder,
			icon: 'ti ti-forms',
			action: () => { if (folder.value) renameFolder(folder.value); },
		}, {
			text: i18n.ts.deleteFolder,
			icon: 'ti ti-trash',
			action: () => { deleteFolder(folder.value as Misskey.entities.DriveFolder); },
		});
	}

	menu.push({
		text: i18n.ts.createFolder,
		icon: 'ti ti-folder-plus',
		action: () => { createFolder(); },
	}, { type: 'divider' }, {
		type: 'switch',
		text: i18n.ts.edit,
		icon: 'ti ti-pointer',
		ref: isEditMode,
	});

	return menu;
}

function showMenu(ev: PointerEvent) {
	os.popupMenu(getMenu(), (ev.currentTarget ?? ev.target ?? undefined) as HTMLElement | undefined);
}

function onContextmenu(ev: PointerEvent) {
	if (marqueeRect.value != null) return;
	os.contextMenu(getMenu(), ev);
}

//#region 拖拽手势（框选 / 触屏拖拽移动）
const mainEl = useTemplateRef('main');

const marqueeEnabled = computed(() => isEditMode.value || (props.select === 'file' && props.multiple));

type MarqueeState = {
	pointerId: number;
	pointerType: string;
	startX: number;
	startY: number;
	curX: number;
	curY: number;
	startedOnItem: boolean;
	startFileId: string | null;
	active: boolean;
	touchDrag: boolean;
	longPressTimer: number | null;
	hoverFolderId: string | null;
	hoverNavKey: string | null;
	baseFiles: Misskey.entities.DriveFile[];
	scrollParent: HTMLElement | null;
	rafId: number | null;
};

let marquee: MarqueeState | null = null;
const marqueeRect = ref<{ left: number; top: number; width: number; height: number } | null>(null);
const touchDragGhost = ref<{ x: number; y: number; count: number } | null>(null);
const touchDragHoverFolderId = ref<string | null>(null);
const touchDragHoverNavKey = ref<string | null>(null);
// 矩形与浮标渲染在 body 下（容器查询/弹窗 transform 会改变 fixed 的包含块），z-index 需高于当前弹窗
const dragOverlayZIndex = ref(0);

function onMarqueePointerDown(ev: PointerEvent) {
	if (!marqueeEnabled.value || marquee != null) return;
	if (ev.pointerType === 'mouse' && ev.button !== 0) return;
	if (!ev.isPrimary) return;
	const target = ev.target as Element | null;
	if (target == null || !(target instanceof Element)) return;
	if (target.closest('button, a, input, textarea, select') != null) return;
	const fileEl = target.closest('[data-drive-file]') as HTMLElement | null;
	const startedOnItem = fileEl != null || target.closest('[data-drive-folder]') != null;
	// PC 从文件/文件夹上起拖保留给原生拖拽移动，框选只从空白处开始
	if (ev.pointerType === 'mouse' && startedOnItem) return;

	marquee = {
		pointerId: ev.pointerId,
		pointerType: ev.pointerType,
		startX: ev.clientX,
		startY: ev.clientY,
		curX: ev.clientX,
		curY: ev.clientY,
		startedOnItem,
		startFileId: fileEl?.dataset.driveFile ?? null,
		active: false,
		touchDrag: false,
		longPressTimer: null,
		hoverFolderId: null,
		hoverNavKey: null,
		baseFiles: [...selectedFiles.value],
		scrollParent: null,
		rafId: null,
	};
	window.addEventListener('pointermove', onMarqueePointerMove, { passive: false });
	window.addEventListener('pointerup', onMarqueePointerUp);
	window.addEventListener('pointercancel', onMarqueePointerCancel);
	// pointermove 的 preventDefault 无法阻止触屏滚动，需要非被动 touchmove
	if (ev.pointerType !== 'mouse') {
		window.addEventListener('touchmove', onMarqueeTouchMove, { passive: false });

		// 触屏长按文件进入拖拽移动（须在浏览器长按菜单触发前激活）
		if (fileEl != null) {
			const timer = window.setTimeout(() => {
				const m = marquee;
				if (m == null || m.longPressTimer !== timer || m.active) return;
				m.longPressTimer = null;
				activateTouchDrag(m);
			}, 400);
			marquee.longPressTimer = timer;
		}
	}
}

function onMarqueePointerMove(ev: PointerEvent) {
	const m = marquee;
	if (m == null || ev.pointerId !== m.pointerId) return;
	m.curX = ev.clientX;
	m.curY = ev.clientY;

	if (m.touchDrag) {
		if (ev.cancelable) ev.preventDefault();
		updateTouchDrag(m);
		return;
	}

	if (!m.active) {
		const dx = ev.clientX - m.startX;
		const dy = ev.clientY - m.startY;
		const dist = Math.hypot(dx, dy);
		// 有明显位移就不再是长按，取消拖拽移动的等待
		if (m.longPressTimer != null && dist >= 8) {
			window.clearTimeout(m.longPressTimer);
			m.longPressTimer = null;
		}
		const threshold = m.pointerType === 'mouse' ? 6 : 12;
		if (dist < threshold) return;
		if (m.pointerType !== 'mouse' && m.startedOnItem) {
			// 触屏从文件上起拖：横向为主判定为框选，纵向让给页面滚动
			if (Math.abs(dx) <= Math.abs(dy)) {
				cancelMarquee();
				return;
			}
		}
		m.active = true;
		m.scrollParent = getMainScrollParent();
		dragOverlayZIndex.value = os.claimZIndex('high');
	}

	if (ev.cancelable) ev.preventDefault();
	applyMarqueeSelection();
	startMarqueeAutoScroll();
}

function onMarqueeTouchMove(ev: TouchEvent) {
	const m = marquee;
	if (m == null) return;
	// 空白处起拖始终阻止滚动；文件上起拖在判定为框选/拖拽移动后才阻止
	if (m.active || m.touchDrag || !m.startedOnItem) {
		if (ev.cancelable) ev.preventDefault();
	}
}

function getMainScrollParent(): HTMLElement | null {
	let el = mainEl.value?.parentElement ?? null;
	while (el != null) {
		const style = window.getComputedStyle(el);
		if (el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(style.overflowY)) {
			return el;
		}
		el = el.parentElement;
	}
	return null;
}

function edgeScrollDelta(curY: number, scrollParent: HTMLElement | null): number {
	const edge = 48;
	const maxSpeed = 16;
	const top = scrollParent == null ? 0 : scrollParent.getBoundingClientRect().top;
	const bottom = scrollParent == null ? window.innerHeight : scrollParent.getBoundingClientRect().bottom;
	if (curY < top + edge) {
		return -maxSpeed * (1 - Math.max(curY - top, 0) / edge);
	} else if (curY > bottom - edge) {
		return maxSpeed * (1 - Math.max(bottom - curY, 0) / edge);
	}
	return 0;
}

function applyEdgeScroll(scrollParent: HTMLElement | null, delta: number) {
	if (scrollParent == null) {
		window.scrollBy(0, delta);
	} else {
		scrollParent.scrollTop += delta;
	}
}

function applyMarqueeSelection() {
	const m = marquee;
	const main = mainEl.value;
	if (m == null || !m.active || main == null) return;

	const left = Math.min(m.startX, m.curX);
	const top = Math.min(m.startY, m.curY);
	const right = Math.max(m.startX, m.curX);
	const bottom = Math.max(m.startY, m.curY);
	marqueeRect.value = { left, top, width: right - left, height: bottom - top };

	const hitIds = new Set<string>();
	for (const el of main.querySelectorAll('[data-drive-file]')) {
		const r = el.getBoundingClientRect();
		if (r.right >= left && r.left <= right && r.bottom >= top && r.top <= bottom) {
			const id = (el as HTMLElement).dataset.driveFile;
			if (id != null) hitIds.add(id);
		}
	}

	// 框选为增量选择：起拖前已选中的保留，框内新增的随矩形变化而增减
	const baseIds = new Set(m.baseFiles.map(f => f.id));
	const next = [...m.baseFiles];
	for (const f of filesPaginator.items.value) {
		if (hitIds.has(f.id) && !baseIds.has(f.id)) next.push(f);
	}
	selectedFiles.value = next;
}

function startMarqueeAutoScroll() {
	const m = marquee;
	if (m == null || m.rafId != null) return;
	const step = () => {
		const mm = marquee;
		if (mm == null || !mm.active) return;
		const delta = edgeScrollDelta(mm.curY, mm.scrollParent);
		if (delta !== 0) {
			applyEdgeScroll(mm.scrollParent, delta);
			applyMarqueeSelection();
		}
		mm.rafId = requestAnimationFrame(step);
	};
	m.rafId = requestAnimationFrame(step);
}

//#region 触屏长按拖拽移动
// 浮标中心即命中点：位置由触点坐标同步计算（不能读渲染后的 DOM 矩形，Vue 异步更新会滞后一帧）。
// 浮标视觉上浮在触点上方 33px（16px 间距 + 约 17px 半高），用户以浮标对准目标。
const touchDragAimOffsetY = 33;

function getTouchDragAim(m: MarqueeState): { x: number; y: number } {
	return { x: m.curX, y: m.curY - touchDragAimOffsetY };
}

function activateTouchDrag(m: MarqueeState) {
	if (m.startFileId == null) return;
	const file = filesPaginator.items.value.find(f => f.id === m.startFileId);
	if (file == null) return;

	m.touchDrag = true;
	m.scrollParent = getMainScrollParent();
	dragOverlayZIndex.value = os.claimZIndex('high');

	// 对齐桌面拖拽移动的行为：起按文件未选中时并入当前选中集
	if (!selectedFiles.value.some(f => f.id === file.id)) {
		selectedFiles.value = [...selectedFiles.value, file];
	}
	const aim = getTouchDragAim(m);
	touchDragGhost.value = { x: aim.x, y: aim.y, count: selectedFiles.value.length };
	startTouchDragAutoScroll(m);
}

function updateTouchDrag(m: MarqueeState) {
	const aim = getTouchDragAim(m);
	touchDragGhost.value = { x: aim.x, y: aim.y, count: selectedFiles.value.length };

	let folderId: string | null = null;
	let navKey: string | null = null;

	// 面包屑条目是吸顶层且可见性最高，优先判定；
	// 文件夹用矩形包含判定兜底——滑入吸顶导航带下方的文件夹会被 elementFromPoint 截获，几何判定不受覆盖影响
	const el = window.document.elementFromPoint(aim.x, aim.y);
	const navFolderEl = el?.closest('[data-drive-nav-folder]') as HTMLElement | null | undefined;
	if (navFolderEl != null) {
		const key = navFolderEl.dataset.driveNavFolder ?? null;
		// 已在根目录时根目录不是有效目标
		if (key != null && !(key === 'root' && folder.value == null)) {
			navKey = key;
		}
	}
	if (navKey == null) {
		const main = mainEl.value;
		if (main != null) {
			for (const folderEl of main.querySelectorAll('[data-drive-folder]')) {
				const r = folderEl.getBoundingClientRect();
				if (aim.x >= r.left && aim.x <= r.right && aim.y >= r.top && aim.y <= r.bottom) {
					const id = (folderEl as HTMLElement).dataset.driveFolder ?? null;
					const targetFolder = foldersPaginator.items.value.find(f => f.id === id);
					// AI 生图专用文件夹禁止移入
					if (id != null && targetFolder != null && targetFolder.systemType !== 'agentGeneratedImages') {
						folderId = id;
					}
					break;
				}
			}
		}
	}

	if (m.hoverFolderId !== folderId || m.hoverNavKey !== navKey) {
		m.hoverFolderId = folderId;
		m.hoverNavKey = navKey;
		touchDragHoverFolderId.value = folderId;
		touchDragHoverNavKey.value = navKey;
	}
}

function startTouchDragAutoScroll(m: MarqueeState) {
	if (m.rafId != null) return;
	const step = () => {
		const mm = marquee;
		if (mm == null || !mm.touchDrag) return;
		const aim = getTouchDragAim(mm);
		const delta = edgeScrollDelta(aim.y, mm.scrollParent);
		if (delta !== 0) {
			applyEdgeScroll(mm.scrollParent, delta);
			updateTouchDrag(mm);
		}
		mm.rafId = requestAnimationFrame(step);
	};
	m.rafId = requestAnimationFrame(step);
}

function moveSelectedFilesTo(targetFolderId: string | null) {
	const filesToMove = [...selectedFiles.value];
	if (filesToMove.length === 0) return;
	misskeyApi('drive/files/move-bulk', {
		fileIds: filesToMove.map(f => f.id),
		folderId: targetFolderId,
	}).then(() => {
		const targetFolder = targetFolderId == null ? null : (foldersPaginator.items.value.find(f => f.id === targetFolderId) ?? null);
		globalEvents.emit('driveFilesUpdated', filesToMove.map(x => ({
			...x,
			folderId: targetFolderId,
			folder: targetFolder,
		})));
		void fetchDriveStats();
	}).catch(err => {
		if (isProtectedAgentImageFolderError(err)) {
			showProtectedAgentImageFolderError('move');
			return;
		}
		os.alert({
			type: 'error',
			text: i18n.ts.somethingHappened,
		});
	});
}
//#endregion

// 原生 HTML5 拖拽（文件/文件夹移动、外部文件拖入）期间靠近边缘时自动滚动。
// 文件夹等子元素的 dragover 带 stopPropagation，main 收不到，故从 window 捕获阶段统一记录；
// 同时存在多个 MkDrive 实例（如选择对话框叠在网盘页上）时，只响应指针正悬停的那个实例。
function onWindowDragover(ev: DragEvent) {
	const main = mainEl.value;
	if (main == null) return;
	const topEl = window.document.elementFromPoint(ev.clientX, ev.clientY);
	if (topEl == null || !main.contains(topEl)) return;
	nativeDragPointer = { x: ev.clientX, y: ev.clientY, time: Date.now() };
	ensureNativeDragAutoScroll();
}

function ensureNativeDragAutoScroll() {
	if (nativeDragRafId != null) return;
	nativeDragScrollParent = getMainScrollParent();
	const step = () => {
		const info = nativeDragPointer;
		// dragover 停止触发（拖出窗口、放下、结束）后自动停止
		if (info == null || Date.now() - info.time > 500) {
			nativeDragRafId = null;
			return;
		}
		const delta = edgeScrollDelta(info.y, nativeDragScrollParent);
		if (delta !== 0) applyEdgeScroll(nativeDragScrollParent, delta);
		nativeDragRafId = requestAnimationFrame(step);
	};
	nativeDragRafId = requestAnimationFrame(step);
}

function onMarqueePointerUp(ev: PointerEvent) {
	const m = marquee;
	if (m == null || ev.pointerId !== m.pointerId) return;

	if (m.touchDrag) {
		const folderId = m.hoverFolderId;
		const navKey = m.hoverNavKey;
		endMarquee();
		if (folderId != null) {
			moveSelectedFilesTo(folderId);
		} else if (navKey != null) {
			moveSelectedFilesTo(navKey === 'root' ? null : navKey);
		}
		suppressNextClick();
		return;
	}

	const wasActive = m.active;
	endMarquee();
	// 从文件上起拖的框选结束时，吞掉随后可能派发在该文件上的 click，避免误切换选中
	if (wasActive) suppressNextClick();
}

function onMarqueePointerCancel(ev: PointerEvent) {
	const m = marquee;
	if (m == null || ev.pointerId !== m.pointerId) return;
	// 浏览器接管了手势（如纵向滚动）：回滚到起拖前的选择
	if (m.active) selectedFiles.value = m.baseFiles;
	endMarquee();
}

function cancelMarquee() {
	const m = marquee;
	if (m == null) return;
	if (m.active) selectedFiles.value = m.baseFiles;
	endMarquee();
}

function endMarquee() {
	const m = marquee;
	if (m == null) return;
	if (m.longPressTimer != null) window.clearTimeout(m.longPressTimer);
	if (m.rafId != null) cancelAnimationFrame(m.rafId);
	marquee = null;
	marqueeRect.value = null;
	touchDragGhost.value = null;
	touchDragHoverFolderId.value = null;
	touchDragHoverNavKey.value = null;
	window.removeEventListener('pointermove', onMarqueePointerMove);
	window.removeEventListener('pointerup', onMarqueePointerUp);
	window.removeEventListener('pointercancel', onMarqueePointerCancel);
	window.removeEventListener('touchmove', onMarqueeTouchMove);
}

function onContextmenuCapture(ev: Event) {
	// 触屏长按已激活框选/拖拽移动时，拦截浏览器长按菜单
	if (marquee != null && (marquee.active || marquee.touchDrag)) {
		ev.stopPropagation();
		ev.preventDefault();
	}
}

function suppressNextClick() {
	let timer: number | null = null;
	const handler = (ev: MouseEvent) => {
		ev.stopPropagation();
		ev.preventDefault();
		window.removeEventListener('click', handler, true);
		if (timer != null) window.clearTimeout(timer);
	};
	timer = window.setTimeout(() => {
		window.removeEventListener('click', handler, true);
	}, 350);
	window.addEventListener('click', handler, { capture: true });
}
//#endregion

useGlobalEvent('driveFileCreated', (file) => {
	if (file.folderId === (folder.value?.id ?? null)) {
		filesPaginator.prepend(file);
	}
	void fetchDriveStats();
});

useGlobalEvent('driveFilesUpdated', (files) => {
	for (const f of files) {
		if (filesPaginator.items.value.some(x => x.id === f.id)) {
			if (f.folderId === (folder.value?.id ?? null)) {
				filesPaginator.updateItem(f.id, () => f);
			} else {
				filesPaginator.removeItem(f.id);
			}
		} else {
			if (f.folderId === (folder.value?.id ?? null)) {
				filesPaginator.prepend(f);
			}
		}
	}

	// 移出当前文件夹的文件自动取消选中，避免对不可见文件继续执行批量操作
	const movedOutIds = new Set(files.filter(f => f.folderId !== (folder.value?.id ?? null)).map(f => f.id));
	if (movedOutIds.size > 0 && selectedFiles.value.some(f => movedOutIds.has(f.id))) {
		selectedFiles.value = selectedFiles.value.filter(f => !movedOutIds.has(f.id));
	}
});

useGlobalEvent('driveFilesDeleted', (files) => {
	for (const f of files) {
		filesPaginator.removeItem(f.id);
	}
	void fetchDriveStats();
});

useGlobalEvent('driveFoldersUpdated', (folders) => {
	for (const f of folders) {
		if (foldersPaginator.items.value.some(x => x.id === f.id)) {
			if (f.parentId === (folder.value?.id ?? null)) {
				foldersPaginator.updateItem(f.id, () => f);
			} else {
				foldersPaginator.removeItem(f.id);
			}
		} else {
			if (f.parentId === (folder.value?.id ?? null)) {
				foldersPaginator.prepend(f);
			}
		}
	}
});

useGlobalEvent('driveFoldersDeleted', (folders) => {
	for (const f of folders) {
		foldersPaginator.removeItem(f.id);
	}
});

let connection: Misskey.IChannelConnection<Misskey.Channels['drive']> | null = null;

onMounted(() => {
	window.addEventListener('dragover', onWindowDragover, true);

	if (store.s.realtimeMode) {
		connection = useStream().useChannel('drive');
		connection.on('fileCreated', onStreamDriveFileCreated);
	}

	if (props.initialFolder) {
		cd(props.initialFolder);
	} else {
		initialize();
	}
});

onActivated(() => {
});

onBeforeUnmount(() => {
	endMarquee();
	window.removeEventListener('dragover', onWindowDragover, true);
	if (nativeDragRafId != null) cancelAnimationFrame(nativeDragRafId);
	if (nativeDragImageEl != null) nativeDragImageEl.remove();
	if (connection != null) {
		connection.dispose();
	}
});
</script>

<style lang="scss" module>
.transition_files_move,
.transition_files_enterActive,
.transition_files_leaveActive {
	transition: all 0.2s ease;
}
.transition_files_enterFrom,
.transition_files_leaveTo {
	opacity: 0;
}
.transition_files_leaveActive {
	position: absolute;
}

.nav {
	display: flex;
	width: 100%;
	padding: 0 8px;
	box-sizing: border-box;
	overflow: auto;
	font-size: 0.9em;
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.75);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	border-bottom: solid 0.5px var(--MI_THEME-divider);
}

.navPath {
	display: inline-block;
	vertical-align: bottom;
	line-height: 42px;
	white-space: nowrap;
}

.navPathItem {
	display: inline-block;
	margin: 0;
	padding: 0 8px;
	line-height: 42px;
	cursor: pointer;

	&:hover {
		text-decoration: underline;
	}

	&.navCurrent {
		font-weight: bold;
		cursor: default;

		&:hover {
			text-decoration: none;
		}
	}

	&.navSeparator {
		margin: 0;
		padding: 0;
		opacity: 0.5;
		cursor: default;
	}
}

.navMenu {
	margin-left: auto;
	padding: 0 12px;
}

.main {
	min-height: 100cqh;
	user-select: none;
	-webkit-touch-callout: none;

	&.fetching {
		cursor: wait !important;
		opacity: 0.5;
		pointer-events: none;
	}
}

.tipContainer:not(:empty) {
	padding: 16px 32px;
}

.usageGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
	gap: 10px;
	margin: 8px 32px 12px;
}

.usage {
	padding: 10px 12px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 10px;
	background: var(--MI_THEME-panel);
	font-size: 0.86em;
}

.usageHeader {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	font-weight: 700;
	line-height: 1.2;
}

.usageBar {
	overflow: hidden;
	height: 7px;
	margin: 7px 0;
	border-radius: 999px;
	background: color(from var(--MI_THEME-fg) srgb r g b / 0.12);
}

.usageBarValue {
	height: 100%;
	max-width: 100%;
	border-radius: inherit;
	background: var(--MI_THEME-accent);
	transition: width 0.2s ease;
}

.usageText {
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.45;
}

.folders,
.files {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
	grid-gap: 12px;
	padding: 16px 32px;
}

@container (max-width: 600px) {
	.tipContainer:not(:empty) {
		padding: 16px;
	}

	.usageGrid {
		margin: 8px 16px 12px;
		grid-template-columns: 1fr;
	}

	.folders,
	.files {
		padding: 16px;
	}
}

.date {
	padding: 8px 16px;
	font-size: 90%;
	-webkit-backdrop-filter: var(--MI-blur, blur(8px));
	backdrop-filter: var(--MI-blur, blur(8px));
	background-color: color(from var(--MI_THEME-bg) srgb r g b / 0.85);
}

.loadMore {
	margin: 16px auto;
}

.footer {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 16px;
	font-size: 90%;
	-webkit-backdrop-filter: var(--MI-blur, blur(8px));
	backdrop-filter: var(--MI-blur, blur(8px));
	background-color: color(from var(--MI_THEME-bg) srgb r g b / 0.85);
}

.empty {
	padding: 16px;
	text-align: center;
	pointer-events: none;
	opacity: 0.5;
}

.dropzone {
	position: absolute;
	left: 0;
	top: 38px;
	width: 100%;
	height: calc(100% - 38px);
	border: dashed 2px var(--MI_THEME-focus);
	pointer-events: none;
}

.marquee {
	position: fixed;
	border: 1px solid var(--MI_THEME-accent);
	border-radius: 2px;
	background: color(from var(--MI_THEME-accent) srgb r g b / 0.15);
	pointer-events: none;
}

.touchDragGhost {
	position: fixed;
	transform: translate(-50%, -50%);
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 8px 14px;
	border-radius: 999px;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-size: 13px;
	font-weight: 700;
	white-space: nowrap;
	pointer-events: none;
	box-shadow: 0 4px 16px rgba(#000, 0.25);
}
</style>
