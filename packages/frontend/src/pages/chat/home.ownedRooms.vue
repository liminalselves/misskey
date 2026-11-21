<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div v-if="rooms.length > 0" class="_gaps_s">
		<XRoom v-for="room in rooms" :key="room.id" :room="room"/>
		<div v-if="hasMore" :class="$style.loadMore">
			<MkButton v-appear="prefer.s.enableInfiniteScroll && !loadingMore ? loadMore : null" small rounded :disabled="loadingMore" @click="loadMore">
				<i class="ti ti-chevron-down"></i> {{ loadingMore ? i18n.ts.loading : i18n.ts.loadMore }}
			</MkButton>
		</div>
	</div>
	<MkLoading v-if="fetching"/>
	<MkResult v-else-if="fetchError && rooms.length === 0" type="error">
		<MkButton primary rounded @click="fetchRooms">{{ i18n.ts.retry }}</MkButton>
	</MkResult>
	<MkResult v-else-if="rooms.length == 0" type="empty" :text="i18n.ts._chat.noRooms"/>
</div>
</template>

<script lang="ts" setup>
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XRoom from './XRoom.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { appendCursorPage, mergeCursorTopPage, takeCursorFirstPage } from '@/utility/cursor-page.js';
import { prefer } from '@/preferences.js';
import { useStream } from '@/stream.js';

const PAGE_SIZE = 30;

const fetching = ref(false);
const loadingMore = ref(false);
const fetchError = ref(false);
const hasMore = ref(false);
const rooms = ref<Misskey.entities.ChatRoom[]>([]);

let hasBeenDeactivated = false;
let mainChannel: { dispose: () => void } | null = null;

async function fetchRooms() {
	if (fetching.value) return;
	fetching.value = true;
	fetchError.value = false;
	try {
		const rows = await misskeyApi('chat/rooms/owned', {
			limit: PAGE_SIZE + 1,
		});
		const page = takeCursorFirstPage(rows, PAGE_SIZE);
		rooms.value = page.items;
		hasMore.value = page.hasMore;
	} catch {
		// 加载失败必须复位 fetching，否则转圈永不结束；保留已有数据
		fetchError.value = true;
	} finally {
		fetching.value = false;
	}
}

async function refreshRoomsTop() {
	if (fetching.value || loadingMore.value) return;
	try {
		const rows = await misskeyApi('chat/rooms/owned', {
			limit: PAGE_SIZE + 1,
		});
		const page = mergeCursorTopPage(rooms.value, rows, PAGE_SIZE, hasMore.value);
		rooms.value = page.items;
		hasMore.value = page.hasMore;
	} catch {
		// 刷新失败保留已有数据
	}
}

async function loadMore() {
	if (fetching.value || loadingMore.value || !hasMore.value) return;
	const untilId = rooms.value.at(-1)?.id;
	if (!untilId) return;

	loadingMore.value = true;
	try {
		const rows = await misskeyApi('chat/rooms/owned', {
			limit: PAGE_SIZE + 1,
			untilId,
		});
		const page = appendCursorPage(rooms.value, rows, PAGE_SIZE);
		rooms.value = page.items;
		hasMore.value = page.hasMore;
	} catch {
		// 翻页失败保留现有列表
	} finally {
		loadingMore.value = false;
	}
}

onMounted(() => {
	void fetchRooms();

	const channel = useStream().useChannel('main');
	mainChannel = channel;
	channel.on('newChatMessage', message => {
		if ('toRoomId' in message && message.toRoomId != null) {
			void refreshRoomsTop();
		}
	});
	channel.on('chatRead', () => {
		void refreshRoomsTop();
	});
});

onDeactivated(() => {
	hasBeenDeactivated = true;
});

onActivated(() => {
	if (!hasBeenDeactivated) return;
	void refreshRoomsTop();
});

onBeforeUnmount(() => {
	mainChannel?.dispose();
	mainChannel = null;
});
</script>

<style lang="scss" module>
.loadMore {
	display: flex;
	justify-content: center;
}
</style>
