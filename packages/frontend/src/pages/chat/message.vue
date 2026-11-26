<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader showBack>
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<div v-if="initializing">
			<MkLoading/>
		</div>
		<MkResult v-else-if="loadError || message == null" type="error">
			<MkButton primary rounded @click="initialize">{{ i18n.ts.retry }}</MkButton>
		</MkResult>
		<div v-else>
			<XMessage :message="message" :roomOwnerId="message.toRoom?.ownerId" :isSearchResult="true" @navigate="onNavigate"/>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import XMessage from './XMessage.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { ensureSignin } from '@/i.js';

const $i = ensureSignin();
const router = useRouter();

const props = defineProps<{
	messageId: string;
}>();

const initializing = ref(true);
const loadError = ref(false);
const message = ref<Misskey.entities.ChatMessage | null>();

async function initialize() {
	initializing.value = true;
	loadError.value = false;
	try {
		message.value = await misskeyApi('chat/messages/show', {
			messageId: props.messageId,
		});
	} catch {
		// 加载失败必须复位 initializing，否则转圈永不结束
		loadError.value = true;
	} finally {
		initializing.value = false;
	}
}

function onNavigate(messageId: string) {
	if (message.value == null) return;
	if (message.value.toRoomId != null) {
		router.push('/chat/room/:roomId', {
			params: { roomId: message.value.toRoomId },
			query: { messageId },
		});
		return;
	}
	const peerId = message.value.fromUserId === $i.id ? message.value.toUserId : message.value.fromUserId;
	if (peerId != null) {
		router.push('/chat/user/:userId', {
			params: { userId: peerId },
			query: { messageId },
		});
	}
}

watch(() => props.messageId, () => {
	void initialize();
});

onMounted(() => {
	void initialize();
});

definePage(computed(() => ({
	title: message.value?.toRoom?.name ?? i18n.ts.directMessage,
})));
</script>
