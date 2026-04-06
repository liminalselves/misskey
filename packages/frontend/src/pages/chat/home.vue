<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs" :swipable="true">
	<MkPolkadots v-if="tab === 'home'" accented :height="200" style="margin-bottom: -200px;"/>
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<XHome v-if="tab === 'home'"/>
		<XAgents v-else-if="tab === 'agents'"/>
		<XInvitations v-else-if="tab === 'invitations'"/>
		<XJoiningRooms v-else-if="tab === 'joiningRooms'"/>
		<XOwnedRooms v-else-if="tab === 'ownedRooms'"/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import XHome from './home.home.vue';
import XAgents from './home.agents.vue';
import XInvitations from './home.invitations.vue';
import XJoiningRooms from './home.joiningRooms.vue';
import XOwnedRooms from './home.ownedRooms.vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { definePage } from '@/page.js';
import MkPolkadots from '@/components/MkPolkadots.vue';

const tab = ref('home');

const headerActions = computed(() => []);

const headerTabs = computed(() => {
	const tabs = [{
		key: 'home',
		title: i18n.ts._chat.home,
		icon: 'ti ti-home',
	}] as { key: string; title: string; icon: string }[];
	if ((instance as Record<string, unknown>).agentFeatureEnabled === true) {
		tabs.push({
			key: 'agents',
			title: i18n.ts._agents.chatTab,
			icon: 'ti ti-robot',
		});
	}
	tabs.push(
		{
			key: 'invitations',
			title: i18n.ts._chat.invitations,
			icon: 'ti ti-ticket',
		},
		{
			key: 'joiningRooms',
			title: i18n.ts._chat.joiningRooms,
			icon: 'ti ti-users-group',
		},
		{
			key: 'ownedRooms',
			title: i18n.ts._chat.yourRooms,
			icon: 'ti ti-settings',
		},
	);
	return tabs;
});

definePage(() => ({
	title: i18n.ts.directMessage,
	icon: 'ti ti-messages',
}));
</script>

<style lang="scss" module>
</style>
