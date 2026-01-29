<!--
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="[]" :tabs="[]">
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<div class="_gaps">
			<MkInput
				v-model="searchQuery"
				placeholder="搜索群组..."
				type="search"
				@enter="search"
			>
				<template #prefix><i class="ti ti-search"></i></template>
			</MkInput>

			<MkButton primary rounded @click="search">{{ i18n.ts.search }}</MkButton>

			<MkFoldableSection v-if="searched">
				<template #header>{{ i18n.ts.searchResult }}</template>

				<div v-if="searchResults.length > 0" class="_gaps_s">
					<div v-for="room in searchResults" :key="room.id" class="_panel" :class="$style.room">
						<MkAvatar :user="room.owner" :class="$style.avatar"/>
						<div :class="$style.info">
							<div :class="$style.name">{{ room.name }}</div>
							<div v-if="room.description" :class="$style.description">{{ room.description }}</div>
						</div>
						<MkButton primary style="flex-shrink: 0;" @click="join(room)">{{ i18n.ts._chat.join }}</MkButton>
					</div>
				</div>
				<MkResult v-else type="notFound"/>
			</MkFoldableSection>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkInput from '@/components/MkInput.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';
import { definePage } from '@/page.js';

const router = useRouter();

const searchQuery = ref('');
const searched = ref(false);
const searchResults = ref<Misskey.entities.ChatRoom[]>([]);

async function search() {
	if (!searchQuery.value) return;

	const res = await (misskeyApi as any)('chat/rooms/search', {
		query: searchQuery.value,
	});

	searchResults.value = res;
	searched.value = true;
}

async function join(room: Misskey.entities.ChatRoom) {
	await os.apiWithDialog('chat/rooms/join', {
		roomId: room.id,
	});
	router.push(`/chat/room/${room.id}` as any);
}

definePage(() => ({
	title: (i18n.ts._chat as any).searchRoom,
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

.avatar {
	width: 42px;
	height: 42px;
	flex-shrink: 0;
}

.info {
	flex: 1;
	min-width: 0;
}

.name {
	font-weight: bold;
}

.description {
	font-size: 0.9em;
	color: var(--fgTransparentWeak);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
