<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<!-- 群主设置区域 -->
	<template v-if="isOwner">
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
			<div :class="$style.infoRow">
				<span :class="$style.label">{{ i18n.ts.name }}</span>
				<span>{{ room.name }}</span>
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

function save() {
	os.apiWithDialog('chat/rooms/update', {
		roomId: props.room.id,
		name: name_.value,
		description: description_.value,
		isPublic: isPublic_.value,
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
.infoPanel {
	padding: 16px;
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
