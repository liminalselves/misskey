<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkButton v-if="isOwner" primary rounded style="margin: 0 auto;" @click="emit('inviteUser')"><i class="ti ti-plus"></i> {{ i18n.ts._chat.inviteUser }}</MkButton>

	<!-- 群主 -->
	<MkA :class="$style.member" :to="`${userPage(room.owner)}`">
		<MkAvatar :class="$style.avatar" :user="room.owner"/>
		<div :class="$style.info">
			<MkUserName :user="room.owner"/>
			<span :class="$style.ownerBadge">群主</span>
		</div>
	</MkA>

	<hr v-if="memberships.length > 0">

	<!-- 成员列表 -->
	<div v-for="membership in memberships" :key="membership.id" :class="$style.member">
		<MkA :class="$style.memberLink" :to="`${userPage(membership.user!)}`">
			<MkAvatar :class="$style.avatar" :user="membership.user!"/>
			<div :class="$style.info">
				<MkUserName :user="membership.user!"/>
				<span v-if="(membership as any).suspendedUntil" :class="$style.suspendedBadge">
					<i class="ti ti-ban"></i>
				</span>
			</div>
		</MkA>
		<button v-if="isOwner" class="_button" :class="$style.menuBtn" @click="menu(membership, $event)">
			<i class="ti ti-dots"></i>
		</button>
	</div>

	<!-- 已发送的邀请 -->
	<template v-if="isOwner && invitations.length > 0">
		<hr>
		<div :class="$style.sectionTitle">{{ i18n.ts._chat.sentInvitations }}</div>
		<MkA v-for="invitation in invitations" :key="invitation.id" :class="$style.member" :to="`${userPage(invitation.user)}`">
			<MkAvatar :class="$style.avatar" :user="invitation.user"/>
			<div :class="$style.info">
				<MkUserName :user="invitation.user"/>
			</div>
		</MkA>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { userPage } from '@/filters/user.js';
import { ensureSignin } from '@/i.js';
import * as os from '@/os.js';
import MkUserName from '@/components/global/MkUserName.vue';

const $i = ensureSignin();

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const emit = defineEmits<{
	(ev: 'inviteUser'): void,
}>();

const isOwner = computed(() => {
	return props.room.ownerId === $i.id;
});

const memberships = ref<Misskey.entities.ChatRoomMembership[]>([]);
const invitations = ref<Misskey.entities.ChatRoomInvitation[]>([]);

async function loadMembers() {
	memberships.value = await misskeyApi('chat/rooms/members', {
		roomId: props.room.id,
		limit: 50,
	});

	if (isOwner.value) {
		invitations.value = await misskeyApi('chat/rooms/invitations/outbox', {
			roomId: props.room.id,
			limit: 50,
		});
	}
}

onMounted(() => {
	loadMembers();
});

function menu(membership: any, ev: MouseEvent) {
	const isSuspended = membership.suspendedUntil;
	const chatI18n = i18n.ts._chat as any;
	os.popupMenu([
		{
			text: chatI18n.kick,
			icon: 'ti ti-door-exit',
			danger: true,
			action: () => kick(membership),
		},
		isSuspended ? {
			text: chatI18n.unsuspend,
			icon: 'ti ti-circle-check',
			action: () => unsuspend(membership),
		} : {
			text: chatI18n.suspend,
			icon: 'ti ti-ban',
			action: () => suspend(membership),
		},
	], ev.currentTarget ?? ev.target);
}

async function kick(membership: any) {
	const userName = membership.user.name || membership.user.username;
	const chatI18n = i18n.tsx._chat as any;
	const { canceled } = await os.confirm({
		type: 'warning',
		text: chatI18n.kickConfirm({ name: userName }),
	});
	if (canceled) return;

	await os.apiWithDialog('chat/rooms/kick' as any, {
		roomId: props.room.id,
		userId: membership.userId,
	});

	await loadMembers();
}

async function suspend(membership: any) {
	const chatI18n = i18n.ts._chat as any;
	const { canceled, result } = await os.select({
		title: chatI18n.suspendDuration,
		items: [
			{ value: 60, label: chatI18n._suspendDuration['1hour'] },
			{ value: 60 * 12, label: chatI18n._suspendDuration['12hours'] },
			{ value: 60 * 24, label: chatI18n._suspendDuration['24hours'] },
			{ value: 60 * 24 * 7, label: chatI18n._suspendDuration['1week'] },
			{ value: 0, label: chatI18n._suspendDuration.permanent },
		],
	});
	if (canceled) return;

	let expiredAt: string;
	if (result === 0) {
		expiredAt = new Date(9999, 0, 1).toISOString();
	} else {
		expiredAt = new Date(Date.now() + result * 60 * 1000).toISOString();
	}

	await os.apiWithDialog('chat/rooms/suspend' as any, {
		roomId: props.room.id,
		userId: membership.userId,
		expiredAt: expiredAt,
	});

	await loadMembers();
}

async function unsuspend(membership: any) {
	await os.apiWithDialog('chat/rooms/unsuspend' as any, {
		roomId: props.room.id,
		userId: membership.userId,
	});

	await loadMembers();
}
</script>

<style lang="scss" module>
.member {
	display: flex;
	align-items: center;
	padding: 8px;
	border-radius: 8px;

	&:hover {
		background: var(--panelHighlight);
		text-decoration: none;
	}
}

.memberLink {
	display: flex;
	align-items: center;
	flex: 1;
	min-width: 0;

	&:hover {
		text-decoration: none;
	}
}

.avatar {
	width: 42px;
	height: 42px;
	margin-right: 12px;
}

.info {
	flex: 1;
	min-width: 0;
	display: flex;
	align-items: center;
	gap: 8px;
}

.ownerBadge {
	font-size: 0.8em;
	padding: 2px 8px;
	border-radius: 4px;
	background: var(--accent);
	color: var(--fgOnAccent);
}

.suspendedBadge {
	color: var(--error);
}

.menuBtn {
	padding: 8px;
	border-radius: 50%;

	&:hover {
		background: var(--buttonHoverBg);
	}
}

.sectionTitle {
	font-size: 0.9em;
	color: var(--fgTransparentWeak);
}
</style>
