<!--
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="[]" :tabs="[]" showBack>
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<div class="_gaps">
			<MkInfo v-if="$i.policies.chatAvailability !== 'available'" warn>
				{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}
			</MkInfo>

			<MkInput
				v-model="searchQuery"
				:placeholder="i18n.ts._chat.searchRoomPlaceholder"
				type="search"
				@enter="search"
			>
				<template #prefix><i class="ti ti-search"></i></template>
			</MkInput>

			<MkButton primary rounded :disabled="searchQuery.trim() === ''" :wait="searching" @click="search">{{ i18n.ts.search }}</MkButton>

			<MkLoading v-if="searching"/>
			<MkResult v-else-if="loadError" type="error">
				<MkButton primary rounded @click="search">{{ i18n.ts._chat.retry }}</MkButton>
			</MkResult>
			<MkFoldableSection v-else-if="searched">
				<template #header>{{ i18n.ts.searchResult }}</template>

				<div v-if="searchResults.length > 0" class="_gaps_s">
					<div v-for="room in searchResults" :key="room.id" class="_panel" :class="$style.room">
						<img v-if="room.iconUrl" :src="room.iconUrl" :alt="room.name" :class="$style.roomIcon"/>
						<MkAvatar v-else :user="room.owner" :class="$style.avatar"/>
						<div :class="$style.info">
							<div :class="$style.nameRow">
								<span :class="$style.name">{{ room.name }}</span>
								<span v-if="room.isMember" :class="[$style.badge, $style.joinedBadge]">{{ i18n.ts._chat.joinedBadge }}</span>
								<span v-if="room.isArchived" :class="[$style.badge, $style.archivedBadge]">{{ i18n.ts._chat.archivedBadge }}</span>
							</div>
							<div v-if="room.description" :class="$style.description">{{ room.description }}</div>
							<div :class="$style.meta">
								<span v-if="room.memberCount != null">{{ i18n.tsx._chat.memberCount({ count: room.memberCount }) }}</span>
								<span v-if="room.owner"><MkUserName :user="room.owner"/></span>
							</div>
						</div>
						<MkButton v-if="room.isMember" primary rounded :class="$style.actionBtn" @click="openRoom(room)">{{ i18n.ts._chat.openRoom }}</MkButton>
						<MkButton v-else primary rounded :disabled="!canJoin" :wait="joiningRoomId === room.id" :class="$style.actionBtn" @click="join(room)">{{ i18n.ts._chat.join }}</MkButton>
					</div>

					<MkButton v-if="hasMore" rounded :wait="loadingMore" :class="$style.loadMore" @click="loadMore">{{ i18n.ts._chat.loadMore }}</MkButton>
				</div>
				<MkResult v-else type="notFound"/>
			</MkFoldableSection>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkInput from '@/components/MkInput.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import * as os from '@/os.js';
import { chatApiWithDialog, formatChatError } from '@/utility/chat-error.js';
import { useRouter } from '@/router.js';
import { definePage } from '@/page.js';
import { ensureSignin } from '@/i.js';

const LIMIT = 30;

const $i = ensureSignin();
const router = useRouter();

const searchQuery = ref('');
const activeQuery = ref('');
const searched = ref(false);
const searching = ref(false);
const loadingMore = ref(false);
const loadError = ref(false);
const hasMore = ref(false);
const joiningRoomId = ref<string | null>(null);
const searchResults = ref<Misskey.entities.ChatRoom[]>([]);
let searchSeq = 0;

const canJoin = computed(() => $i.policies.chatAvailability === 'available');

async function search() {
	const q = searchQuery.value.trim();
	if (q === '') {
		searched.value = false;
		searchResults.value = [];
		hasMore.value = false;
		loadError.value = false;
		return;
	}

	const seq = ++searchSeq;
	activeQuery.value = q;
	searching.value = true;
	loadError.value = false;
	try {
		const res = await misskeyApi('chat/rooms/search', {
			query: q,
			limit: LIMIT,
		});
		if (seq !== searchSeq) return;
		searchResults.value = res;
		hasMore.value = res.length === LIMIT;
		searched.value = true;
	} catch {
		if (seq !== searchSeq) return;
		loadError.value = true;
	} finally {
		if (seq === searchSeq) {
			searching.value = false;
		}
	}
}

async function loadMore() {
	if (loadingMore.value || !hasMore.value || searchResults.value.length === 0) return;
	const seq = searchSeq;
	loadingMore.value = true;
	try {
		const res = await misskeyApi('chat/rooms/search', {
			query: activeQuery.value,
			limit: LIMIT,
			untilId: searchResults.value[searchResults.value.length - 1].id,
		});
		if (seq !== searchSeq) return;
		searchResults.value.push(...res);
		hasMore.value = res.length === LIMIT;
	} catch (err) {
		os.alert({ type: 'error', text: formatChatError(err) });
	} finally {
		loadingMore.value = false;
	}
}

function openRoom(room: Misskey.entities.ChatRoom) {
	router.push('/chat/room/:roomId', {
		params: { roomId: room.id },
	});
}

async function join(room: Misskey.entities.ChatRoom) {
	if (!canJoin.value || joiningRoomId.value != null) return;
	joiningRoomId.value = room.id;
	try {
		await chatApiWithDialog('chat/rooms/join', {
			roomId: room.id,
		});
		router.push('/chat/room/:roomId', {
			params: { roomId: room.id },
		});
	} catch {
		// apiWithDialog 已弹出错误提示
	} finally {
		joiningRoomId.value = null;
	}
}

definePage(() => ({
	title: i18n.ts._chat.searchRoom,
	icon: 'ti ti-search',
}));
</script>

<style lang="scss" module>
.room {
	display: flex;
	align-items: center;
	padding: 16px;
	gap: 12px;
}

.roomIcon {
	width: 42px;
	height: 42px;
	border-radius: 50%;
	object-fit: cover;
	flex-shrink: 0;
}

.avatar {
	width: 42px;
	height: 42px;
	flex-shrink: 0;
}

.info {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.nameRow {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
}

.name {
	font-weight: bold;
}

.badge {
	font-size: 0.75em;
	padding: 1px 6px;
	border-radius: 999px;
}

.joinedBadge {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
}

.archivedBadge {
	color: var(--MI_THEME-infoWarnFg);
	background: var(--MI_THEME-infoWarnBg);
}

.description {
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparentWeak);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.meta {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 0.8em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.actionBtn {
	flex-shrink: 0;
}

.loadMore {
	margin: 8px auto 0;
}
</style>
