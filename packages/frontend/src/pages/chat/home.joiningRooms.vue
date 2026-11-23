<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div v-if="visibleMemberships.length > 0" class="_gaps_s">
		<XRoom v-for="membership in visibleMemberships" :key="membership.id" :room="membership.room!"/>
		<div v-if="hasMore" :class="$style.loadMore">
			<MkButton v-appear="prefer.s.enableInfiniteScroll && !loadingMore ? loadMore : null" small rounded :disabled="loadingMore" @click="loadMore">
				<i class="ti ti-chevron-down"></i> {{ loadingMore ? i18n.ts.loading : i18n.ts.loadMore }}
			</MkButton>
		</div>
	</div>
	<MkLoading v-if="fetching"/>
	<MkResult v-else-if="fetchError && visibleMemberships.length === 0" type="error">
		<MkButton primary rounded @click="fetchRooms">{{ i18n.ts.retry }}</MkButton>
	</MkResult>
	<MkResult v-else-if="visibleMemberships.length == 0" type="empty" :text="i18n.ts._chat.noRooms"/>
</div>
</template>

<script lang="ts" setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XRoom from './XRoom.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { appendCursorPage, mergeCursorTopPage, takeCursorFirstPage } from '@/utility/cursor-page.js';
import { ensureSignin } from '@/i.js';
import { prefer } from '@/preferences.js';
import { useStream } from '@/stream.js';

const $i = ensureSignin();

const PAGE_SIZE = 30;

const fetching = ref(false);
const loadingMore = ref(false);
const fetchError = ref(false);
const hasMore = ref(false);
const memberships = ref<Misskey.entities.ChatRoomMembership[]>([]);

// 过滤掉自己作为群主但因免打扰产生的冗余成员记录，避免与「创建的群组」重复
const visibleMemberships = computed(() =>
	memberships.value.filter(m => m.room != null && m.room.ownerId !== $i.id),
);

let hasBeenDeactivated = false;
let mainChannel: { dispose: () => void } | null = null;

async function fetchRooms() {
	if (fetching.value) return;
	fetching.value = true;
	fetchError.value = false;
	try {
		const rows = await misskeyApi('chat/rooms/joining', {
			limit: PAGE_SIZE + 1,
		});
		const page = takeCursorFirstPage(rows, PAGE_SIZE);
		memberships.value = page.items;
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
		const rows = await misskeyApi('chat/rooms/joining', {
			limit: PAGE_SIZE + 1,
		});
		const page = memberships.value.length > PAGE_SIZE && rows.length > PAGE_SIZE
			? mergeCursorTopPage(memberships.value, rows, PAGE_SIZE, hasMore.value)
			: takeCursorFirstPage(rows, PAGE_SIZE);
		memberships.value = page.items;
		hasMore.value = page.hasMore;
	} catch {
		// 刷新失败保留已有数据
	}
}

async function loadMore() {
	if (fetching.value || loadingMore.value || !hasMore.value) return;
	const untilId = memberships.value.at(-1)?.id;
	if (!untilId) return;

	loadingMore.value = true;
	try {
		const rows = await misskeyApi('chat/rooms/joining', {
			limit: PAGE_SIZE + 1,
			untilId,
		});
		const page = appendCursorPage(memberships.value, rows, PAGE_SIZE);
		memberships.value = page.items;
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
	channel.on('notification', notification => {
		if (notification.type === 'chatRoomKicked') {
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
