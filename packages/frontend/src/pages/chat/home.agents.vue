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
	>
		<template #prefix><i class="ti ti-search"></i></template>
	</MkInput>

	<MkButton v-if="searchQuery.length > 0" primary rounded @click="runSearch">{{ i18n.ts.search }}</MkButton>

	<MkFoldableSection v-if="searched">
		<template #header>{{ i18n.ts.searchResult }}</template>

		<MkLoading v-if="loading"/>
		<div v-else-if="filteredSessions.length > 0" class="_gaps_s">
			<MkA
				v-for="s in filteredSessions"
				:key="'f:' + s.id"
				:class="$style.message"
				class="_panel"
				:to="`/chat/agent/${s.id}`"
			>
				<XRow :session="s"/>
			</MkA>
		</div>
		<MkResult v-else type="notFound"/>
	</MkFoldableSection>

	<MkFoldableSection>
		<template #header>{{ i18n.ts._chat.history }}</template>

		<MkLoading v-if="loading"/>
		<MkInfo v-else-if="sessions.length === 0">{{ i18n.ts._agents.noSessionsYet }}</MkInfo>
		<div v-else class="_gaps_s">
			<MkA
				v-for="s in sessions"
				:key="s.id"
				:class="$style.message"
				class="_panel"
				:to="`/chat/agent/${s.id}`"
			>
				<XRow :session="s"/>
			</MkA>
		</div>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { computed, onActivated, onMounted, ref, watch } from 'vue';
import XRow from './home.agents.row.vue';
import type { AgentsSessionsListMineResponse } from 'misskey-js/entities.js';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkA from '@/components/global/MkA.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';

type SessionRow = AgentsSessionsListMineResponse[number];

const sessions = ref<SessionRow[]>([]);
const loading = ref(true);
const searchQuery = ref('');
const searched = ref(false);

const filteredSessions = computed(() => {
	const q = searchQuery.value.trim().toLowerCase();
	if (!q) return [];
	return sessions.value.filter((s) => {
		const hay = [
			s.name,
			s.characterName,
			s.characterSummary ?? '',
			s.lastMessagePreview,
			sessionKindLabel(s.sessionKind),
		].join('\n').toLowerCase();
		return hay.includes(q);
	});
});

function sessionKindLabel(kind: string) {
	return kind === 'draft_test' ? i18n.ts._agents.sessionKindDraft : i18n.ts._agents.sessionKindCommunity;
}

function runSearch() {
	searched.value = true;
}

watch(searchQuery, (q) => {
	if (!q.trim()) searched.value = false;
});

async function loadSessions() {
	try {
		loading.value = true;
		sessions.value = await misskeyApi('agents/sessions/list-mine', {});
	} catch {
		sessions.value = [];
	} finally {
		loading.value = false;
	}
}

onMounted(() => {
	void loadSessions();
});

onActivated(() => {
	void loadSessions();
});
</script>

<style lang="scss" module>
.message {
	position: relative;
	display: flex;
	padding: 16px 24px;
	text-align: start;
	color: inherit;
	text-decoration: none;
}

@container (max-width: 500px) {
	.message {
		font-size: 90%;
		padding: 14px 20px;
	}
}

@container (max-width: 450px) {
	.message {
		font-size: 80%;
		padding: 12px 16px;
	}
}
</style>
