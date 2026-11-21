<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<XColumn :column="column" :isStacked="isStacked">
	<template #header><i class="ti ti-messages" style="margin-right: 8px;"></i>{{ column.name || i18n.ts._deck._columns.chat }}</template>

	<div style="padding: 8px;" class="_gaps">
		<MkInfo v-if="$i.policies.chatAvailability === 'readonly'">{{ i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer }}</MkInfo>
		<MkInfo v-else-if="$i.policies.chatAvailability === 'unavailable'" warn>{{ i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>
		<template v-if="$i.policies.chatAvailability !== 'unavailable'">
			<div :class="$style.toolbar">
				<div :class="$style.filters">
					<button
						type="button"
						class="_button"
						:class="[$style.filterButton, { [$style.active]: filter === 'all' }]"
						@click="filter = 'all'"
					>{{ i18n.ts._chat.filterAll }}</button>
					<button
						type="button"
						class="_button"
						:class="[$style.filterButton, { [$style.active]: filter === 'direct' }]"
						@click="filter = 'direct'"
					>{{ i18n.ts._chat.filterDirect }}</button>
					<button
						type="button"
						class="_button"
						:class="[$style.filterButton, { [$style.active]: filter === 'rooms' }]"
						@click="filter = 'rooms'"
					>{{ i18n.ts._chat.filterRooms }}</button>
				</div>
				<div :class="$style.quickLinks">
					<MkA to="/chat" :class="$style.quickLink" :title="i18n.ts._chat.home">
						<i class="ti ti-messages"></i> {{ i18n.ts._chat.home }}
					</MkA>
					<MkA to="/chat/search" :class="$style.quickLink" :title="i18n.ts._chat.searchRoom">
						<i class="ti ti-search"></i> {{ i18n.ts._chat.searchRoom }}
					</MkA>
				</div>
			</div>
			<MkChatHistories :filter="filter"/>
		</template>
	</div>
</XColumn>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { i18n } from '../../i18n.js';
import XColumn from './column.vue';
import type { Column } from '@/deck.js';
import { ensureSignin } from '@/i.js';
import MkInfo from '@/components/MkInfo.vue';
import MkChatHistories from '@/components/MkChatHistories.vue';

defineProps<{
	column: Column;
	isStacked: boolean;
}>();

const $i = ensureSignin();
const filter = ref<'all' | 'direct' | 'rooms'>('all');
</script>

<style lang="scss" module>
.toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
}

.filters {
	display: flex;
	align-items: center;
	gap: 4px;
}

.filterButton {
	padding: 4px 10px;
	font-size: 0.85em;
	border-radius: 999px;
	background: var(--MI_THEME-panelHighlight);
	color: var(--MI_THEME-fg);

	&.active {
		background: var(--MI_THEME-accent);
		color: var(--MI_THEME-fgOnAccent);
	}
}

.quickLinks {
	display: flex;
	align-items: center;
	gap: 10px;
}

.quickLink {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-size: 0.85em;
	color: var(--MI_THEME-accent);
}
</style>
