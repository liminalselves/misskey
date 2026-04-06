<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInput
		v-model="searchQuery"
		:placeholder="i18n.ts._chat.searchMessages"
		type="search"
		@enter="search()"
	>
		<template #prefix><i class="ti ti-search"></i></template>
	</MkInput>

	<MkButton primary rounded @click="search">{{ i18n.ts.search }}</MkButton>

	<MkFoldableSection v-if="searched">
		<template #header>{{ i18n.ts.searchResult }}</template>

		<div v-if="searchResults.length > 0" class="_gaps_s">
			<div v-for="message in searchResults" :key="message.id" :class="$style.searchResultItem">
				<XAgentMessage
					:sessionId="sessionId"
					:message="message"
					:assistantName="assistantName ?? null"
					:assistantAvatarUrl="assistantAvatarUrl ?? null"
					isSearchResult
					@navigate="onNavigate"
					@deleted="onSearchResultDeleted"
				/>
			</div>
		</div>
		<MkResult v-else type="notFound"/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import XAgentMessage from './agent-session.message.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import MkInput from '@/components/MkInput.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import * as os from '@/os.js';

const props = defineProps<{
	sessionId: string;
	assistantName?: string | null;
	assistantAvatarUrl?: string | null;
}>();

const emit = defineEmits<{
	(ev: 'scrollToMessage', messageId: string): void;
	(ev: 'messageDeleted', messageId: string): void;
}>();

const searchQuery = ref('');
const searched = ref(false);
const searchResults = ref<{ id: string; role: string; content: string; createdAt: string }[]>([]);

async function search() {
	const q = searchQuery.value.trim();
	if (q.length === 0) {
		os.alert({ type: 'warning', text: i18n.ts._agents.agentSearchNeedKeyword });
		return;
	}
	try {
		const res = await misskeyApi('agents/messages/search', {
			sessionId: props.sessionId,
			query: q,
			limit: 30,
		});
		searchResults.value = Array.isArray(res) ? res : [];
		searched.value = true;
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}

function onNavigate(messageId: string) {
	emit('scrollToMessage', messageId);
}

function onSearchResultDeleted(messageId: string) {
	searchResults.value = searchResults.value.filter(m => m.id !== messageId);
	emit('messageDeleted', messageId);
}
</script>

<style lang="scss" module>
.searchResultItem {
	padding: 12px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 12px;
}
</style>
