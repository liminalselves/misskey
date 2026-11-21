<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInput
		v-model="searchQuery"
		:placeholder="i18n.ts._chat.searchMessagesPlaceholder"
		type="search"
		@enter="search()"
	>
		<template #prefix><i class="ti ti-search"></i></template>
	</MkInput>

	<MkSelect v-if="senderItems.length > 1" v-model="selectedSenderId" :items="senderItems">
		<template #label>{{ i18n.ts._chat.filterBySender }}</template>
	</MkSelect>

	<MkButton primary rounded :disabled="searchQuery.trim() === ''" :wait="searching" @click="search">{{ i18n.ts.search }}</MkButton>

	<MkLoading v-if="searching"/>
	<MkResult v-else-if="loadError" type="error">
		<MkButton primary rounded @click="search">{{ i18n.ts._chat.retry }}</MkButton>
	</MkResult>
	<MkFoldableSection v-else-if="searched">
		<template #header>{{ i18n.ts.searchResult }}</template>

		<div v-if="searchResults.length > 0" class="_gaps_s">
			<div v-for="message in searchResults" :key="message.id" :class="$style.searchResultItem">
				<div v-if="message.text && activeQuery" :class="$style.matchExcerpt">
					<template v-for="(part, idx) in splitHighlightParts(message.text, activeQuery)" :key="idx">
						<mark v-if="part.match" :class="$style.highlight">{{ part.text }}</mark>
						<span v-else>{{ part.text }}</span>
					</template>
				</div>
				<XMessage
					:message="message"
					:roomOwnerId="resolvedRoomOwnerId"
					:isSearchResult="true"
					@navigate="onNavigate"
				/>
			</div>

			<MkButton v-if="hasMore" rounded :wait="loadingMore" :class="$style.loadMore" @click="loadMore">{{ i18n.ts._chat.loadMore }}</MkButton>
		</div>
		<MkResult v-else type="notFound"/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts">
export type HighlightPart = {
	text: string;
	match: boolean;
};

export function splitHighlightParts(text: string, query: string): HighlightPart[] {
	const q = query.trim();
	if (!q) return [{ text, match: false }];

	const lowerText = text.toLowerCase();
	const lowerQ = q.toLowerCase();
	const parts: HighlightPart[] = [];
	let cursor = 0;

	while (cursor < text.length) {
		const idx = lowerText.indexOf(lowerQ, cursor);
		if (idx < 0) {
			parts.push({ text: text.slice(cursor), match: false });
			break;
		}
		if (idx > cursor) {
			parts.push({ text: text.slice(cursor, idx), match: false });
		}
		parts.push({ text: text.slice(idx, idx + q.length), match: true });
		cursor = idx + q.length;
	}

	return parts;
}
</script>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import XMessage from './XMessage.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import type { MkSelectItem } from '@/components/MkSelect.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import * as os from '@/os.js';
import { ensureSignin } from '@/i.js';

const LIMIT = 20;

const $i = ensureSignin();

const props = defineProps<{
	userId?: string;
	roomId?: string;
	roomOwnerId?: string;
	room?: Misskey.entities.ChatRoom | null;
	user?: Misskey.entities.UserDetailed | null;
}>();

const emit = defineEmits<{
	(ev: 'scrollToMessage', messageId: string): void;
}>();

const searchQuery = ref('');
const activeQuery = ref('');
const selectedSenderId = ref<string>('');
const searched = ref(false);
const searching = ref(false);
const loadingMore = ref(false);
const loadError = ref(false);
const hasMore = ref(false);
const searchResults = ref<Misskey.entities.ChatMessage[]>([]);
const roomSenders = ref<Misskey.entities.UserLite[]>([]);
let searchSeq = 0;

const resolvedRoomOwnerId = computed(() => props.roomOwnerId ?? props.room?.ownerId);

const senderItems = computed<MkSelectItem<string>[]>(() => {
	const items: MkSelectItem<string>[] = [
		{ value: '', label: i18n.ts._chat.allSenders },
	];
	const seen = new Set<string>();
	const pushUser = (u: Misskey.entities.UserLite | null | undefined) => {
		if (!u || seen.has(u.id)) return;
		seen.add(u.id);
		const displayName = u.name ? `${u.name} (@${u.username})` : `@${u.username}`;
		items.push({ value: u.id, label: displayName });
	};

	if (props.roomId) {
		pushUser(props.room?.owner);
		for (const member of roomSenders.value) {
			pushUser(member);
		}
		pushUser($i);
	} else if (props.userId) {
		pushUser($i);
		pushUser(props.user);
	}
	return items;
});

async function loadRoomSenders() {
	if (!props.roomId) {
		roomSenders.value = [];
		return;
	}
	try {
		const memberships = await misskeyApi('chat/rooms/members', {
			roomId: props.roomId,
			limit: 50,
		});
		roomSenders.value = memberships
			.map(m => m.user)
			.filter((u): u is Misskey.entities.UserLite => u != null);
	} catch {
		// 加载发送者筛选项失败不阻断搜索本身
	}
}

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
		const params: Record<string, unknown> = {
			query: q,
			limit: LIMIT,
		};
		if (props.roomId) params.roomId = props.roomId;
		if (props.userId) params.userId = props.userId;
		if (selectedSenderId.value) params.fromUserId = selectedSenderId.value;

		const res = await (misskeyApi as unknown as (ep: string, data: Record<string, unknown>) => Promise<Misskey.entities.ChatMessage[]>)(
			'chat/messages/search',
			params,
		);
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
		const params: Record<string, unknown> = {
			query: activeQuery.value,
			limit: LIMIT,
			untilId: searchResults.value[searchResults.value.length - 1].id,
		};
		if (props.roomId) params.roomId = props.roomId;
		if (props.userId) params.userId = props.userId;
		if (selectedSenderId.value) params.fromUserId = selectedSenderId.value;

		const res = await (misskeyApi as unknown as (ep: string, data: Record<string, unknown>) => Promise<Misskey.entities.ChatMessage[]>)(
			'chat/messages/search',
			params,
		);
		if (seq !== searchSeq) return;
		searchResults.value.push(...res);
		hasMore.value = res.length === LIMIT;
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		loadingMore.value = false;
	}
}

watch(() => [props.roomId, props.userId], () => {
	selectedSenderId.value = '';
	searched.value = false;
	searchResults.value = [];
	hasMore.value = false;
	loadError.value = false;
	void loadRoomSenders();
});

watch(selectedSenderId, () => {
	if (searched.value && searchQuery.value.trim() !== '') {
		void search();
	}
});

onMounted(() => {
	void loadRoomSenders();
});

// 处理消息点击导航
function onNavigate(messageId: string) {
	emit('scrollToMessage', messageId);
}
</script>

<style lang="scss" module>
.searchResultItem {
	padding: 12px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
}

.matchExcerpt {
	margin-bottom: 8px;
	padding: 4px 8px;
	border-radius: 6px;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
	background: color-mix(in srgb, var(--MI_THEME-fg) 4%, transparent);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.highlight {
	background: color-mix(in srgb, var(--MI_THEME-accent) 28%, transparent);
	color: var(--MI_THEME-fg);
	border-radius: 3px;
	padding: 0 2px;
}

.loadMore {
	margin: 8px auto 0;
}
</style>
