<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div v-if="invitations.length > 0" class="_gaps_s">
		<MkFolder v-for="invitation in invitations" :key="invitation.id" :defaultOpen="true">
			<template #icon><i class="ti ti-users-group"></i></template>
			<template #label>{{ invitation.room.name }}</template>
			<template #suffix><MkTime :time="invitation.createdAt"/></template>
			<template #footer>
				<div class="_buttons">
					<MkButton primary @click="join(invitation)"><i class="ti ti-plus"></i> {{ i18n.ts._chat.join }}</MkButton>
					<MkButton danger @click="ignore(invitation)"><i class="ti ti-x"></i> {{ i18n.ts._chat.ignore }}</MkButton>
				</div>
			</template>

			<div :class="$style.invitationBody">
				<MkAvatar :user="invitation.room.owner" :class="$style.invitationBodyAvatar" link/>
				<div style="flex: 1;" class="_gaps_s">
					<MkUserName :user="invitation.room.owner"/>
					<hr>
					<div>{{ invitation.room.description === '' ? i18n.ts.noDescription : invitation.room.description }}</div>
				</div>
			</div>
		</MkFolder>
	</div>
	<MkLoading v-if="fetching"/>
	<MkResult v-else-if="fetchError" type="error">
		<MkButton primary rounded @click="fetchInvitations">{{ i18n.ts.retry }}</MkButton>
	</MkResult>
	<MkResult v-else-if="invitations.length == 0" type="empty" :text="i18n.ts._chat.noInvitations"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { formatApiError, misskeyApi } from '@/utility/misskey-api.js';
import { useRouter } from '@/router.js';
import MkFolder from '@/components/MkFolder.vue';
import * as os from '@/os.js';

const router = useRouter();

const fetching = ref(true);
const fetchError = ref(false);
const invitations = ref<Misskey.entities.ChatRoomInvitation[]>([]);

async function fetchInvitations() {
	fetching.value = true;
	fetchError.value = false;
	try {
		invitations.value = await misskeyApi('chat/rooms/invitations/inbox');
	} catch {
		// 加载失败必须复位 fetching，否则转圈永不结束；保留已有数据
		fetchError.value = true;
	} finally {
		fetching.value = false;
	}
}

async function join(invitation: Misskey.entities.ChatRoomInvitation) {
	try {
		await misskeyApi('chat/rooms/join', {
			roomId: invitation.room.id,
		});

		router.push('/chat/room/:roomId', {
			params: {
				roomId: invitation.room.id,
			},
		});
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}

async function ignore(invitation: Misskey.entities.ChatRoomInvitation) {
	try {
		await misskeyApi('chat/rooms/invitations/ignore', {
			roomId: invitation.room.id,
		});

		invitations.value = invitations.value.filter(i => i.id !== invitation.id);
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}

onMounted(() => {
	fetchInvitations();
});
</script>

<style lang="scss" module>
.invitationBody {
	display: flex;
	align-items: center;
}

.invitationBodyAvatar {
	margin-right: 12px;
	width: 45px;
	height: 45px;
}
</style>
