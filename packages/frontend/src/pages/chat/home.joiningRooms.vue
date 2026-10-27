<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div v-if="memberships.length > 0" class="_gaps_s">
		<XRoom v-for="membership in memberships" :key="membership.id" :room="membership.room!"/>
	</div>
	<MkLoading v-if="fetching"/>
	<MkResult v-else-if="fetchError" type="error">
		<MkButton primary rounded @click="fetchRooms">{{ i18n.ts.retry }}</MkButton>
	</MkResult>
	<MkResult v-else-if="memberships.length == 0" type="empty" :text="i18n.ts._chat.noRooms"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XRoom from './XRoom.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const fetching = ref(true);
const fetchError = ref(false);
const memberships = ref<Misskey.entities.ChatRoomMembership[]>([]);

async function fetchRooms() {
	fetching.value = true;
	fetchError.value = false;
	try {
		memberships.value = await misskeyApi('chat/rooms/joining');
	} catch {
		// 加载失败必须复位 fetching，否则转圈永不结束；保留已有数据
		fetchError.value = true;
	} finally {
		fetching.value = false;
	}
}

onMounted(() => {
	fetchRooms();
});
</script>

<style lang="scss" module>

</style>
