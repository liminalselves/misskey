<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs" :swipable="true">
	<MkPolkadots v-if="tab === 'home'" accented :height="200" style="margin-bottom: -200px;"/>
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<XHome v-if="tab === 'home'"/>
		<XDirectMessages v-else-if="tab === 'directMessages'"/>
		<XAgents v-else-if="tab === 'agents'"/>
		<XInvitations v-else-if="tab === 'invitations'" @updateCount="pendingInvitationCount = $event"/>
		<XJoiningRooms v-else-if="tab === 'joiningRooms'"/>
		<XOwnedRooms v-else-if="tab === 'ownedRooms'"/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import XHome from './home.home.vue';
import XDirectMessages from './home.directMessages.vue';
import XAgents from './home.agents.vue';
import XInvitations from './home.invitations.vue';
import XJoiningRooms from './home.joiningRooms.vue';
import XOwnedRooms from './home.ownedRooms.vue';
import type { Tab } from '@/components/MkTabs.vue';
import type { PageHeaderItem } from '@/types/page-header.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { $i } from '@/i.js';
import { definePage } from '@/page.js';
import MkPolkadots from '@/components/MkPolkadots.vue';
import { useRouter } from '@/router.js';
import * as os from '@/os.js';
import { formatApiError, misskeyApi } from '@/utility/misskey-api.js';
import { useStream } from '@/stream.js';

const props = defineProps<{ view?: string }>();
const router = useRouter();

const pendingInvitationCount = ref(0);
let hasBeenDeactivated = false;
let mainChannel: { dispose: () => void } | null = null;

const updateRoomApi = misskeyApi as unknown as (
	endpoint: 'chat/rooms/update',
	data: { roomId: string; allowMemberInvite?: boolean },
) => Promise<Misskey.entities.ChatRoom>;

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
		await os.alert({ type: 'error', text: formatApiError(err) });
	}
}

async function fetchInvitationCount() {
	if (!$i || !('token' in $i) || !$i.token || $i.policies.chatAvailability === 'unavailable') return;
	try {
		const invitations = await misskeyApi('chat/rooms/invitations/inbox', {
			limit: 100,
		});
		pendingInvitationCount.value = invitations.length;
	} catch {
		// 静默忽略计数拉取失败，不影响聊天首页渲染
	}
}

const headerActions = computed<PageHeaderItem[]>(() => {
	const actions: PageHeaderItem[] = [];
	if ($i && $i.policies.chatAvailability === 'available') {
		actions.push({
			icon: 'ti ti-plus',
			text: i18n.ts._chat.createRoom,
			handler: () => {
				void createRoom();
			},
		});
	}
	if ($i && $i.policies.chatAvailability !== 'unavailable') {
		actions.push({
			icon: 'ti ti-search',
			text: i18n.ts._chat.searchRoom,
			handler: () => {
				router.push('/chat/search');
			},
		});
	}
	return actions;
});

const headerTabs = computed(() => {
	const tabs = [{
		key: 'home',
		title: i18n.ts._chat.home,
		icon: 'ti ti-home',
	}, {
		key: 'directMessages',
		title: i18n.ts.directMessage,
		icon: 'ti ti-mail',
	}] as Tab[];
	if ((instance as Record<string, unknown>).agentFeatureEnabled === true) {
		tabs.push({
			key: 'agents',
			title: i18n.ts._agents.chatTab,
			icon: 'ti ti-robot',
		});
	}
	const count = pendingInvitationCount.value;
	tabs.push(
		{
			key: 'invitations',
			title: count > 0
				? `${i18n.ts._chat.invitations} (${count > 99 ? '99+' : count})`
				: i18n.ts._chat.invitations,
			icon: 'ti ti-ticket',
			indicated: count > 0,
		},
		{
			key: 'joiningRooms',
			title: i18n.ts._chat.joiningRooms,
			icon: 'ti ti-users-group',
		},
		{
			key: 'ownedRooms',
			title: i18n.ts._chat.yourRooms,
			icon: 'ti ti-crown',
		},
	);
	return tabs;
});

function resolveTab(view?: string): string {
	return headerTabs.value.find(item => item.key === view)?.key ?? 'home';
}

const tab = ref('home');

watch(() => props.view, view => {
	tab.value = resolveTab(view);
}, { immediate: true });

watch(tab, value => {
	const url = new URL(router.getCurrentFullPath(), window.location.origin);
	if (value === 'home') url.searchParams.delete('view');
	else url.searchParams.set('view', value);
	const path = `${url.pathname}${url.search}${url.hash}`;
	if (path !== router.getCurrentFullPath()) router.replaceByPath(path);
});

onMounted(() => {
	void fetchInvitationCount();

	if ($i && 'token' in $i && $i.token) {
		const channel = useStream().useChannel('main');
		mainChannel = channel;
		channel.on('notification', notification => {
			if (notification.type === 'chatRoomInvitationReceived') {
				void fetchInvitationCount();
			}
		});
		(channel as any).on('chatRoomInvitationReceived', () => {
			void fetchInvitationCount();
		});
	}
});

onDeactivated(() => {
	hasBeenDeactivated = true;
});

onActivated(() => {
	if (!hasBeenDeactivated) return;
	void fetchInvitationCount();
});

onBeforeUnmount(() => {
	mainChannel?.dispose();
	mainChannel = null;
});

definePage(() => ({
	title: i18n.ts.directMessage_short,
	icon: 'ti ti-messages',
}));
</script>

<style lang="scss" module>
</style>
