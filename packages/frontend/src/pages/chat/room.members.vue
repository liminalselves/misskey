<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkButton v-if="canInvite && !room.isArchived" primary rounded style="margin: 0 auto;" @click="emit('inviteUser')">
		<i class="ti ti-plus"></i> {{ i18n.ts._chat.inviteUser }}
	</MkButton>

	<MkInput v-model="memberQuery" type="search" :placeholder="i18n.ts._chat.searchMembersPlaceholder">
		<template #prefix><i class="ti ti-search"></i></template>
	</MkInput>

	<!-- 群主 -->
	<div v-if="showOwnerRow" :class="$style.member">
		<MkA :class="$style.memberLink" :to="`${userPage(room.owner)}`">
			<MkAvatar :class="$style.avatar" :user="room.owner"/>
			<div :class="$style.info">
				<MkUserName :user="room.owner"/>
				<span :class="$style.ownerBadge">{{ i18n.ts._chat.owner }}</span>
			</div>
		</MkA>
		<button
			v-if="room.ownerId !== $i.id"
			type="button"
			class="_button"
			:class="$style.menuBtn"
			:aria-label="i18n.ts._chat.mention"
			:title="i18n.ts._chat.mention"
			@click="emit('mention', room.owner)"
		>
			<i class="ti ti-at"></i>
		</button>
	</div>

	<hr v-if="showOwnerRow && memberships.length > 0" :class="$style.divider">

	<MkLoading v-if="loadingMembers"/>
	<MkResult v-else-if="loadError" type="error">
		<MkButton primary rounded @click="loadMembers(true)">{{ i18n.ts._chat.retry }}</MkButton>
	</MkResult>
	<template v-else>
		<!-- 成员列表 -->
		<div v-for="membership in memberships" :key="membership.id" :class="$style.member">
			<MkA :class="$style.memberLink" :to="`${userPage(membership.user!)}`">
				<MkAvatar :class="$style.avatar" :user="membership.user!"/>
				<div :class="$style.info">
					<MkUserName :user="membership.user!"/>
					<span v-if="membership.role === 'admin'" :class="$style.adminBadge">{{ i18n.ts._chat.admin }}</span>
					<span v-if="isCurrentlySuspended(membership.suspendedUntil)" :class="$style.suspendedBadge">
						<i class="ti ti-ban"></i>
						<span>{{ formatSuspensionBadge(membership.suspendedUntil!) }}</span>
					</span>
				</div>
			</MkA>
			<button
				v-if="hasMemberActions(membership)"
				type="button"
				class="_button"
				:class="$style.menuBtn"
				:aria-label="i18n.ts.menu"
				:title="i18n.ts.menu"
				@click="menu(membership, $event)"
			>
				<i class="ti ti-dots"></i>
			</button>
		</div>

		<MkButton v-if="hasMoreMembers" rounded :wait="loadingMoreMembers" :class="$style.loadMore" @click="loadMoreMembers">
			{{ i18n.ts._chat.loadMore }}
		</MkButton>
	</template>

	<!-- 已发送的邀请 -->
	<template v-if="canManageInvitations && invitations.length > 0">
		<hr :class="$style.divider">
		<div :class="$style.sectionTitle">{{ i18n.ts._chat.sentInvitations }}</div>
		<div v-for="invitation in invitations" :key="invitation.id" :class="$style.member">
			<MkA :class="$style.memberLink" :to="`${userPage(invitation.user)}`">
				<MkAvatar :class="$style.avatar" :user="invitation.user"/>
				<div :class="$style.info">
					<MkUserName :user="invitation.user"/>
				</div>
			</MkA>
			<button
				type="button"
				class="_button"
				:class="$style.menuBtn"
				:aria-label="i18n.ts._chat.cancelInvitation"
				:title="i18n.ts._chat.cancelInvitation"
				@click="cancelInvitation(invitation)"
			>
				<i class="ti ti-x"></i>
			</button>
		</div>
	</template>

</div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu.js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { userPage } from '@/filters/user.js';
import { ensureSignin } from '@/i.js';
import * as os from '@/os.js';
import { chatApiWithDialog, formatChatError } from '@/utility/chat-error.js';
import MkUserName from '@/components/global/MkUserName.vue';

const MEMBERS_LIMIT = 30;

const $i = ensureSignin();

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const emit = defineEmits<{
	(ev: 'inviteUser'): void;
	(ev: 'mention', user: Misskey.entities.UserLite): void;
	(ev: 'roomUpdated', room: Misskey.entities.ChatRoom): void;
}>();

const isOwner = computed(() => props.room.ownerId === $i.id || props.room.myRole === 'owner');
const isAdmin = computed(() => props.room.myRole === 'admin');
const canInvite = computed(() => isOwner.value || isAdmin.value || Boolean(props.room.allowMemberInvite));
const canManageInvitations = computed(() => isOwner.value || isAdmin.value);

const memberQuery = ref('');
const memberships = ref<Misskey.entities.ChatRoomMembership[]>([]);
const loadingMembers = ref(false);
const loadingMoreMembers = ref(false);
const hasMoreMembers = ref(false);
const loadError = ref(false);
const invitations = ref<Misskey.entities.ChatRoomInvitation[]>([]);
let membersReqSeq = 0;
let searchDebounceId: number | null = null;

const showOwnerRow = computed(() => {
	const q = memberQuery.value.trim().toLowerCase();
	if (!q) return true;
	const name = (props.room.owner.name ?? '').toLowerCase();
	const username = props.room.owner.username.toLowerCase();
	return name.includes(q) || username.includes(q);
});

function isCurrentlySuspended(suspendedUntil: string | null | undefined): boolean {
	if (!suspendedUntil) return false;
	return new Date(suspendedUntil).getTime() > Date.now();
}

function formatSuspensionBadge(suspendedUntil: string): string {
	const d = new Date(suspendedUntil);
	if (d.getFullYear() >= 9000) {
		return i18n.ts._chat.suspendedPermanentLabel;
	}
	return i18n.tsx._chat.suspendedUntilLabel({ until: d.toLocaleString() });
}

function canModerateMember(membership: Misskey.entities.ChatRoomMembership): boolean {
	if (membership.userId === $i.id || membership.userId === props.room.ownerId) return false;
	if (isOwner.value) return true;
	if (isAdmin.value) {
		return (membership.role ?? 'member') === 'member';
	}
	return false;
}

function hasMemberActions(membership: Misskey.entities.ChatRoomMembership): boolean {
	return (membership.user != null && membership.userId !== $i.id) || canModerateMember(membership);
}

async function loadMembers(reset = true) {
	const seq = ++membersReqSeq;
	if (reset) {
		loadingMembers.value = true;
		loadError.value = false;
	}
	const q = memberQuery.value.trim();
	try {
		const params: Record<string, unknown> = {
			roomId: props.room.id,
			limit: MEMBERS_LIMIT,
		};
		if (q) params.query = q;

		const res = await (misskeyApi as unknown as (ep: string, data: Record<string, unknown>) => Promise<Misskey.entities.ChatRoomMembership[]>)(
			'chat/rooms/members',
			params,
		);
		if (seq !== membersReqSeq) return;
		memberships.value = res.filter(m => m.userId !== props.room.ownerId);
		hasMoreMembers.value = res.length === MEMBERS_LIMIT;
	} catch {
		if (seq !== membersReqSeq) return;
		loadError.value = true;
	} finally {
		if (seq === membersReqSeq) {
			loadingMembers.value = false;
		}
	}
}

async function loadMoreMembers() {
	if (loadingMoreMembers.value || !hasMoreMembers.value || memberships.value.length === 0) return;
	const seq = membersReqSeq;
	loadingMoreMembers.value = true;
	const q = memberQuery.value.trim();
	try {
		const params: Record<string, unknown> = {
			roomId: props.room.id,
			limit: MEMBERS_LIMIT,
			untilId: memberships.value[memberships.value.length - 1].id,
		};
		if (q) params.query = q;

		const res = await (misskeyApi as unknown as (ep: string, data: Record<string, unknown>) => Promise<Misskey.entities.ChatRoomMembership[]>)(
			'chat/rooms/members',
			params,
		);
		if (seq !== membersReqSeq) return;
		const existingIds = new Set(memberships.value.map(m => m.id));
		const filtered = res.filter(m => m.userId !== props.room.ownerId && !existingIds.has(m.id));
		memberships.value.push(...filtered);
		hasMoreMembers.value = res.length === MEMBERS_LIMIT;
	} catch (err) {
		os.alert({ type: 'error', text: formatChatError(err) });
	} finally {
		loadingMoreMembers.value = false;
	}
}

async function loadInvitations() {
	if (!canManageInvitations.value) {
		invitations.value = [];
		return;
	}
	try {
		invitations.value = await misskeyApi('chat/rooms/invitations/outbox', {
			roomId: props.room.id,
			limit: 50,
		});
	} catch {
		// 忽略单块加载失败，不影响成员列表
	}
}

async function refresh() {
	await Promise.all([
		loadMembers(true),
		loadInvitations(),
	]);
}

defineExpose({
	refresh,
});

watch(memberQuery, () => {
	if (searchDebounceId != null) {
		window.clearTimeout(searchDebounceId);
	}
	searchDebounceId = window.setTimeout(() => {
		searchDebounceId = null;
		void loadMembers(true);
	}, 300);
});

watch(() => [props.room.id, props.room.ownerId, props.room.myRole], () => {
	void refresh();
});

onMounted(() => {
	void refresh();
});

onBeforeUnmount(() => {
	if (searchDebounceId != null) {
		window.clearTimeout(searchDebounceId);
		searchDebounceId = null;
	}
});

function menu(membership: Misskey.entities.ChatRoomMembership, ev: MouseEvent) {
	const isSuspended = isCurrentlySuspended(membership.suspendedUntil);
	const items: MenuItem[] = [];

	if (membership.user != null && membership.userId !== $i.id) {
		items.push({
			text: i18n.ts._chat.mention,
			icon: 'ti ti-at',
			action: () => emit('mention', membership.user!),
		});
	}

	if (canModerateMember(membership)) {
		if (items.length > 0) {
			items.push({ type: 'divider' });
		}

		if (isOwner.value) {
			const nextRole = membership.role === 'admin' ? 'member' : 'admin';
			items.push({
				text: membership.role === 'admin' ? i18n.ts._chat.removeAdmin : i18n.ts._chat.setAdmin,
				icon: membership.role === 'admin' ? 'ti ti-shield-off' : 'ti ti-shield-check',
				action: () => setRole(membership, nextRole),
			});
			items.push({
				text: i18n.ts._chat.transferOwnership,
				icon: 'ti ti-crown',
				action: () => transferOwnership(membership),
			});
			items.push({ type: 'divider' });
		}

		items.push(isSuspended ? {
			text: i18n.ts._chat.unsuspend,
			icon: 'ti ti-circle-check',
			action: () => unsuspend(membership),
		} : {
			text: i18n.ts._chat.suspend,
			icon: 'ti ti-volume-off',
			action: () => suspend(membership),
		});

		items.push({
			text: i18n.ts._chat.kick,
			icon: 'ti ti-door-exit',
			danger: true,
			action: () => kick(membership),
		});
	}

	if (items.length > 0) {
		os.popupMenu(items, ev.currentTarget ?? ev.target);
	}
}

async function setRole(membership: Misskey.entities.ChatRoomMembership, role: 'member' | 'admin') {
	try {
		const updated = await chatApiWithDialog<Misskey.entities.ChatRoomMembership>(
			'chat/rooms/set-role',
			{
				roomId: props.room.id,
				userId: membership.userId,
				role,
			},
		);
		const idx = memberships.value.findIndex(m => m.id === membership.id);
		if (idx !== -1) {
			memberships.value[idx] = { ...memberships.value[idx], role: updated?.role ?? role };
		}
	} catch {
		// apiWithDialog 已显示错误提示
	}
}

async function transferOwnership(membership: Misskey.entities.ChatRoomMembership) {
	const userName = membership.user?.name || membership.user?.username || membership.userId;
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx._chat.transferOwnershipConfirm({ name: userName }),
	});
	if (canceled) return;

	try {
		const updatedRoom = await chatApiWithDialog<Misskey.entities.ChatRoom>(
			'chat/rooms/transfer-ownership',
			{
				roomId: props.room.id,
				userId: membership.userId,
			},
		);
		if (updatedRoom) {
			emit('roomUpdated', updatedRoom);
		}
		await refresh();
	} catch {
		// apiWithDialog 已显示错误提示
	}
}

async function kick(membership: Misskey.entities.ChatRoomMembership) {
	const userName = membership.user?.name || membership.user?.username || membership.userId;
	const { canceled, result } = await os.form(i18n.tsx._chat.kickConfirm({ name: userName }), {
		ban: {
			type: 'boolean',
			label: '同时拉黑',
			description: '拉黑后该用户无法再被邀请或主动加入本群组',
			default: false,
		},
	});
	if (canceled) return;

	try {
		await chatApiWithDialog('chat/rooms/kick', {
			roomId: props.room.id,
			userId: membership.userId,
			ban: Boolean(result.ban),
		});
		await loadMembers(true);
	} catch {
		// apiWithDialog 已显示错误提示
	}
}

async function cancelInvitation(invitation: Misskey.entities.ChatRoomInvitation) {
	const userName = invitation.user.name || invitation.user.username;
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx._chat.cancelInvitationConfirm({ name: userName }),
	});
	if (canceled) return;

	try {
		await chatApiWithDialog<unknown>(
			'chat/rooms/invitations/cancel',
			{
				invitationId: invitation.id,
			},
		);
		invitations.value = invitations.value.filter(i => i.id !== invitation.id);
	} catch {
		// apiWithDialog 已显示错误提示
	}
}

async function suspend(membership: Misskey.entities.ChatRoomMembership) {
	const { canceled, result } = await os.select({
		title: i18n.ts._chat.suspendDuration,
		items: [
			{ value: 60, label: i18n.ts._chat._suspendDuration['1hour'] },
			{ value: 60 * 12, label: i18n.ts._chat._suspendDuration['12hours'] },
			{ value: 60 * 24, label: i18n.ts._chat._suspendDuration['24hours'] },
			{ value: 60 * 24 * 7, label: i18n.ts._chat._suspendDuration['1week'] },
			{ value: 0, label: i18n.ts._chat._suspendDuration.permanent },
		],
	});
	if (canceled || result == null) return;

	let expiredAt: string;
	if (result === 0) {
		expiredAt = new Date(9999, 0, 1).toISOString();
	} else {
		expiredAt = new Date(Date.now() + result * 60 * 1000).toISOString();
	}

	try {
		await chatApiWithDialog('chat/rooms/suspend', {
			roomId: props.room.id,
			userId: membership.userId,
			expiredAt,
		});
		await loadMembers(true);
	} catch {
		// apiWithDialog 已显示错误提示
	}
}

async function unsuspend(membership: Misskey.entities.ChatRoomMembership) {
	try {
		await chatApiWithDialog('chat/rooms/unsuspend', {
			roomId: props.room.id,
			userId: membership.userId,
		});
		await loadMembers(true);
	} catch {
		// apiWithDialog 已显示错误提示
	}
}
</script>

<style lang="scss" module>
.member {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px;
	border-radius: var(--MI-radius);

	&:hover {
		background: var(--MI_THEME-panelHighlight);
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
	flex-shrink: 0;
}

.info {
	flex: 1;
	min-width: 0;
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.ownerBadge {
	font-size: 0.8em;
	padding: 2px 8px;
	border-radius: 4px;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
}

.adminBadge {
	font-size: 0.8em;
	padding: 2px 8px;
	border-radius: 4px;
	background: color-mix(in srgb, var(--MI_THEME-accent) 16%, transparent);
	color: var(--MI_THEME-accent);
}

.suspendedBadge {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-size: 0.8em;
	color: var(--MI_THEME-error);
}

.menuBtn {
	padding: 8px;
	border-radius: 50%;
	flex-shrink: 0;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.divider {
	margin: 4px 0;
	border: none;
	border-top: solid 1px var(--MI_THEME-divider);
}

.sectionTitle {
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparentWeak);
	font-weight: bold;
}

.loadMore {
	margin: 4px auto 0;
}
</style>
