<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div v-if="invitations.length > 0" class="_gaps_s">
		<MkFolder v-for="invitation in invitations" :key="invitation.id" :defaultOpen="true">
			<template #icon>
				<img v-if="invitation.room.iconUrl" :src="invitation.room.iconUrl" :class="$style.roomIcon" alt="">
				<i v-else class="ti ti-users-group"></i>
			</template>
			<template #label>{{ invitation.room.name }}</template>
			<template #suffix><MkTime :time="invitation.createdAt"/></template>
			<template #footer>
				<div class="_buttons">
					<MkButton v-if="$i.policies.chatAvailability === 'available'" primary :disabled="Boolean(processingIds[invitation.id])" @click="join(invitation)"><i class="ti ti-plus"></i> {{ i18n.ts._chat.join }}</MkButton>
					<MkButton danger :disabled="Boolean(processingIds[invitation.id])" @click="ignore(invitation)"><i class="ti ti-x"></i> {{ i18n.ts._chat.ignore }}</MkButton>
				</div>
			</template>

			<div :class="$style.invitationBody">
				<img v-if="invitation.room.iconUrl" :src="invitation.room.iconUrl" :class="[$style.invitationBodyAvatar, $style.invitationRoomAvatar]" alt="">
				<MkAvatar v-else :user="invitation.room.owner" :class="$style.invitationBodyAvatar" link/>
				<div style="flex: 1; min-width: 0;" class="_gaps_s">
					<div :class="$style.metaRow">
						<MkUserName :user="invitation.room.owner"/>
						<span v-if="invitation.room.memberCount != null" :class="$style.badge">
							<i class="ti ti-users"></i> {{ i18n.tsx._chat.memberCount({ count: invitation.room.memberCount }) }}
						</span>
						<span v-if="invitation.room.isPublic" :class="$style.badge">{{ i18n.ts._chat.publicBadge }}</span>
					</div>
					<hr>
					<div>{{ invitation.room.description === '' ? i18n.ts.noDescription : invitation.room.description }}</div>
				</div>
			</div>
		</MkFolder>
		<div v-if="hasMore" :class="$style.loadMore">
			<MkButton v-appear="prefer.s.enableInfiniteScroll && !loadingMore ? loadMore : null" small rounded :disabled="loadingMore" @click="loadMore">
				<i class="ti ti-chevron-down"></i> {{ loadingMore ? i18n.ts.loading : i18n.ts.loadMore }}
			</MkButton>
		</div>
	</div>
	<MkLoading v-if="fetching"/>
	<MkResult v-else-if="fetchError && invitations.length === 0" type="error">
		<MkButton primary rounded @click="fetchInvitations">{{ i18n.ts.retry }}</MkButton>
	</MkResult>
	<MkResult v-else-if="invitations.length == 0" type="empty" :text="i18n.ts._chat.noInvitations"/>
</div>
</template>

<script lang="ts" setup>
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { appendCursorPage, mergeCursorTopPage, takeCursorFirstPage } from '@/utility/cursor-page.js';
import { useRouter } from '@/router.js';
import MkFolder from '@/components/MkFolder.vue';
import * as os from '@/os.js';
import { markRoomInvitationHandled } from '@/utility/chat-invitation-status.js';
import { formatChatError } from '@/utility/chat-error.js';
import { ensureSignin } from '@/i.js';
import { prefer } from '@/preferences.js';
import { useStream } from '@/stream.js';

const emit = defineEmits<{
	(ev: 'updateCount', count: number): void;
}>();

const $i = ensureSignin();
const router = useRouter();

const PAGE_SIZE = 30;

const fetching = ref(false);
const loadingMore = ref(false);
const fetchError = ref(false);
const hasMore = ref(false);
const invitations = ref<Misskey.entities.ChatRoomInvitation[]>([]);
const processingIds = ref<Record<string, boolean>>({});

let hasBeenDeactivated = false;
let mainChannel: { dispose: () => void } | null = null;

async function fetchInvitations() {
	if (fetching.value) return;
	fetching.value = true;
	fetchError.value = false;
	try {
		const rows = await misskeyApi('chat/rooms/invitations/inbox', {
			limit: PAGE_SIZE + 1,
		});
		const page = takeCursorFirstPage(rows, PAGE_SIZE);
		invitations.value = page.items;
		hasMore.value = page.hasMore;
		emit('updateCount', invitations.value.length);
	} catch {
		// 加载失败必须复位 fetching，否则转圈永不结束；保留已有数据
		fetchError.value = true;
	} finally {
		fetching.value = false;
	}
}

async function refreshInvitationsTop() {
	if (fetching.value || loadingMore.value) return;
	try {
		const rows = await misskeyApi('chat/rooms/invitations/inbox', {
			limit: PAGE_SIZE + 1,
		});
		const page = invitations.value.length > PAGE_SIZE && rows.length > PAGE_SIZE
			? mergeCursorTopPage(invitations.value, rows, PAGE_SIZE, hasMore.value)
			: takeCursorFirstPage(rows, PAGE_SIZE);
		invitations.value = page.items;
		hasMore.value = page.hasMore;
		emit('updateCount', invitations.value.length);
	} catch {
		// 刷新失败保留已有数据
	}
}

async function loadMore() {
	if (fetching.value || loadingMore.value || !hasMore.value) return;
	const untilId = invitations.value.at(-1)?.id;
	if (!untilId) return;

	loadingMore.value = true;
	try {
		const rows = await misskeyApi('chat/rooms/invitations/inbox', {
			limit: PAGE_SIZE + 1,
			untilId,
		});
		const page = appendCursorPage(invitations.value, rows, PAGE_SIZE);
		invitations.value = page.items;
		hasMore.value = page.hasMore;
		emit('updateCount', invitations.value.length);
	} catch {
		// 翻页失败保留现有列表
	} finally {
		loadingMore.value = false;
	}
}

async function join(invitation: Misskey.entities.ChatRoomInvitation) {
	if (processingIds.value[invitation.id]) return;
	processingIds.value[invitation.id] = true;
	try {
		await misskeyApi('chat/rooms/join', {
			roomId: invitation.room.id,
		});

		markRoomInvitationHandled(invitation.room.id, 'accepted');
		invitations.value = invitations.value.filter(i => i.id !== invitation.id);
		emit('updateCount', invitations.value.length);

		router.push('/chat/room/:roomId', {
			params: {
				roomId: invitation.room.id,
			},
		});
	} catch (e) {
		os.alert({ type: 'error', text: formatChatError(e) });
	} finally {
		delete processingIds.value[invitation.id];
	}
}

async function ignore(invitation: Misskey.entities.ChatRoomInvitation) {
	if (processingIds.value[invitation.id]) return;
	processingIds.value[invitation.id] = true;
	try {
		await misskeyApi('chat/rooms/invitations/ignore', {
			roomId: invitation.room.id,
		});

		markRoomInvitationHandled(invitation.room.id, 'ignored');
		invitations.value = invitations.value.filter(i => i.id !== invitation.id);
		emit('updateCount', invitations.value.length);
	} catch (e) {
		os.alert({ type: 'error', text: formatChatError(e) });
	} finally {
		delete processingIds.value[invitation.id];
	}
}

onMounted(() => {
	void fetchInvitations();

	const channel = useStream().useChannel('main');
	mainChannel = channel;
	channel.on('notification', notification => {
		if (notification.type === 'chatRoomInvitationReceived') {
			void refreshInvitationsTop();
		}
	});
	(channel as any).on('chatRoomInvitationReceived', () => {
		void refreshInvitationsTop();
	});
});

onDeactivated(() => {
	hasBeenDeactivated = true;
});

onActivated(() => {
	if (!hasBeenDeactivated) return;
	void refreshInvitationsTop();
});

onBeforeUnmount(() => {
	mainChannel?.dispose();
	mainChannel = null;
});
</script>

<style lang="scss" module>
.roomIcon {
	width: 1.25em;
	height: 1.25em;
	border-radius: 50%;
	object-fit: cover;
}

.invitationBody {
	display: flex;
	align-items: center;
}

.invitationBodyAvatar {
	margin-right: 12px;
	width: 45px;
	height: 45px;
	flex-shrink: 0;
}

.invitationRoomAvatar {
	border-radius: 50%;
	object-fit: cover;
}

.metaRow {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.badge {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 8px;
	font-size: 0.8em;
	border-radius: 999px;
	background: var(--MI_THEME-panelHighlight);
	color: var(--MI_THEME-fg);
}

.loadMore {
	display: flex;
	justify-content: center;
}
</style>
