<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInfo>{{ i18n.ts._fileViewer.thisPageCanBeSeenFromTheAuthor }}</MkInfo>

	<MkPagination :paginator="paginator">
		<template #default="{ items }">
			<XMessage v-for="item in items" :key="item.id" :message="item" :isSearchResult="true" @navigate="navigateToMessage(item, $event)"/>
		</template>
	</MkPagination>
</div>
</template>

<script lang="ts" setup>
import { computed, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import XMessage from './chat/XMessage.vue';
import { i18n } from '@/i18n.js';
import MkInfo from '@/components/MkInfo.vue';
import { Paginator } from '@/utility/paginator.js';
import MkPagination from '@/components/MkPagination.vue';
import { useRouter } from '@/router.js';
import { $i } from '@/i.js';

const props = defineProps<{
	fileId: string;
}>();

const router = useRouter();
const realFileId = computed(() => props.fileId);

function navigateToMessage(message: Misskey.entities.ChatMessage, messageId: string) {
	if ('toRoomId' in message && message.toRoomId != null) {
		router.pushByPath(`/chat/room/${message.toRoomId}?messageId=${messageId}`);
	} else if ($i && 'fromUserId' in message && message.fromUserId !== $i.id) {
		router.pushByPath(`/chat/user/${message.fromUserId}?messageId=${messageId}`);
	} else if ('toUserId' in message && message.toUserId != null) {
		router.pushByPath(`/chat/user/${message.toUserId}?messageId=${messageId}`);
	}
}

const paginator = markRaw(new Paginator('drive/files/attached-chat-messages', {
	limit: 10,
	params: {
		fileId: realFileId.value,
	},
}));
</script>
