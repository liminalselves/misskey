<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInfo>{{ i18n.ts._fileViewer.thisPageCanBeSeenFromTheAuthor }}</MkInfo>
	<MkLoading v-if="fetching"/>
	<div v-else-if="file" class="_gaps">
		<div :class="$style.filePreviewRoot">
			<div v-if="file.isAgentImageBlocked" :class="$style.blockedPreview">
				<i class="ti ti-ban"></i>
				<strong>图片已封禁</strong>
				<span>该 AI 生成图片已被审核封禁，无法预览或下载。</span>
			</div>
			<MkMediaList v-else :mediaList="[file]"></MkMediaList>
		</div>
		<div :class="$style.fileQuickActionsRoot">
			<button class="_button" :class="$style.fileNameEditBtn" @click="rename()">
				<h2 class="_nowrap" :class="$style.fileName">{{ file.name }}</h2>
				<i class="ti ti-pencil" :class="$style.fileNameEditIcon"></i>
			</button>
			<div :class="$style.fileQuickActionsOthers">
				<button v-if="!file.isAgentImageBlocked" v-tooltip="i18n.ts.createNoteFromTheFile" class="_button" :class="$style.fileQuickActionsOthersButton" @click="postThis()">
					<i class="ti ti-pencil"></i>
				</button>
				<button v-if="file.isSensitive" v-tooltip="i18n.ts.unmarkAsSensitive" class="_button" :class="$style.fileQuickActionsOthersButton" @click="toggleSensitive()">
					<i class="ti ti-eye"></i>
				</button>
				<button v-else v-tooltip="i18n.ts.markAsSensitive" class="_button" :class="$style.fileQuickActionsOthersButton" @click="toggleSensitive()">
					<i class="ti ti-eye-exclamation"></i>
				</button>
				<button v-if="!file.isAgentImageBlocked" v-tooltip="i18n.ts.download" class="_button" :class="$style.fileQuickActionsOthersButton" @click="downloadFile()">
					<i class="ti ti-download"></i>
				</button>
				<button v-tooltip="i18n.ts.delete" class="_button" :class="[$style.fileQuickActionsOthersButton, $style.danger]" @click="deleteFile()">
					<i class="ti ti-trash"></i>
				</button>
			</div>
		</div>
		<div class="_gaps_s">
			<button class="_button" :class="$style.kvEditBtn" @click="move()">
				<MkKeyValue>
					<template #key>{{ i18n.ts.folder }}</template>
					<template #value>{{ folderHierarchy.join(' > ') }}<i class="ti ti-pencil" :class="$style.kvEditIcon"></i></template>
				</MkKeyValue>
			</button>
			<button class="_button" :class="$style.kvEditBtn" @click="describe()">
				<MkKeyValue :class="$style.multiline">
					<template #key>{{ i18n.ts.description }}</template>
					<template #value>{{ file.comment ? file.comment : `(${i18n.ts.none})` }}<i class="ti ti-pencil" :class="$style.kvEditIcon"></i></template>
				</MkKeyValue>
			</button>
			<MkKeyValue :class="$style.fileMetaDataChildren">
				<template #key>{{ i18n.ts._fileViewer.uploadedAt }}</template>
				<template #value><MkTime :time="file.createdAt" mode="detail"/></template>
			</MkKeyValue>
			<MkKeyValue :class="$style.fileMetaDataChildren">
				<template #key>{{ i18n.ts._fileViewer.type }}</template>
				<template #value>{{ file.type }}</template>
			</MkKeyValue>
			<MkKeyValue :class="$style.fileMetaDataChildren">
				<template #key>{{ i18n.ts._fileViewer.size }}</template>
				<template #value>{{ bytes(file.size) }}</template>
			</MkKeyValue>
			<MkKeyValue v-if="!file.isAgentImageBlocked" :class="$style.fileMetaDataChildren" :copy="file.url">
				<template #key>URL</template>
				<template #value>{{ file.url }}</template>
			</MkKeyValue>
			<MkKeyValue v-else :class="$style.fileMetaDataChildren">
				<template #key>状态</template>
				<template #value>已封禁</template>
			</MkKeyValue>
		</div>
	</div>
	<MkResult v-else type="empty"/>
</div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted } from 'vue';
import * as Misskey from 'misskey-js';
import MkInfo from '@/components/MkInfo.vue';
import MkMediaList from '@/components/MkMediaList.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import bytes from '@/filters/bytes.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { useRouter } from '@/router.js';
import { selectDriveFolder } from '@/utility/drive.js';
import { globalEvents } from '@/events.js';

const router = useRouter();

const props = defineProps<{
	fileId: string;
}>();

const fetching = ref(true);
const file = ref<Misskey.entities.DriveFile>();
const folderHierarchy = computed(() => {
	if (!file.value) return [i18n.ts.drive];
	const folderNames = [i18n.ts.drive];

	function get(folder: Misskey.entities.DriveFolder) {
		if (folder.parent) get(folder.parent);
		folderNames.push(folder.name);
	}

	if (file.value.folder) get(file.value.folder);
	return folderNames;
});
const isImage = computed(() => file.value?.type.startsWith('image/'));

async function _fetch_() {
	fetching.value = true;

	file.value = await misskeyApi('drive/files/show', {
		fileId: props.fileId,
	}).catch((err) => {
		console.error(err);
		return undefined;
	});

	fetching.value = false;
}

function postThis() {
	if (file.value == null) return;

	os.post({
		initialFiles: [file.value],
	});
}

async function downloadFile() {
	if (file.value == null || file.value.isAgentImageBlocked) return;

	try {
		const result = await (misskeyApi as unknown as (
			endpoint: 'drive/files/download-url',
			data: { fileId: string },
		) => Promise<{ url: string }>)('drive/files/download-url', {
			fileId: file.value.id,
		});
		const a = window.document.createElement('a');
		a.href = result.url;
		a.download = file.value.name || 'download';
		a.style.display = 'none';
		window.document.body.appendChild(a);
		a.click();
		a.remove();
	} catch (error) {
		os.alert({ type: 'error', text: formatApiError(error) });
	}
}

function move() {
	if (file.value == null) return;

	const f = file.value;

	selectDriveFolder(null).then(({ canceled, folders }) => {
		if (canceled) return;
		misskeyApi('drive/files/update', {
			fileId: f.id,
			folderId: folders[0] ? folders[0].id : null,
		}).then(async () => {
			await _fetch_();
		});
	});
}

function toggleSensitive() {
	if (file.value == null) return;

	os.apiWithDialog('drive/files/update', {
		fileId: file.value.id,
		isSensitive: !file.value.isSensitive,
	}).then(async () => {
		await _fetch_();
	}).catch(err => {
		os.alert({
			type: 'error',
			title: i18n.ts.error,
			text: err.message,
		});
	});
}

function rename() {
	if (file.value == null) return;

	const f = file.value;

	os.inputText({
		title: i18n.ts.renameFile,
		placeholder: i18n.ts.inputNewFileName,
		default: file.value.name,
	}).then(({ canceled, result: name }) => {
		if (canceled) return;
		os.apiWithDialog('drive/files/update', {
			fileId: f.id,
			name: name,
		}).then(async () => {
			await _fetch_();
		});
	});
}

async function describe() {
	if (file.value == null) return;

	const f = file.value;

	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkFileCaptionEditWindow.vue').then(x => x.default), {
		default: file.value.comment ?? '',
		file: file.value,
	}, {
		done: caption => {
			os.apiWithDialog('drive/files/update', {
				fileId: f.id,
				comment: caption.length === 0 ? null : caption,
			}).then(async () => {
				await _fetch_();
			});
		},
		closed: () => dispose(),
	});
}

async function deleteFile() {
	if (file.value == null) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.driveFileDeleteConfirm({ name: file.value.name }),
	});
	if (canceled) return;

	await os.apiWithDialog('drive/files/delete', {
		fileId: file.value.id,
	});

	globalEvents.emit('driveFilesDeleted', [file.value]);

	router.push('/my/drive');
}

onMounted(async () => {
	await _fetch_();
});
</script>

<style lang="scss" module>

.filePreviewRoot {
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
	// MkMediaList 内の上部マージン 4px
	padding: calc(1rem - 4px) 1rem 1rem;
}

.blockedPreview {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 8px;
	min-height: 220px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	color: var(--MI_THEME-error);
	text-align: center;

	> i {
		font-size: 40px;
	}

	> span {
		color: var(--MI_THEME-fgTransparentWeak);
	}
}

.fileQuickActionsRoot {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

@container (min-width: 500px) {
	.fileQuickActionsRoot {
		flex-direction: row;
		align-items: center;
	}
}

.fileQuickActionsOthers {
	margin-left: auto;
	margin-right: 1rem;
	display: flex;
	gap: 8px;

	.fileQuickActionsOthersButton {
		padding: .5rem;
		border-radius: 99rem;

		&:hover,
		&:focus-visible {
			background-color: var(--MI_THEME-accentedBg);
			color: var(--MI_THEME-accent);
			text-decoration: none;
			outline: none;
		}

		&.danger {
			color: #ff2a2a;
		}

		&.danger:hover,
		&.danger:focus-visible {
			background-color: rgba(255, 42, 42, .15);
		}
	}
}

.fileNameEditBtn {
	padding: .5rem 1rem;
	display: flex;
	align-items: center;
	min-width: 0;
	font-weight: 700;
	border-radius: var(--MI-radius);
	font-size: .8rem;

	>.fileNameEditIcon {
		color: transparent;
		visibility: hidden;
		padding-left: .5rem;
	}

	>.fileName {
		margin: 0;
	}

	&:hover {
		background-color: var(--MI_THEME-accentedBg);

		>.fileName,
		>.fileNameEditIcon {
			visibility: visible;
			color: var(--MI_THEME-accent);
		}
	}
}

.fileMetaDataChildren {
	padding: .5rem 1rem;
}

.multiline {
	white-space: pre-wrap;
}

.kvEditBtn {
	text-align: start;
	display: block;
	width: 100%;
	padding: .5rem 1rem;
	border-radius: var(--MI-radius);

	.kvEditIcon {
		display: inline-block;
		color: transparent;
		visibility: hidden;
		padding-left: .5rem;
	}

	&:hover {
		color: var(--MI_THEME-accent);
		background-color: var(--MI_THEME-accentedBg);

		.kvEditIcon {
			color: var(--MI_THEME-accent);
			visibility: visible;
		}
	}
}
</style>
