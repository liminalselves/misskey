<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<nav :class="$style.path" aria-label="网盘路径">
		<button type="button" class="_button" :class="[$style.pathItem, folder == null ? $style.pathItemCurrent : null]" @click="openFolder(null)">
			<i class="ti ti-cloud"></i> {{ i18n.ts.drive }}
		</button>
		<template v-for="f in ancestors" :key="f.id">
			<i class="ti ti-chevron-right" :class="$style.pathSep"></i>
			<button type="button" class="_button" :class="[$style.pathItem, folder?.id === f.id ? $style.pathItemCurrent : null]" @click="openFolder(f.id)">{{ f.name }}</button>
		</template>
	</nav>

	<MkLoading v-if="foldersLoading && folders.length === 0"/>
	<MkResult v-else-if="foldersError != null && folders.length === 0" type="error" :text="foldersError">
		<MkButton rounded @click="loadFolders"><i class="ti ti-refresh"></i> 重试</MkButton>
	</MkResult>
	<div v-else-if="folders.length > 0" :class="$style.folders">
		<button v-for="f in folders" :key="f.id" type="button" class="_button" :class="$style.folder" :title="f.name" @click="openFolder(f.id)">
			<i class="ti ti-folder" :class="$style.folderIcon"></i>
			<span :class="$style.folderName">{{ f.name }}</span>
			<span :class="$style.folderMeta">
				<template v-if="f.systemType === 'agentGeneratedImages'"><i class="ti ti-lock"></i> AI 生图 · </template>{{ folderCountText(f) }}
			</span>
		</button>
	</div>
	<MkInfo v-if="folders.length >= FOLDER_LIMIT">仅显示按名称排序的前 {{ FOLDER_LIMIT }} 个文件夹。</MkInfo>

	<MkFileListForAdmin :paginator="filesPaginator" viewMode="grid"/>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import MkFileListForAdmin from '@/components/MkFileListForAdmin.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkResult from '@/components/global/MkResult.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { Paginator } from '@/utility/paginator.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	userId: string;
}>();

type FolderWithDetail = Misskey.entities.DriveFolder & { parent?: FolderWithDetail | null };

// 与后端 admin/drive/folders 的 limit 上限一致
const FOLDER_LIMIT = 100;
const folder = ref<FolderWithDetail | null>(null);
const folders = ref<FolderWithDetail[]>([]);
const foldersLoading = ref(false);
const foldersError = ref<string | null>(null);
let foldersSeq = 0;

// 当前文件夹的祖先链（含自身），由服务端 detail 打包的 parent 链展开
const ancestors = computed(() => {
	const chain: FolderWithDetail[] = [];
	for (let f: FolderWithDetail | null | undefined = folder.value; f != null; f = f.parent) chain.unshift(f);
	return chain;
});

const currentFolderId = ref<string | null>(null);

const filesPaginator = markRaw(new Paginator('admin/drive/files', {
	limit: 20,
	computedParams: computed(() => ({
		userId: props.userId,
		folderId: currentFolderId.value,
	}) as Misskey.Endpoints['admin/drive/files']['req']),
}));

function folderCountText(f: FolderWithDetail): string {
	const parts: string[] = [];
	if ((f.foldersCount ?? 0) > 0) parts.push(`${f.foldersCount} 个文件夹`);
	parts.push(`${f.filesCount ?? 0} 个文件`);
	return parts.join(' · ');
}

async function loadFolders() {
	const seq = ++foldersSeq;
	foldersLoading.value = true;
	foldersError.value = null;
	try {
		const res = await (misskeyApi as unknown as (ep: string, data: Record<string, unknown>) => Promise<{ folder: FolderWithDetail | null; folders: FolderWithDetail[] }>)(
			'admin/drive/folders', { userId: props.userId, folderId: currentFolderId.value, limit: FOLDER_LIMIT },
		);
		if (seq !== foldersSeq) return;
		folder.value = res.folder;
		folders.value = res.folders;
	} catch (err) {
		if (seq !== foldersSeq) return;
		foldersError.value = formatApiError(err);
		folders.value = [];
	} finally {
		if (seq === foldersSeq) foldersLoading.value = false;
	}
}

function openFolder(id: string | null) {
	if (currentFolderId.value === id) return;
	currentFolderId.value = id;
	if (id == null) folder.value = null;
	folders.value = [];
}

watch([() => props.userId, currentFolderId], () => {
	void loadFolders();
}, { immediate: true });
</script>

<style lang="scss" module>
.path {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 4px;
	font-size: 0.9em;
}

.pathItem {
	padding: 4px 8px;
	border-radius: 6px;
	max-width: 220px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	opacity: 0.75;

	&:hover {
		opacity: 1;
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.pathItemCurrent {
	opacity: 1;
	font-weight: bold;
}

.pathSep {
	opacity: 0.4;
	font-size: 0.85em;
}

.folders {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
	gap: 8px;
}

.folder {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	grid-template-rows: auto auto;
	column-gap: 10px;
	align-items: center;
	padding: 10px 12px;
	border-radius: 10px;
	background: var(--MI_THEME-accentedBg);
	text-align: left;
	box-sizing: border-box;

	&:hover {
		outline: 1px solid var(--MI_THEME-accent);
	}
}

.folderIcon {
	grid-row: 1 / 3;
	font-size: 1.6em;
	color: var(--MI_THEME-accent);
}

.folderName {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: bold;
}

.folderMeta {
	min-width: 0;
	font-size: 0.78em;
	opacity: 0.7;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
