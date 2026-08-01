<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<!-- 群主设置区域 -->
	<template v-if="isOwner">
		<div :class="$style.iconEditor">
			<img v-if="iconUrl_" :src="iconUrl_" :class="$style.iconPreview"/>
			<div v-else :class="[$style.iconPreview, $style.iconPlaceholder]"><i class="ti ti-users"></i></div>
			<div class="_buttons">
				<MkButton rounded inline @click="changeIcon"><i class="ti ti-pencil"></i> {{ i18n.ts._profile.changeAvatar }}</MkButton>
				<MkButton v-if="iconUrl_" rounded inline danger @click="removeIcon"><i class="ti ti-trash"></i> {{ i18n.ts.remove }}</MkButton>
			</div>
		</div>

		<MkInput v-model="name_">
			<template #label>{{ i18n.ts.name }}</template>
		</MkInput>

		<MkTextarea v-model="description_">
			<template #label>{{ i18n.ts.description }}</template>
		</MkTextarea>

		<MkSwitch v-model="isPublic_">
			<template #label>{{ i18n.ts.public }}</template>
			<template #caption>公开后，其他用户可以搜索并加入此群组</template>
		</MkSwitch>

		<MkButton primary @click="save">{{ i18n.ts.save }}</MkButton>
	</template>

	<!-- 非群主只显示信息 -->
	<template v-else>
		<div class="_panel" :class="$style.infoPanel">
			<div :class="$style.infoIconRow">
				<img v-if="roomIconUrl" :src="roomIconUrl" :class="$style.infoIcon"/>
				<div v-else :class="[$style.infoIcon, $style.iconPlaceholder]"><i class="ti ti-users"></i></div>
				<span :class="$style.infoRoomName">{{ room.name }}</span>
			</div>
			<div v-if="room.description" :class="$style.infoRow">
				<span :class="$style.label">{{ i18n.ts.description }}</span>
				<span>{{ room.description }}</span>
			</div>
			<div :class="$style.infoRow">
				<span :class="$style.label">群主</span>
				<MkA :to="userPage(room.owner)">
					<MkAvatar :user="room.owner" :class="$style.avatar"/>
					<MkUserName :user="room.owner"/>
				</MkA>
			</div>
		</div>
	</template>

	<MkSwitch v-model="isMuted">
		<template #label>{{ i18n.ts._chat.muteThisRoom }}</template>
	</MkSwitch>

	<!-- 只有群主可以删除群聊，其他成员只能选择退出群聊 -->
	<MkButton v-if="isOwner" danger @click="del">{{ i18n.ts._chat.deleteRoom }}</MkButton>
	<MkButton v-else danger @click="leave">{{ i18n.ts._chat.leave }}</MkButton>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { ensureSignin } from '@/i.js';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import { useRouter } from '@/router.js';
import { userPage } from '@/filters/user.js';
import MkUserName from '@/components/global/MkUserName.vue';
import { chooseDriveFile } from '@/utility/drive.js';

const router = useRouter();
const $i = ensureSignin();

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const isOwner = computed(() => {
	return props.room.ownerId === $i.id;
});

const name_ = ref(props.room.name);
const description_ = ref(props.room.description);
const isPublic_ = ref((props.room as any).isPublic ?? false);
const iconUrl_ = ref<string | null>((props.room as any).iconUrl ?? null);
const roomIconUrl = computed<string | null>(() => (props.room as any).iconUrl ?? null);

function changeIcon(ev: PointerEvent) {
	os.popupMenu([{
		text: i18n.ts.icon,
		type: 'label',
	}, {
		text: i18n.ts.upload,
		icon: 'ti ti-upload',
		action: async () => {
			const files = await os.chooseFileFromPc({ multiple: false });
			const file = files[0];

			let originalOrCropped = file;

			const { canceled } = await os.confirm({
				type: 'question',
				text: i18n.ts.cropImageAsk,
				okText: i18n.ts.cropYes,
				cancelText: i18n.ts.cropNo,
			});

			if (!canceled) {
				originalOrCropped = await os.cropImageFile(file, {
					aspectRatio: 1,
				});
			}

			const driveFile = (await os.launchUploader([originalOrCropped], { multiple: false }))[0];
			await saveIcon(driveFile.url);
		},
	}, {
		text: i18n.ts.fromDrive,
		icon: 'ti ti-cloud',
		action: async () => {
			const files = await chooseDriveFile({ multiple: false });
			await saveIcon(files[0].url);
		},
	}], ev.currentTarget ?? ev.target);
}

async function removeIcon() {
	await saveIcon(null);
}

async function saveIcon(iconUrl: string | null) {
	await os.apiWithDialog('chat/rooms/update', {
		roomId: props.room.id,
		name: name_.value,
		description: description_.value,
		isPublic: isPublic_.value,
		iconUrl,
	} as any);
	iconUrl_.value = iconUrl;
}

function save() {
	os.apiWithDialog('chat/rooms/update', {
		roomId: props.room.id,
		name: name_.value,
		description: description_.value,
		isPublic: isPublic_.value,
		iconUrl: iconUrl_.value,
	} as any);
}

async function del() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.deleteAreYouSure({ x: name_.value }),
	});
	if (canceled) return;

	await os.apiWithDialog('chat/rooms/delete', {
		roomId: props.room.id,
	});
	router.push('/chat');
}

async function leave() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	});
	if (canceled) return;

	await os.apiWithDialog('chat/rooms/leave', {
		roomId: props.room.id,
	});
	router.push('/chat');
}

const isMuted = ref(props.room.isMuted ?? false);

watch(isMuted, async () => {
	await os.apiWithDialog('chat/rooms/mute', {
		roomId: props.room.id,
		mute: isMuted.value,
	});
});
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

.infoRoomName {
	font-size: 1.1em;
	font-weight: bold;
}

.infoRow {
	display: flex;
	gap: 8px;
	padding: 8px 0;

	&:not(:last-child) {
		border-bottom: 1px solid var(--divider);
	}
}

.label {
	color: var(--fgTransparentWeak);
	min-width: 80px;
}

.avatar {
	width: 24px;
	height: 24px;
	margin-right: 4px;
}
</style>
