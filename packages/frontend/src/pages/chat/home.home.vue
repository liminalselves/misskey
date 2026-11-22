<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div v-if="$i.policies.chatAvailability === 'available'" :class="$style.actionsRow">
		<MkButton primary gradate rounded :class="$style.start" @click="start"><i class="ti ti-plus"></i> {{ i18n.ts.startChat }}</MkButton>
	</div>

	<template v-else>
		<MkInfo>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>
		<div v-if="$i.policies.chatAvailability === 'readonly'" :class="$style.actionsRow">
			<MkButton rounded :class="$style.start" @click="router.push('/chat/search')"><i class="ti ti-search"></i> {{ i18n.ts._chat.searchRoom }}</MkButton>
		</div>
	</template>

	<MkAd :preferForms="['horizontal', 'horizontal-big']"/>

	<MkInput
		v-model="searchQuery"
		:placeholder="i18n.ts._chat.searchMessages"
		type="search"
		@enter="search"
	>
		<template #prefix><i class="ti ti-search"></i></template>
	</MkInput>

	<MkButton v-if="searchQuery.trim().length > 0" primary rounded :disabled="searching" @click="search">{{ i18n.ts.search }}</MkButton>

	<MkFoldableSection v-if="searched">
		<template #header>{{ i18n.ts.searchResult }}</template>

		<MkLoading v-if="searching"/>
		<MkResult v-else-if="searchError" type="error">
			<MkButton primary rounded @click="search">{{ i18n.ts.retry }}</MkButton>
		</MkResult>
		<div v-else-if="searchResults.length > 0" class="_gaps_s">
			<div v-for="message in searchResults" :key="message.id" :class="$style.searchResultItem">
				<XMessage :message="message" :isSearchResult="true" @navigate="navigateToMessage(message, $event)"/>
			</div>
			<div v-if="hasMoreSearchResults" :class="$style.loadMore">
				<MkButton small rounded :disabled="loadingMoreSearch" @click="loadMoreSearchResults">
					<i class="ti ti-chevron-down"></i> {{ loadingMoreSearch ? i18n.ts.loading : i18n.ts.loadMore }}
				</MkButton>
			</div>
		</div>
		<MkResult v-else type="notFound"/>
	</MkFoldableSection>

	<MkFoldableSection>
		<template #header>{{ i18n.ts._chat.history }}</template>

		<!-- 「全部」标签页：智能体会话与普通私信合并展示，未读行为一致 -->
		<MkChatHistories :includeAgentSessions="true"/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import XMessage from './XMessage.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { appendCursorPage, takeCursorFirstPage } from '@/utility/cursor-page.js';
import { ensureSignin } from '@/i.js';
import { useRouter } from '@/router.js';
import * as os from '@/os.js';
import { formatChatError } from '@/utility/chat-error.js';
import MkInput from '@/components/MkInput.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkChatHistories from '@/components/MkChatHistories.vue';

const $i = ensureSignin();

const router = useRouter();

const SEARCH_PAGE_SIZE = 20;

const searchQuery = ref('');
const searched = ref(false);
const searching = ref(false);
const loadingMoreSearch = ref(false);
const searchError = ref(false);
const hasMoreSearchResults = ref(false);
const searchResults = ref<Misskey.entities.ChatMessage[]>([]);
let activeSearchQuery = '';
let searchSeq = 0;

const searchMessagesApi = misskeyApi as unknown as (
	endpoint: 'chat/messages/search',
	data: { query: string; limit?: number; untilId?: string | null },
) => Promise<Misskey.entities.ChatMessage[]>;

const updateRoomApi = misskeyApi as unknown as (
	endpoint: 'chat/rooms/update',
	data: { roomId: string; allowMemberInvite?: boolean },
) => Promise<Misskey.entities.ChatRoom>;

watch(searchQuery, value => {
	if (value.trim() === '') {
		searchSeq++;
		searched.value = false;
		searching.value = false;
		searchError.value = false;
		hasMoreSearchResults.value = false;
		searchResults.value = [];
		activeSearchQuery = '';
	}
});

function start(ev: PointerEvent) {
	os.popupMenu([{
		text: i18n.ts._chat.individualChat,
		caption: i18n.ts._chat.individualChat_description,
		icon: 'ti ti-user',
		action: () => { void startUser(); },
	}, { type: 'divider' }, {
		type: 'parent',
		text: i18n.ts._chat.roomChat,
		caption: i18n.ts._chat.roomChat_description,
		icon: 'ti ti-users-group',
		children: [{
			text: i18n.ts._chat.createRoom,
			icon: 'ti ti-plus',
			action: () => { void createRoom(); },
		}, {
			text: i18n.ts.search,
			icon: 'ti ti-search',
			action: () => { router.push('/chat/search'); },
		}],
	}], ev.currentTarget ?? ev.target);
}

async function startUser() {
	// TODO: localOnly は連合に対応したら消す
	os.selectUser({ localOnly: true }).then(user => {
		router.push('/chat/user/:userId', {
			params: {
				userId: user.id,
			},
		});
	});
}

async function createRoom() {
	const { canceled, result } = await os.form(i18n.ts._chat.createRoom, {
		name: {
			type: 'string',
			label: i18n.ts.name,
			required: true,
		},
		description: {
			type: 'string',
			label: i18n.ts.description,
			multiline: true,
			required: false,
		},
		isPublic: {
			type: 'boolean',
			label: i18n.ts.public,
			description: i18n.ts._chat.publicRoomHint,
			default: false,
		},
		allowMemberInvite: {
			type: 'boolean',
			label: i18n.ts._chat.allowMemberInvite,
			description: i18n.ts._chat.allowMemberInviteHint,
			default: false,
		},
	});
	if (canceled || result == null) return;

	const trimmedName = (result.name ?? '').trim();
	if (!trimmedName) {
		await os.alert({ type: 'warning', text: i18n.ts._chat.roomNameRequired });
		return;
	}

	try {
		const room = await misskeyApi('chat/rooms/create', {
			name: trimmedName,
			description: (result.description ?? '').trim(),
			isPublic: Boolean(result.isPublic),
		});

		if (result.allowMemberInvite) {
			await updateRoomApi('chat/rooms/update', {
				roomId: room.id,
				allowMemberInvite: true,
			});
		}

		router.push('/chat/room/:roomId', {
			params: {
				roomId: room.id,
			},
		});
	} catch (err) {
		await os.alert({ type: 'error', text: formatChatError(err) });
	}
}

async function search() {
	const q = searchQuery.value.trim();
	if (!q) return;

	const seq = ++searchSeq;
	activeSearchQuery = q;
	searched.value = true;
	searching.value = true;
	searchError.value = false;

	try {
		const res = await searchMessagesApi('chat/messages/search', {
			query: q,
			limit: SEARCH_PAGE_SIZE + 1,
		});
		if (seq !== searchSeq) return;
		const page = takeCursorFirstPage(res, SEARCH_PAGE_SIZE);
		searchResults.value = page.items;
		hasMoreSearchResults.value = page.hasMore;
	} catch {
		if (seq !== searchSeq) return;
		searchResults.value = [];
		hasMoreSearchResults.value = false;
		searchError.value = true;
	} finally {
		if (seq === searchSeq) {
			searching.value = false;
		}
	}
}

async function loadMoreSearchResults() {
	if (searching.value || loadingMoreSearch.value || !hasMoreSearchResults.value || !activeSearchQuery) return;
	const untilId = searchResults.value.at(-1)?.id;
	if (!untilId) return;

	const seq = searchSeq;
	loadingMoreSearch.value = true;
	try {
		const res = await searchMessagesApi('chat/messages/search', {
			query: activeSearchQuery,
			limit: SEARCH_PAGE_SIZE + 1,
			untilId,
		});
		if (seq !== searchSeq) return;
		const page = appendCursorPage(searchResults.value, res, SEARCH_PAGE_SIZE);
		searchResults.value = page.items;
		hasMoreSearchResults.value = page.hasMore;
	} catch {
		// 翻页失败保留现有搜索结果
	} finally {
		loadingMoreSearch.value = false;
	}
}

// 点击搜索结果跳转到对应消息
function navigateToMessage(message: Misskey.entities.ChatMessage, messageId: string) {
	// 判断是群组还是 1v1
	if ('toRoomId' in message && message.toRoomId != null) {
		router.pushByPath(`/chat/room/${message.toRoomId}?messageId=${messageId}`);
	} else if ('fromUserId' in message && message.fromUserId !== $i.id) {
		// 对方发给自己的消息，优先跳转到发送者的私聊（因为此时 toUserId === $i.id）
		router.pushByPath(`/chat/user/${message.fromUserId}?messageId=${messageId}`);
	} else if ('toUserId' in message && message.toUserId != null) {
		router.pushByPath(`/chat/user/${message.toUserId}?messageId=${messageId}`);
	}
}

// 未读状态由 MkChatHistories 组件在 fetchHistory 时根据实际数据更新
</script>

<style lang="scss" module>
.actionsRow {
	display: flex;
	justify-content: center;
}

.start {
	margin: 0 auto;
}

.searchResultItem {
	padding: 12px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 12px;
}

.loadMore {
	display: flex;
	justify-content: center;
}
</style>
