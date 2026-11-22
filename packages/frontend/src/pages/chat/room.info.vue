<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<!-- 群主与管理员设置区域 -->
	<template v-if="canEditSettings">
		<div :class="$style.iconEditor">
			<img v-if="iconUrl_" :src="iconUrl_" :alt="room.name" :class="$style.iconPreview"/>
			<div v-else :class="[$style.iconPreview, $style.iconPlaceholder]"><i class="ti ti-users"></i></div>
			<div class="_buttons">
				<MkButton rounded inline :disabled="savingIcon" @click="changeIcon"><i class="ti ti-pencil"></i> {{ i18n.ts._profile.changeAvatar }}</MkButton>
				<MkButton v-if="iconUrl_" rounded inline danger :disabled="savingIcon" @click="removeIcon"><i class="ti ti-trash"></i> {{ i18n.ts.remove }}</MkButton>
			</div>
		</div>

		<MkInput v-model="name_" :disabled="saving">
			<template #label>{{ i18n.ts.name }}</template>
		</MkInput>

		<MkTextarea v-model="description_" :disabled="saving">
			<template #label>{{ i18n.ts.description }}</template>
		</MkTextarea>

		<MkTextarea v-model="announcement_" :disabled="saving" :placeholder="i18n.ts._chat.announcementPlaceholder">
			<template #label>{{ i18n.ts._chat.announcement }}</template>
		</MkTextarea>

		<MkSwitch v-model="allowMemberInvite_" :disabled="saving">
			<template #label>{{ i18n.ts._chat.allowMemberInvite }}</template>
			<template #caption>{{ i18n.ts._chat.allowMemberInviteHint }}</template>
		</MkSwitch>

		<template v-if="isOwner">
			<MkSwitch v-model="isPublic_" :disabled="saving">
				<template #label>{{ i18n.ts.public }}</template>
				<template #caption>{{ i18n.ts._chat.publicRoomHint }}</template>
			</MkSwitch>

			<MkSwitch v-model="isArchived_" :disabled="saving">
				<template #label>{{ i18n.ts._chat.archiveRoom }}</template>
				<template #caption>{{ i18n.ts._chat.archivedBanner }}</template>
			</MkSwitch>
		</template>

		<MkButton primary :wait="saving" @click="save">{{ i18n.ts.save }}</MkButton>
	</template>

	<!-- 普通成员只显示信息 -->
	<template v-else>
		<div class="_panel" :class="$style.infoPanel">
			<div :class="$style.infoIconRow">
				<img v-if="roomIconUrl" :src="roomIconUrl" :alt="room.name" :class="$style.infoIcon"/>
				<div v-else :class="[$style.infoIcon, $style.iconPlaceholder]"><i class="ti ti-users"></i></div>
				<div :class="$style.infoTitleWrap">
					<span :class="$style.infoRoomName">{{ room.name }}</span>
					<span v-if="room.memberCount != null" :class="$style.infoMemberCount">{{ i18n.tsx._chat.memberCount({ count: room.memberCount }) }}</span>
				</div>
			</div>
			<div v-if="room.announcement" :class="$style.infoRow">
				<span :class="$style.label">{{ i18n.ts._chat.announcement }}</span>
				<span :class="$style.preText">{{ room.announcement }}</span>
			</div>
			<div v-if="room.description" :class="$style.infoRow">
				<span :class="$style.label">{{ i18n.ts.description }}</span>
				<span :class="$style.preText">{{ room.description }}</span>
			</div>
			<div :class="$style.infoRow">
				<span :class="$style.label">{{ i18n.ts._chat.owner }}</span>
				<MkA :to="userPage(room.owner)" :class="$style.ownerLink">
					<MkAvatar :user="room.owner" :class="$style.avatar"/>
					<MkUserName :user="room.owner"/>
				</MkA>
			</div>
		</div>
	</template>

	<MkSwitch :modelValue="isMuted" :disabled="muting" @update:modelValue="onToggleMute">
		<template #label>{{ i18n.ts._chat.muteThisRoom }}</template>
	</MkSwitch>

	<!-- 只有群主可以删除群组，其他成员只能选择退出群组 -->
	<MkButton v-if="isOwner" danger :wait="deleting" @click="del">{{ i18n.ts._chat.deleteRoom }}</MkButton>
	<MkButton v-else danger :wait="leaving" @click="leave">{{ i18n.ts._chat.leave }}</MkButton>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { chatApiWithDialog } from '@/utility/chat-error.js';
import { ensureSignin } from '@/i.js';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import { useRouter } from '@/router.js';
import { userPage } from '@/filters/user.js';
import MkUserName from '@/components/global/MkUserName.vue';
import { misskeyApi } from '@/utility/misskey-api.js';

const router = useRouter();
const $i = ensureSignin();

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const emit = defineEmits<{
	(ev: 'updated', room: Misskey.entities.ChatRoom): void;
}>();

const isOwner = computed(() => {
	return props.room.ownerId === $i.id || props.room.myRole === 'owner';
});

const isAdmin = computed(() => props.room.myRole === 'admin');
const canEditSettings = computed(() => isOwner.value || isAdmin.value);

const name_ = ref(props.room.name);
const description_ = ref(props.room.description);
const announcement_ = ref(props.room.announcement ?? '');
const allowMemberInvite_ = ref(props.room.allowMemberInvite ?? false);
const isPublic_ = ref(props.room.isPublic ?? false);
const isArchived_ = ref(props.room.isArchived ?? false);
const iconUrl_ = ref<string | null>(props.room.iconUrl ?? null);
const isMuted = ref(props.room.isMuted ?? false);
const saving = ref(false);
const savingIcon = ref(false);
const muting = ref(false);
const deleting = ref(false);
const leaving = ref(false);

const roomIconUrl = computed<string | null>(() => props.room.iconUrl ?? null);

watch(() => props.room, (nextRoom) => {
	name_.value = nextRoom.name;
	description_.value = nextRoom.description;
	announcement_.value = nextRoom.announcement ?? '';
	allowMemberInvite_.value = nextRoom.allowMemberInvite ?? false;
	isPublic_.value = nextRoom.isPublic ?? false;
	isArchived_.value = nextRoom.isArchived ?? false;
	iconUrl_.value = nextRoom.iconUrl ?? null;
	isMuted.value = nextRoom.isMuted ?? false;
}, { deep: true });

function pickImageFileFromPc(): Promise<File | null> {
	return new Promise((resolve) => {
		const input = window.document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		let settled = false;
		const finish = (selected: File | null) => {
			if (settled) return;
			settled = true;
			window.removeEventListener('focus', onWindowFocus);
			(window as unknown as { __misskey_input_ref__?: HTMLInputElement | null }).__misskey_input_ref__ = null;
			resolve(selected);
		};
		const onWindowFocus = () => {
			window.setTimeout(() => {
				if (!settled && (!input.files || input.files.length === 0)) {
					finish(null);
				}
			}, 300);
		};
		input.onchange = () => {
			const f = input.files?.[0] ?? null;
			finish(f);
		};
		input.addEventListener('cancel', () => finish(null), { once: true });
		window.addEventListener('focus', onWindowFocus, { once: true });
		(window as unknown as { __misskey_input_ref__?: HTMLInputElement | null }).__misskey_input_ref__ = input;
		input.click();
	});
}

function cropImageOrCancel(file: File): Promise<File | null> {
	return new Promise((resolve) => {
		let settled = false;
		let disposeFn: (() => void) | null = null;
		const finish = (cropped: File | null) => {
			if (settled) return;
			settled = true;
			resolve(cropped);
		};
		os.popupAsyncWithDialog(import('@/components/MkCropperDialog.vue').then(x => x.default), {
			imageFile: file,
			aspectRatio: 1,
		}, {
			ok: (x: File | Blob) => {
				finish(x instanceof File ? x : new File([x], file.name, { type: x.type }));
			},
			cancel: () => finish(null),
			closed: () => {
				disposeFn?.();
				finish(null);
			},
		}).then(d => {
			disposeFn = d.dispose;
		}).catch(() => finish(null));
	});
}

function uploadSingleFileOrCancel(file: File): Promise<Misskey.entities.DriveFile | null> {
	return new Promise((resolve) => {
		let settled = false;
		let disposeFn: (() => void) | null = null;
		const finish = (driveFile: Misskey.entities.DriveFile | null) => {
			if (settled) return;
			settled = true;
			resolve(driveFile);
		};
		os.popupAsyncWithDialog(import('@/components/MkUploaderDialog.vue').then(x => x.default), {
			files: [file],
			multiple: false,
		}, {
			done: (driveFiles: Misskey.entities.DriveFile[]) => {
				finish(driveFiles[0] ?? null);
			},
			canceled: () => finish(null),
			closed: () => {
				disposeFn?.();
				finish(null);
			},
		}).then(d => {
			disposeFn = d.dispose;
		}).catch(() => finish(null));
	});
}

function chooseImageFromDrive(): Promise<Misskey.entities.DriveFile | null> {
	return new Promise((resolve) => {
		let settled = false;
		let disposeFn: (() => void) | null = null;
		const finish = (driveFile: Misskey.entities.DriveFile | null) => {
			if (settled) return;
			settled = true;
			resolve(driveFile);
		};
		os.popupAsyncWithDialog(import('@/components/MkDriveFileSelectDialog.vue').then(x => x.default), {
			multiple: false,
		}, {
			done: (files?: Misskey.entities.DriveFile[]) => {
				finish(files?.[0] ?? null);
			},
			closed: () => {
				disposeFn?.();
				finish(null);
			},
		}).then(d => {
			disposeFn = d.dispose;
		}).catch(() => finish(null));
	});
}

function changeIcon(ev: PointerEvent) {
	os.popupMenu([{
		text: i18n.ts.icon,
		type: 'label',
	}, {
		text: i18n.ts.upload,
		icon: 'ti ti-upload',
		action: async () => {
			const file = await pickImageFileFromPc();
			if (file == null) return;
			if (!file.type.startsWith('image/')) {
				await os.alert({ type: 'error', text: i18n.ts.fileNotSelected });
				return;
			}

			let originalOrCropped: File = file;

			const { canceled } = await os.confirm({
				type: 'question',
				text: i18n.ts.cropImageAsk,
				okText: i18n.ts.cropYes,
				cancelText: i18n.ts.cropNo,
			});

			if (!canceled) {
				const cropped = await cropImageOrCancel(file);
				if (cropped == null) return;
				originalOrCropped = cropped;
			}

			const driveFile = await uploadSingleFileOrCancel(originalOrCropped);
			if (driveFile == null) return;
			await saveIcon(driveFile.url);
		},
	}, {
		text: i18n.ts.fromDrive,
		icon: 'ti ti-cloud',
		action: async () => {
			const selected = await chooseImageFromDrive();
			if (selected == null) return;
			if (!selected.type.startsWith('image/')) {
				await os.alert({ type: 'error', text: i18n.ts._agents.imageMessageImagesOnly });
				return;
			}
			await saveIcon(selected.url);
		},
	}], ev.currentTarget ?? ev.target);
}

async function removeIcon() {
	await saveIcon(null);
}

async function saveIcon(iconUrl: string | null) {
	if (savingIcon.value) return;
	savingIcon.value = true;
	try {
		const updated = await chatApiWithDialog<Misskey.entities.ChatRoom>(
			'chat/rooms/update',
			{
				roomId: props.room.id,
				iconUrl,
			},
		);
		iconUrl_.value = updated?.iconUrl ?? iconUrl;
		if (updated) {
			emit('updated', updated);
		} else {
			emit('updated', { ...props.room, iconUrl });
		}
		os.toast(i18n.ts._chat.saved);
	} catch {
		// apiWithDialog 已显示错误提示
	} finally {
		savingIcon.value = false;
	}
}

async function save() {
	if (saving.value) return;
	const trimmedName = name_.value.trim();
	if (trimmedName === '') {
		await os.alert({ type: 'warning', text: i18n.ts._chat.roomNameRequired });
		return;
	}

	const payload: Record<string, unknown> = {
		roomId: props.room.id,
		name: trimmedName,
		description: description_.value,
		announcement: announcement_.value.trim() || null,
		allowMemberInvite: allowMemberInvite_.value,
	};
	if (isOwner.value) {
		payload.isPublic = isPublic_.value;
		payload.isArchived = isArchived_.value;
	}

	saving.value = true;
	try {
		const updated = await chatApiWithDialog<Misskey.entities.ChatRoom>(
			'chat/rooms/update',
			payload,
		);
		name_.value = trimmedName;
		if (updated) {
			emit('updated', updated);
		}
		os.toast(i18n.ts._chat.saved);
	} catch {
		// apiWithDialog 已显示错误提示
	} finally {
		saving.value = false;
	}
}

async function del() {
	if (deleting.value) return;
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.deleteAreYouSure({ x: props.room.name }),
	});
	if (canceled) return;

	deleting.value = true;
	try {
		await chatApiWithDialog('chat/rooms/delete', {
			roomId: props.room.id,
		});
		router.push('/chat');
	} catch {
		// apiWithDialog 已显示错误提示
	} finally {
		deleting.value = false;
	}
}

async function leave() {
	if (leaving.value) return;
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	});
	if (canceled) return;

	leaving.value = true;
	try {
		await chatApiWithDialog('chat/rooms/leave', {
			roomId: props.room.id,
		});
		router.push('/chat');
	} catch {
		// apiWithDialog 已显示错误提示
	} finally {
		leaving.value = false;
	}
}

async function onToggleMute(nextValue: boolean) {
	if (muting.value) return;
	const prev = isMuted.value;
	isMuted.value = nextValue;
	muting.value = true;
	try {
		await chatApiWithDialog('chat/rooms/mute', {
			roomId: props.room.id,
			mute: nextValue,
		});
		emit('updated', { ...props.room, isMuted: nextValue });
	} catch {
		isMuted.value = prev;
	} finally {
		muting.value = false;
	}
}
</script>

<style lang="scss" module>
.iconEditor {
	display: flex;
	align-items: center;
	gap: 16px;
}

.iconPreview {
	width: 64px;
	height: 64px;
	border-radius: 50%;
	object-fit: cover;
	flex-shrink: 0;
}

.iconPlaceholder {
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 28px;
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
}

.infoPanel {
	padding: 16px;
}

.infoIconRow {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 4px 0 12px 0;
	margin-bottom: 4px;
	border-bottom: 1px solid var(--MI_THEME-divider);
}

.infoIcon {
	width: 48px;
	height: 48px;
	border-radius: 50%;
	object-fit: cover;
	flex-shrink: 0;
}

.infoTitleWrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.infoRoomName {
	font-size: 1.1em;
	font-weight: bold;
}

.infoMemberCount {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.infoRow {
	display: flex;
	gap: 8px;
	padding: 8px 0;

	&:not(:last-child) {
		border-bottom: 1px solid var(--MI_THEME-divider);
	}
}

.label {
	color: var(--MI_THEME-fgTransparentWeak);
	min-width: 80px;
	flex-shrink: 0;
}

.preText {
	white-space: pre-wrap;
	word-break: break-word;
}

.ownerLink {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}

.avatar {
	width: 24px;
	height: 24px;
}
</style>
