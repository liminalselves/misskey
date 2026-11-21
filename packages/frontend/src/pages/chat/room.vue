<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader
	v-model:tab="tab"
	:reversed="tab === 'chat'"
	:swipable="false"
	:tabs="headerTabs"
	:actions="headerActions"
	narrowMergedRow
	showBack
>
	<div v-if="tab === 'chat'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<div class="_gaps">
			<!-- 群聊顶部信息条（群头像、置顶消息、群公告、状态横幅） -->
			<div v-if="room && !notMember && (room.iconUrl || room.announcement || room.pinnedMessage || room.isArchived || isCurrentlySuspended)" class="_gaps_s" :class="$style.stickyTopBanners">
				<div v-if="room.iconUrl" :class="$style.roomHeaderStrip">
					<img :src="room.iconUrl" :alt="room.name" :class="$style.roomHeaderIcon"/>
					<div :class="$style.roomHeaderMeta">
						<div :class="$style.roomHeaderName">{{ room.name }}</div>
						<div v-if="room.memberCount != null" :class="$style.roomHeaderSub">{{ i18n.tsx._chat.memberCount({ count: room.memberCount }) }}</div>
					</div>
				</div>

				<MkInfo v-if="room.isArchived" warn>{{ i18n.ts._chat.archivedBanner }}</MkInfo>
				<MkInfo v-if="isCurrentlySuspended" warn>{{ suspensionBannerText }}</MkInfo>

				<div v-if="room.announcement || room.pinnedMessage" class="_panel" :class="$style.pinnedBanner">
					<button
						type="button"
						class="_button"
						:class="$style.pinnedBannerHeader"
						:aria-expanded="bannerExpanded"
						@click="bannerExpanded = !bannerExpanded"
					>
						<span :class="$style.pinnedBannerTitle">
							<i class="ti ti-pinned"></i>
							<span v-if="room.pinnedMessage">{{ i18n.ts._chat.pinnedMessage }}</span>
							<span v-if="room.pinnedMessage && room.announcement">·</span>
							<span v-if="room.announcement">{{ i18n.ts._chat.announcement }}</span>
						</span>
						<i :class="bannerExpanded ? 'ti ti-chevron-up' : 'ti ti-chevron-down'"></i>
					</button>

					<div v-if="bannerExpanded" :class="$style.pinnedBannerBody">
						<div v-if="room.announcement" :class="$style.announcementBox">
							<div :class="$style.announcementLabel"><i class="ti ti-speakerphone"></i> {{ i18n.ts._chat.announcement }}</div>
							<div :class="$style.announcementText">{{ room.announcement }}</div>
						</div>
						<div v-if="room.pinnedMessage" :class="$style.pinnedMsgRow">
							<button
								type="button"
								class="_button"
								:class="$style.pinnedMsgLink"
								@click="handleScrollToMessage(room.pinnedMessage.id)"
							>
								<i class="ti ti-pin"></i>
								<span v-if="room.pinnedMessage.fromUser" :class="$style.pinnedMsgAuthor">
									{{ room.pinnedMessage.fromUser.name || room.pinnedMessage.fromUser.username }}:
								</span>
								<span :class="$style.pinnedMsgText">{{ room.pinnedMessage.text || i18n.ts._chat.attachmentPlaceholder }}</span>
							</button>
							<button
								v-if="canAdminRoom"
								type="button"
								class="_button"
								:class="$style.unpinBtn"
								:aria-label="i18n.ts._chat.unpinMessage"
								:title="i18n.ts._chat.unpinMessage"
								@click="handlePin(null)"
							>
								<i class="ti ti-pinned-off"></i>
							</button>
						</div>
					</div>
				</div>
			</div>

			<Transition
				:enterActiveClass="prefer.s.animation ? $style.fadeEnterActive : ''"
				:leaveActiveClass="prefer.s.animation ? $style.fadeLeaveActive : ''"
				:enterFromClass="prefer.s.animation ? $style.fadeEnterFrom : ''"
				:leaveToClass="prefer.s.animation ? $style.fadeLeaveTo : ''"
			>
				<button v-if="showUnreadJump" type="button" class="_button" :class="$style.unreadJump" @click="onUnreadJumpClick">
					<i class="ti ti-arrow-up"></i> {{ i18n.tsx._chat.unreadCountBanner({ count: unreadSnapshot?.count ?? 0 }) }}
				</button>
			</Transition>

			<div v-if="initializing">
				<MkLoading/>
			</div>

			<!-- 非成员：显示加入群组界面 -->
			<div v-else-if="notMember && room" :class="$style.joinPanel">
				<img v-if="room.iconUrl" :src="room.iconUrl" :alt="room.name" :class="$style.joinAvatar"/>
				<div v-else :class="$style.joinIcon"><i class="ti ti-users"></i></div>
				<div :class="$style.joinName">{{ room.name }}</div>
				<div v-if="room.description" :class="$style.joinDesc">{{ room.description }}</div>
				<div v-if="room.memberCount != null" :class="$style.joinMeta">{{ i18n.tsx._chat.memberCount({ count: room.memberCount }) }}</div>
				<div :class="$style.joinHint">{{ room.isBanned ? (room.banReason || i18n.ts._chat.kickedNotice) : i18n.ts._chat.youAreNotAMemberOfThisRoom }}</div>
				<MkButton
					v-if="!room.isBanned && $i.policies.chatAvailability === 'available'"
					:wait="joining"
					primary
					rounded
					:class="$style.joinButton"
					@click="joinRoom"
				>
					<i class="ti ti-user-plus"></i> {{ i18n.ts._chat.joinThisRoom }}
				</MkButton>
			</div>

			<div v-else-if="messages.length === 0">
				<div class="_gaps" style="text-align: center;">
					<div>{{ i18n.ts._chat.noMessagesYet }}</div>
					<template v-if="user">
						<div v-if="user.chatScope === 'followers'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromFollowers }}</div>
						<div v-else-if="user.chatScope === 'following'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromFollowing }}</div>
						<div v-else-if="user.chatScope === 'mutual'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromMutualFollowing }}</div>
						<div v-else-if="user.chatScope === 'none'">{{ i18n.ts._chat.thisUserNotAllowedChatAnyone }}</div>
					</template>
					<template v-else-if="room && canInvite">
						<div>{{ i18n.ts._chat.inviteUserToChat }}</div>
					</template>
				</div>
			</div>

			<div v-else ref="timelineEl" class="_gaps">
				<div v-if="canFetchMore">
					<MkButton :class="$style.more" :wait="moreFetching" primary rounded @click="fetchMore">{{ i18n.ts.loadMore }}</MkButton>
				</div>

				<TransitionGroup
					:enterActiveClass="prefer.s.animation ? $style.transition_x_enterActive : ''"
					:leaveActiveClass="prefer.s.animation ? $style.transition_x_leaveActive : ''"
					:enterFromClass="prefer.s.animation ? $style.transition_x_enterFrom : ''"
					:leaveToClass="prefer.s.animation ? $style.transition_x_leaveTo : ''"
					:moveClass="prefer.s.animation ? $style.transition_x_move : ''"
					tag="div"
					class="_gaps"
				>
					<template v-for="item in renderedTimeline" :key="item.id">
						<div v-if="item.type === 'unread'" :class="$style.unreadDivider">
							<span>{{ i18n.ts._chat.newMessagesDivider }}</span>
						</div>
						<XMessage
							v-else-if="item.type === 'item'"
							:message="item.data"
							:highlighted="highlightedMessageId === item.data.id"
							:roomOwnerId="room?.ownerId"
							:myRole="room?.myRole"
							:isRoomArchived="Boolean(room?.isArchived)"
							:isRoomSuspended="isCurrentlySuspended"
							:pinnedMessageId="room?.pinnedMessageId"
							:data-message-id="item.data.id"
							@reply="handleReply"
							@edit="handleEdit"
							@pin="handlePin"
							@mention="handleMention"
							@scrollToMessage="handleScrollToMessage"
						/>
						<div v-else-if="item.type === 'date'" :class="$style.dateDivider">
							<span><i class="ti ti-chevron-up"></i> {{ item.nextText }}</span>
							<span style="height: 1em; width: 1px; background: var(--MI_THEME-divider);"></span>
							<span>{{ item.prevText }} <i class="ti ti-chevron-down"></i></span>
						</div>
					</template>
				</TransitionGroup>

				<div v-if="canFetchNewer">
					<MkButton :class="$style.more" :wait="fetchingNewer" primary rounded @click="fetchNewer">{{ i18n.ts.loadMore }}</MkButton>
				</div>
			</div>

			<div v-if="user && (!user.canChat || user.host !== null)">
				<MkInfo warn>{{ i18n.ts._chat.chatNotAvailableInOtherAccount }}</MkInfo>
			</div>

			<MkInfo v-if="$i.policies.chatAvailability !== 'available'" warn>
				{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}
			</MkInfo>
		</div>
	</div>

	<div v-else-if="tab === 'search'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XSearch :userId="userId" :roomId="roomId" :roomOwnerId="room?.ownerId" :room="room" :user="user" @scrollToMessage="handleScrollToMessage"/>
	</div>

	<div v-else-if="tab === 'members'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XMembers
			v-if="room != null"
			ref="membersComponentRef"
			:room="room"
			@inviteUser="inviteUser"
			@mention="handleMention"
			@roomUpdated="onLocalRoomUpdated"
		/>
	</div>

	<div v-else-if="tab === 'info'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XInfo v-if="room != null" :room="room" @updated="onRoomUpdated"/>
	</div>

	<template #footer>
		<div v-if="tab === 'chat' && !notMember" :class="$style.footer">
			<div class="_gaps">
				<div v-if="showScrollToBottom && !showIndicator" :class="$style.scrollFabWrap">
					<button
						type="button"
						class="_button _shadow"
						:class="$style.scrollFab"
						:aria-label="i18n.ts._chat.scrollToBottom"
						:title="i18n.ts._chat.scrollToBottom"
						@click="scrollToBottom"
					>
						<i class="ti ti-arrow-down"></i>
					</button>
				</div>
				<Transition
					:enterActiveClass="prefer.s.animation ? $style.fadeEnterActive : ''"
					:leaveActiveClass="prefer.s.animation ? $style.fadeLeaveActive : ''"
					:enterFromClass="prefer.s.animation ? $style.fadeEnterFrom : ''"
					:leaveToClass="prefer.s.animation ? $style.fadeLeaveTo : ''"
				>
					<div v-show="showIndicator" :class="$style.new">
						<button type="button" class="_buttonPrimary" :class="$style.newButton" @click="onIndicatorClick">
							<i class="fas ti-fw fa-arrow-circle-down" :class="$style.newIcon"></i>{{ i18n.ts._chat.newMessage }}
						</button>
					</div>
				</Transition>
				<XForm
					v-if="initialized"
					ref="formRef"
					:user="user"
					:room="room"
					:replyTo="replyingTo"
					:editingMessage="editingMessage"
					:roomMembers="roomMembers"
					:isSuspended="isCurrentlySuspended"
					:class="$style.form"
					@cancelReply="cancelReply"
					@cancelEdit="cancelEdit"
					@sent="onMessageSent"
					@edited="onMessageEdited"
				/>
			</div>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts">
import * as Misskey from 'misskey-js';

export type NormalizedChatMessage = Omit<Misskey.entities.ChatMessageLite, 'fromUser' | 'reactions'> & {
	fromUser: Misskey.entities.UserLite;
	reactions: (Misskey.entities.ChatMessageLite['reactions'][number] & {
		user: Misskey.entities.UserLite;
	})[];
};

const SHARED_ROOM_METADATA_KEYS = [
	'name',
	'description',
	'iconUrl',
	'isPublic',
	'isArchived',
	'allowMemberInvite',
	'announcement',
	'pinnedMessageId',
	'pinnedMessage',
	'ownerId',
	'owner',
	'memberCount',
] as const;

/**
 * 仅合并群聊共享元信息，绝不覆盖 per-user 字段（isMember / isMuted / invitationExists / myRole / isBanned / banReason / unreadCount）
 */
export function mergeSharedRoomMetadata(
	current: Misskey.entities.ChatRoom,
	payload: Partial<Misskey.entities.ChatRoom>,
): Misskey.entities.ChatRoom {
	const next: Misskey.entities.ChatRoom = { ...current };
	for (const key of SHARED_ROOM_METADATA_KEYS) {
		if (payload[key] !== undefined) {
			(next as Record<string, unknown>)[key] = payload[key];
		}
	}
	return next;
}

export function applyOwnerTransferred(
	current: Misskey.entities.ChatRoom,
	payload: {
		oldOwnerId?: string;
		newOwnerId?: string;
		ownerId?: string;
		newOwner?: Misskey.entities.UserLite;
		owner?: Misskey.entities.UserLite;
	},
	myUserId: string,
): Misskey.entities.ChatRoom {
	const nextOwnerId = payload.newOwnerId ?? payload.ownerId;
	const nextOwner = payload.newOwner ?? payload.owner;
	if (!nextOwnerId) return current;

	let nextRole = current.myRole;
	if (myUserId === nextOwnerId) {
		nextRole = 'owner';
	} else if (myUserId === payload.oldOwnerId || current.ownerId === myUserId) {
		nextRole = 'member';
	}

	return {
		...current,
		ownerId: nextOwnerId,
		owner: nextOwner ?? current.owner,
		myRole: nextRole,
	};
}
</script>

<script lang="ts" setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, useTemplateRef, watch } from 'vue';
import { getScrollContainer } from '@@/js/scroll.js';
import XMessage from './XMessage.vue';
import XForm from './room.form.vue';
import XSearch from './room.search.vue';
import XMembers from './room.members.vue';
import XInfo from './room.info.vue';
import type { MenuItem } from '@/types/menu.js';
import type { PageHeaderItem } from '@/types/page-header.js';
import * as os from '@/os.js';
import { useStream } from '@/stream.js';
import * as sound from '@/utility/sound.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { prefer } from '@/preferences.js';
import MkButton from '@/components/MkButton.vue';
import { useRouter } from '@/router.js';
import { useMutationObserver } from '@/composables/use-mutation-observer.js';
import MkInfo from '@/components/MkInfo.vue';
import { makeDateSeparatedTimelineComputedRef } from '@/utility/timeline-date-separate.js';

const $i = ensureSignin();
const router = useRouter();

const props = defineProps<{
	userId?: string;
	roomId?: string;
	messageId?: string; // 用于定位到特定消息
}>();

const tab = ref('chat');
const initializing = ref(false);
const initialized = ref(false);
const notMember = ref(false);
const joining = ref(false);
const moreFetching = ref(false);
const fetchingNewer = ref(false);
const messages = ref<NormalizedChatMessage[]>([]);
const canFetchMore = ref(false);
const canFetchNewer = ref(false);
const user = ref<Misskey.entities.UserDetailed | null>(null);
const room = ref<Misskey.entities.ChatRoom | null>(null);
const roomMembers = ref<Misskey.entities.UserLite[]>([]);
const mySuspendedUntil = ref<string | null>(null);
const nowMs = ref(Date.now());
const bannerExpanded = ref(true);
const connection = ref<Misskey.IChannelConnection<Misskey.Channels['chatUser']> | Misskey.IChannelConnection<Misskey.Channels['chatRoom']> | null>(null);
const showIndicator = ref(false);
const showScrollToBottom = ref(false);
const timelineEl = useTemplateRef('timelineEl');
const formRef = useTemplateRef('formRef');
const membersComponentRef = useTemplateRef('membersComponentRef');
const timeline = makeDateSeparatedTimelineComputedRef(messages);
const highlightedMessageId = ref<string | null>(null);
let highlightTimeoutId: number | null = null;
let suspensionTimerId: number | null = null;
let scrollFabListenerEl: HTMLElement | null = null;
const replyingTo = ref<{ id: string; text?: string | null } | null>(null);
const editingMessage = ref<{ id: string; text?: string | null } | null>(null);

const isOwner = computed(() => room.value != null && (room.value.ownerId === $i.id || room.value.myRole === 'owner'));
const isAdmin = computed(() => room.value?.myRole === 'admin');
const canAdminRoom = computed(() => isOwner.value || isAdmin.value);
const canInvite = computed(() => room.value != null && (canAdminRoom.value || Boolean(room.value.allowMemberInvite)));

const isCurrentlySuspended = computed(() => {
	if (!mySuspendedUntil.value) return false;
	return new Date(mySuspendedUntil.value).getTime() > nowMs.value;
});

const suspensionBannerText = computed(() => {
	if (!mySuspendedUntil.value) return '';
	const d = new Date(mySuspendedUntil.value);
	if (d.getFullYear() >= 9000) {
		return i18n.ts._chat.suspendedBannerPermanent;
	}
	return i18n.tsx._chat.suspendedBanner({ until: d.toLocaleString() });
});

watch(isCurrentlySuspended, (suspended) => {
	if (suspensionTimerId != null) {
		window.clearInterval(suspensionTimerId);
		suspensionTimerId = null;
	}
	if (suspended) {
		suspensionTimerId = window.setInterval(() => {
			nowMs.value = Date.now();
		}, 15000);
	}
}, { immediate: true });

const renderedTimeline = computed(() => {
	const items = timeline.value.toReversed();
	const firstUnreadId = unreadSnapshot.value?.firstUnreadId;
	if (!firstUnreadId) return items;

	const out: (typeof items[number] | { type: 'unread'; id: string })[] = [];
	for (const item of items) {
		if (item.type === 'item' && item.data.id === firstUnreadId) {
			out.push({ type: 'unread', id: `unread-${item.data.id}` });
		}
		out.push(item);
	}
	return out;
});

/**
 * 进入会话时（read 清除标记之前）抓取的未读快照：
 * count 条数、firstUnreadId 首条未读消息 id。
 * 用于「查看 X 条未读消息」跳转按钮与「以下为新消息」分割线。
 * 条数/首条 id 未知（存量未读数据无计数）时不置位，退化为不展示。
 */
const unreadSnapshot = ref<{ count: number; firstUnreadId: string } | null>(null);
const showUnreadJump = ref(false);
let unreadScrollListenerEl: HTMLElement | null = null;

async function captureUnreadSnapshot(): Promise<void> {
	unreadSnapshot.value = null;
	showUnreadJump.value = false;
	unbindUnreadScrollListener();
	if (!props.userId && !props.roomId) return;
	try {
		const res = await (misskeyApi as unknown as (endpoint: string, data: Record<string, string>) => Promise<{ count: number | null; firstUnreadId: string | null }>)(
			'chat/unread-info',
			props.userId ? { userId: props.userId } : { roomId: props.roomId! },
		);
		if (res.count != null && res.count > 0 && res.firstUnreadId != null) {
			unreadSnapshot.value = { count: res.count, firstUnreadId: res.firstUnreadId };
		}
	} catch {
		// 未读信息获取失败不影响正常聊天
	}
}

/** 消息元素当前是否显示在滚动视口内（fully=true 要求完整可见） */
function isMessageVisibleInTimeline(messageId: string, fully = false): boolean {
	const root = timelineEl.value;
	if (root == null) return false;
	const el = root.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`) as HTMLElement | null;
	if (el == null) return false;
	const container = getScrollContainer(root);
	const elRect = el.getBoundingClientRect();
	const containerRect = container != null ? container.getBoundingClientRect() : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
	return fully
		? elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom
		: elRect.bottom > containerRect.top && elRect.top < containerRect.bottom;
}

function onUnreadScroll() {
	if (!showUnreadJump.value || unreadSnapshot.value == null) return;
	// 用户手动滚动看到首条未读后收起按钮
	if (isMessageVisibleInTimeline(unreadSnapshot.value.firstUnreadId)) {
		showUnreadJump.value = false;
		unbindUnreadScrollListener();
	}
}

function bindUnreadScrollListener() {
	unbindUnreadScrollListener();
	const root = timelineEl.value;
	if (root == null) return;
	const container = getScrollContainer(root);
	if (container == null) return;
	unreadScrollListenerEl = container;
	container.addEventListener('scroll', onUnreadScroll, { passive: true });
}

function unbindUnreadScrollListener() {
	unreadScrollListenerEl?.removeEventListener('scroll', onUnreadScroll);
	unreadScrollListenerEl = null;
}

function onTimelineScroll() {
	const root = timelineEl.value;
	if (!root) {
		showScrollToBottom.value = false;
		return;
	}
	const container = getScrollContainer(root);
	if (!container) {
		showScrollToBottom.value = false;
		return;
	}
	// column-reverse 中向上翻看历史时 scrollTop 为负值
	showScrollToBottom.value = canFetchNewer.value || -container.scrollTop > 300;
}

function bindScrollFabListener() {
	unbindScrollFabListener();
	const root = timelineEl.value;
	if (!root) return;
	const container = getScrollContainer(root);
	if (!container) return;
	scrollFabListenerEl = container;
	container.addEventListener('scroll', onTimelineScroll, { passive: true });
	onTimelineScroll();
}

function unbindScrollFabListener() {
	scrollFabListenerEl?.removeEventListener('scroll', onTimelineScroll);
	scrollFabListenerEl = null;
}

watch(timelineEl, (el) => {
	if (el) {
		bindScrollFabListener();
	} else {
		unbindScrollFabListener();
		showScrollToBottom.value = false;
	}
});

async function evaluateUnreadJump(): Promise<void> {
	if (unreadSnapshot.value == null) return;
	await nextTick();
	await new Promise(resolve => window.setTimeout(resolve, 300));
	const snapshot = unreadSnapshot.value;
	if (snapshot == null || messages.value.length === 0) return;
	showUnreadJump.value = !isMessageVisibleInTimeline(snapshot.firstUnreadId, true);
	if (showUnreadJump.value) bindUnreadScrollListener();
}

async function onUnreadJumpClick() {
	const snapshot = unreadSnapshot.value;
	if (snapshot == null) return;
	showUnreadJump.value = false;
	unbindUnreadScrollListener();
	const isLoaded = () => messages.value.some(m => m.id === snapshot.firstUnreadId);
	let guard = 0;
	while (!isLoaded() && canFetchMore.value && guard < 20) {
		await fetchMore();
		guard++;
		const tail = messages.value[messages.value.length - 1];
		if (!isLoaded() && (tail == null || tail.id < snapshot.firstUnreadId)) return;
	}
	await scrollToMessage(snapshot.firstUnreadId);
}

const SCROLL_HEAD_THRESHOLD = 200;

useMutationObserver(timelineEl, {
	subtree: true,
	childList: true,
	attributes: false,
}, () => {
	if (canFetchNewer.value) return;

	const scrollContainer = getScrollContainer(timelineEl.value)!;
	if (-scrollContainer.scrollTop < SCROLL_HEAD_THRESHOLD) {
		scrollContainer.scrollTo({
			top: 0,
			behavior: 'instant',
		});
	}
});

function normalizeMessage(message: Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage): NormalizedChatMessage {
	return {
		...message,
		fromUser: message.fromUser ?? (message.fromUserId === $i.id ? $i : user.value!),
		reactions: message.reactions.map(record => ({
			...record,
			user: record.user ?? (message.fromUserId === $i.id ? user.value! : $i),
		})),
	};
}

function handleReply(message: NormalizedChatMessage | Misskey.entities.ChatMessage) {
	editingMessage.value = null;
	replyingTo.value = {
		id: message.id,
		text: message.text,
	};
	formRef.value?.focus();
}

function cancelReply() {
	replyingTo.value = null;
}

function handleEdit(message: NormalizedChatMessage | Misskey.entities.ChatMessage) {
	replyingTo.value = null;
	editingMessage.value = {
		id: message.id,
		text: message.text,
	};
}

function cancelEdit() {
	editingMessage.value = null;
}

function handleMention(targetUser: Misskey.entities.UserLite) {
	if (tab.value !== 'chat') {
		tab.value = 'chat';
	}
	void nextTick(() => {
		formRef.value?.insertMention(targetUser);
	});
}

async function handlePin(messageId: string | null) {
	if (!room.value) return;
	try {
		const updated = await (os.apiWithDialog as unknown as (ep: string, data: Record<string, unknown>) => Promise<Misskey.entities.ChatRoom>)(
			'chat/rooms/pin-message',
			{
				roomId: room.value.id,
				messageId,
			},
		);
		if (updated) {
			room.value = { ...room.value, ...updated };
		} else {
			room.value = {
				...room.value,
				pinnedMessageId: messageId,
				pinnedMessage: messageId == null ? null : room.value.pinnedMessage,
			};
		}
		os.toast(i18n.ts._chat.saved);
	} catch {
		// apiWithDialog 已显示错误提示
	}
}

function onMessageSent() {
	replyingTo.value = null;
}

function onMessageEdited(editedMsg: Misskey.entities.ChatMessage) {
	editingMessage.value = null;
	applyEditedMessage(editedMsg);
}

function applyEditedMessage(payload: Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage) {
	const idx = messages.value.findIndex(m => m.id === payload.id);
	if (idx !== -1) {
		messages.value[idx] = {
			...messages.value[idx],
			text: payload.text,
			editedAt: payload.editedAt ?? new Date().toISOString(),
		};
	}
	if (room.value?.pinnedMessage && room.value.pinnedMessage.id === payload.id) {
		room.value = {
			...room.value,
			pinnedMessage: {
				...room.value.pinnedMessage,
				text: payload.text,
				editedAt: payload.editedAt ?? room.value.pinnedMessage.editedAt,
			},
		};
	}
}

function onRoomUpdated(payload: Partial<Misskey.entities.ChatRoom>) {
	if (!room.value) return;
	room.value = mergeSharedRoomMetadata(room.value, payload);
}

function onLocalRoomUpdated(updated: Misskey.entities.ChatRoom) {
	if (!room.value) {
		room.value = updated;
		return;
	}
	room.value = {
		...mergeSharedRoomMetadata(room.value, updated),
		...(updated.myRole !== undefined ? { myRole: updated.myRole } : {}),
	};
}

function onOwnerTransferred(payload: Parameters<Misskey.Channels['chatRoom']['events']['ownerTransferred']>[0]) {
	if (room.value) {
		room.value = applyOwnerTransferred(room.value, payload, $i.id);
	}
	void membersComponentRef.value?.refresh();
}

async function loadRoomMembersForFeatures(roomId: string) {
	try {
		const memberships = await misskeyApi('chat/rooms/members', {
			roomId,
			limit: 50,
		});
		roomMembers.value = memberships
			.map(m => m.user)
			.filter((u): u is Misskey.entities.UserLite => u != null);
		const mine = memberships.find(m => m.userId === $i.id);
		mySuspendedUntil.value = mine?.suspendedUntil ?? null;
		nowMs.value = Date.now();
	} catch {
		// 加载失败不阻断聊天主流程
	}
}

// 加载特定消息及其上下文（失败时保留现有消息）
async function loadContext(targetId: string, limit = 20): Promise<boolean> {
	initializing.value = true;

	try {
		const target = await misskeyApi('chat/messages/show', { messageId: targetId });

		let older: Misskey.entities.ChatMessageLite[] = [];
		let newer: Misskey.entities.ChatMessageLite[] = [];

		if (props.userId) {
			[older, newer] = await Promise.all([
				misskeyApi('chat/messages/user-timeline', { userId: props.userId, limit, untilId: targetId }),
				misskeyApi('chat/messages/user-timeline', { userId: props.userId, limit, sinceId: targetId }),
			]);
		} else {
			[older, newer] = await Promise.all([
				misskeyApi('chat/messages/room-timeline', { roomId: props.roomId!, limit, untilId: targetId }),
				misskeyApi('chat/messages/room-timeline', { roomId: props.roomId!, limit, sinceId: targetId }),
			]);
		}

		const normalizedTarget = normalizeMessage(target);
		const normalizedOlder = older.map(x => normalizeMessage(x));
		// sinceId 返回的是 ASC (旧->新)，我们需要 DESC (新->旧)
		const normalizedNewer = newer.map(x => normalizeMessage(x)).reverse();

		messages.value = [...normalizedNewer, normalizedTarget, ...normalizedOlder];
		canFetchMore.value = older.length === limit;
		canFetchNewer.value = newer.length === limit;
		return true;
	} catch (err) {
		console.error(err);
		await os.alert({ type: 'error', text: formatApiError(err) });
		return false;
	} finally {
		initializing.value = false;
	}
}

function bindChatUserEvents(conn: Misskey.IChannelConnection<Misskey.Channels['chatUser']>) {
	conn.on('message', onMessage);
	conn.on('deleted', onDeleted);
	conn.on('react', onReact);
	conn.on('unreact', onUnreact);
	conn.on('edited', applyEditedMessage);
}

function bindChatRoomEvents(conn: Misskey.IChannelConnection<Misskey.Channels['chatRoom']>) {
	conn.on('message', onMessage);
	conn.on('deleted', onDeleted);
	conn.on('react', onReact);
	conn.on('unreact', onUnreact);
	conn.on('edited', applyEditedMessage);
	conn.on('roomUpdated', onRoomUpdated);
	conn.on('roomDeleted', () => {
		connection.value?.dispose();
		connection.value = null;
		void os.alert({ type: 'info', text: i18n.ts._chat.roomDeletedNotice }).then(() => {
			router.push('/chat');
		});
	});
	conn.on('memberJoined', (payload) => {
		if (room.value && room.value.memberCount != null) {
			room.value = { ...room.value, memberCount: room.value.memberCount + 1 };
		}
		if (payload.user && !roomMembers.value.some(u => u.id === payload.user.id)) {
			roomMembers.value.push(payload.user);
		}
		void membersComponentRef.value?.refresh();
	});
	conn.on('memberLeft', (payload) => {
		if (payload.userId === $i.id) {
			connection.value?.dispose();
			connection.value = null;
			router.push('/chat');
			return;
		}
		if (room.value && room.value.memberCount != null && room.value.memberCount > 0) {
			room.value = { ...room.value, memberCount: room.value.memberCount - 1 };
		}
		roomMembers.value = roomMembers.value.filter(u => u.id !== payload.userId);
		void membersComponentRef.value?.refresh();
	});
	conn.on('memberKicked', (payload) => {
		if (payload.userId === $i.id) {
			connection.value?.dispose();
			connection.value = null;
			notMember.value = true;
			if (room.value) {
				room.value = { ...room.value, isMember: false, myRole: null };
			}
			void os.alert({ type: 'warning', text: i18n.ts._chat.kickedNotice });
			return;
		}
		if (room.value && room.value.memberCount != null && room.value.memberCount > 0) {
			room.value = { ...room.value, memberCount: room.value.memberCount - 1 };
		}
		roomMembers.value = roomMembers.value.filter(u => u.id !== payload.userId);
		void membersComponentRef.value?.refresh();
	});
	conn.on('memberBanned', (payload) => {
		if (payload.userId === $i.id) {
			connection.value?.dispose();
			connection.value = null;
			notMember.value = true;
			if (room.value) {
				room.value = {
					...room.value,
					isMember: false,
					myRole: null,
					isBanned: true,
					banReason: payload.reason ?? null,
				};
			}
			void os.alert({ type: 'error', text: i18n.ts._chat.kickedNotice });
			return;
		}
		if (room.value && room.value.memberCount != null && room.value.memberCount > 0) {
			room.value = { ...room.value, memberCount: room.value.memberCount - 1 };
		}
		roomMembers.value = roomMembers.value.filter(u => u.id !== payload.userId);
		void membersComponentRef.value?.refresh();
	});
	conn.on('memberRoleChanged', (payload) => {
		if (payload.userId === $i.id && room.value) {
			room.value = { ...room.value, myRole: payload.role };
		}
		void membersComponentRef.value?.refresh();
	});
	conn.on('memberSuspended', (payload) => {
		if (payload.userId === $i.id) {
			mySuspendedUntil.value = payload.suspendedUntil ?? new Date(9999, 0, 1).toISOString();
			nowMs.value = Date.now();
		}
		void membersComponentRef.value?.refresh();
	});
	conn.on('memberUnsuspended', (payload) => {
		if (payload.userId === $i.id) {
			mySuspendedUntil.value = null;
		}
		void membersComponentRef.value?.refresh();
	});
	conn.on('ownerTransferred', onOwnerTransferred);
	conn.on('pinnedMessageUpdated', (payload) => {
		if (!room.value) return;
		room.value = {
			...room.value,
			pinnedMessageId: payload.pinnedMessageId,
			pinnedMessage: payload.pinnedMessage ?? null,
		};
	});
}

async function initialize() {
	const LIMIT = 20;

	if (initializing.value) return;

	initializing.value = true;
	initialized.value = false;
	canFetchNewer.value = false;
	notMember.value = false;

	try {
		if (props.userId) {
			// 先抓取未读快照，严格先于 timeline / read 清除未读计数
			const [u] = await Promise.all([
				misskeyApi('users/show', { userId: props.userId }),
				props.messageId ? Promise.resolve() : captureUnreadSnapshot(),
			]);
			user.value = u;

			connection.value?.dispose();
			const userConn = useStream().useChannel('chatUser', {
				otherId: user.value.id,
			});
			connection.value = userConn;
			bindChatUserEvents(userConn);

			window.document.removeEventListener('visibilitychange', onVisibilitychange);
			window.document.addEventListener('visibilitychange', onVisibilitychange);

			if (props.messageId) {
				const ok = await loadContext(props.messageId);
				initialized.value = true;
				if (!canFetchNewer.value) {
					(connection.value as any).send('read', {});
					void markAsRead();
				}
				if (ok) {
					await new Promise(resolve => window.setTimeout(resolve, 300));
					await scrollToMessage(props.messageId);
				}
				return;
			}

			const m = await misskeyApi('chat/messages/user-timeline', { userId: props.userId, limit: LIMIT });
			messages.value = m.map(x => normalizeMessage(x));
			canFetchMore.value = messages.value.length === LIMIT;

			(connection.value as any).send('read', {});
			void markAsRead();
		} else if (props.roomId) {
			let r: Misskey.entities.ChatRoomsShowResponse;
			try {
				r = await misskeyApi('chat/rooms/show', { roomId: props.roomId });
			} catch (err: any) {
				if (err?.code === 'ACCESS_DENIED') {
					await os.alert({
						type: 'error',
						text: i18n.ts.permissionDeniedError,
					});
				} else if (err?.code === 'NO_SUCH_ROOM') {
					await os.alert({
						type: 'error',
						text: i18n.ts.noSuchRoom,
					});
				} else {
					await os.alert({
						type: 'error',
						text: formatApiError(err),
					});
				}
				router.push('/chat');
				return;
			}

			if (r.invitationExists && !r.isBanned) {
				const confirm = await os.confirm({
					type: 'question',
					title: r.name,
					text: i18n.ts._chat.youAreNotAMemberOfThisRoomButInvited + '\n' + i18n.ts._chat.doYouAcceptInvitation,
				});
				if (confirm.canceled) {
					router.push('/chat');
					return;
				}
				try {
					await os.apiWithDialog('chat/rooms/join', { roomId: r.id });
				} catch {
					// apiWithDialog 已弹窗提示，避免外层 catch 重复弹窗
					router.push('/chat');
					return;
				}
				initializing.value = false;
				await initialize();
				return;
			}

			// 非成员（或被封禁）：显示加入/提示界面，不加载消息
			if (!r.isMember || r.isBanned) {
				room.value = r;
				notMember.value = true;
				initialized.value = true;
				return;
			}

			room.value = r;

			// 先抓取未读快照，严格先于 room-timeline / read
			if (!props.messageId) {
				await captureUnreadSnapshot();
			}

			connection.value?.dispose();
			const roomConn = useStream().useChannel('chatRoom', {
				roomId: room.value.id,
			});
			connection.value = roomConn;
			bindChatRoomEvents(roomConn);

			window.document.removeEventListener('visibilitychange', onVisibilitychange);
			window.document.addEventListener('visibilitychange', onVisibilitychange);

			// 并行拉取成员信息（用于 @mention 补全与当前用户禁言状态）
			void loadRoomMembersForFeatures(room.value.id);

			if (props.messageId) {
				const ok = await loadContext(props.messageId);
				initialized.value = true;
				if (!canFetchNewer.value) {
					(connection.value as any).send('read', {});
					void markAsRead();
				}
				if (ok) {
					await new Promise(resolve => window.setTimeout(resolve, 300));
					await scrollToMessage(props.messageId);
				}
				return;
			}

			const m = await misskeyApi('chat/messages/room-timeline', { roomId: props.roomId, limit: LIMIT });
			messages.value = m.map(x => normalizeMessage(x));
			canFetchMore.value = messages.value.length === LIMIT;

			(connection.value as any).send('read', {});
			void markAsRead();
		}

		initialized.value = true;
		void evaluateUnreadJump();
	} catch (err) {
		console.error(err);
		await os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		initializing.value = false;
	}
}

let isActivated = true;

onActivated(() => {
	isActivated = true;
	if (!initialized.value) {
		void initialize();
		return;
	}
	if (connection.value && !window.document.hidden && !canFetchNewer.value) {
		void captureUnreadSnapshot().then(() => {
			if (!isActivated || window.document.hidden) return;
			(connection.value as any)?.send('read', {});
			void markAsRead();
			void evaluateUnreadJump();
		});
	}
});

onDeactivated(() => {
	isActivated = false;
});

watch(() => [props.roomId, props.userId], (nextPair, prevPair) => {
	if (nextPair[0] === prevPair[0] && nextPair[1] === prevPair[1]) return;
	connection.value?.dispose();
	connection.value = null;
	messages.value = [];
	user.value = null;
	room.value = null;
	roomMembers.value = [];
	mySuspendedUntil.value = null;
	notMember.value = false;
	replyingTo.value = null;
	editingMessage.value = null;
	unreadSnapshot.value = null;
	showUnreadJump.value = false;
	showIndicator.value = false;
	showScrollToBottom.value = false;
	canFetchMore.value = false;
	canFetchNewer.value = false;
	tab.value = 'chat';
	void initialize();
});

watch(() => props.messageId, (nextMsgId, prevMsgId) => {
	if (!nextMsgId || nextMsgId === prevMsgId || !initialized.value || notMember.value) return;
	void handleScrollToMessage(nextMsgId);
});

async function fetchMore() {
	const LIMIT = 30;

	if (moreFetching.value || messages.value.length === 0) return;
	moreFetching.value = true;

	try {
		const newMessages = props.userId ? await misskeyApi('chat/messages/user-timeline', {
			userId: user.value!.id,
			limit: LIMIT,
			untilId: messages.value[messages.value.length - 1].id,
		}) : await misskeyApi('chat/messages/room-timeline', {
			roomId: room.value!.id,
			limit: LIMIT,
			untilId: messages.value[messages.value.length - 1].id,
		});

		const existingIds = new Set(messages.value.map(m => m.id));
		messages.value.push(...newMessages.filter(x => !existingIds.has(x.id)).map(x => normalizeMessage(x)));

		canFetchMore.value = newMessages.length === LIMIT;
	} catch (err) {
		console.error(err);
		await os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		moreFetching.value = false;
	}
}

// 加载更新的消息
async function fetchNewer() {
	const LIMIT = 30;
	if (fetchingNewer.value) return;
	fetchingNewer.value = true;

	const sinceId = messages.value[0]?.id;
	if (!sinceId) {
		fetchingNewer.value = false;
		return;
	}

	try {
		const newMessages = props.userId
			? await misskeyApi('chat/messages/user-timeline', {
				userId: user.value!.id,
				limit: LIMIT,
				sinceId,
			})
			: await misskeyApi('chat/messages/room-timeline', {
				roomId: room.value!.id,
				limit: LIMIT,
				sinceId,
			});

		if (newMessages.length > 0) {
			const existingIds = new Set(messages.value.map(m => m.id));
			const reversed = newMessages
				.filter(x => !existingIds.has(x.id))
				.map(x => normalizeMessage(x))
				.reverse();
			messages.value.unshift(...reversed);
		}

		if (newMessages.length < LIMIT) {
			canFetchNewer.value = false;
			showIndicator.value = false;
		} else {
			canFetchNewer.value = true;
		}
	} catch (err) {
		console.error(err);
		await os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		fetchingNewer.value = false;
	}
}

// 滚动到指定消息
async function scrollToMessage(targetMessageId: string) {
	if (highlightTimeoutId !== null) {
		window.clearTimeout(highlightTimeoutId);
		highlightTimeoutId = null;
	}
	highlightedMessageId.value = null;

	const performScrollAndHighlight = (targetEl: HTMLElement) => {
		targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

		highlightTimeoutId = window.setTimeout(() => {
			highlightedMessageId.value = targetMessageId;
			highlightTimeoutId = window.setTimeout(() => {
				highlightedMessageId.value = null;
				highlightTimeoutId = null;
			}, 1000);
		}, 500);
	};

	const tryScrollToElement = async (retryCount = 0): Promise<boolean> => {
		const escaped = CSS.escape(targetMessageId);
		const targetEl = (timelineEl.value?.querySelector(`[data-message-id="${escaped}"]`)
			?? window.document.querySelector(`[data-message-id="${escaped}"]`)) as HTMLElement | null;
		if (targetEl) {
			performScrollAndHighlight(targetEl);
			return true;
		}
		if (retryCount < 3) {
			await new Promise(resolve => window.setTimeout(resolve, 100));
			return tryScrollToElement(retryCount + 1);
		}
		return false;
	};

	if (await tryScrollToElement()) {
		return;
	}

	if (messages.value.some(m => m.id === targetMessageId)) {
		await nextTick();
		if (await tryScrollToElement()) {
			return;
		}
	}

	const loaded = await loadContext(targetMessageId);
	if (!loaded) return;
	await nextTick();
	await tryScrollToElement();
}

// 处理从搜索结果或引用点击定位的事件
async function handleScrollToMessage(messageId: string) {
	tab.value = 'chat';
	await nextTick();
	await scrollToMessage(messageId);
}

// 标记为已读
async function markAsRead() {
	await new Promise(resolve => window.setTimeout(resolve, 100));

	if (!window.document.hidden && isActivated) {
		try {
			if (props.userId) {
				await misskeyApi('chat/read', { userId: props.userId });
			} else if (props.roomId) {
				await misskeyApi('chat/read', { roomId: props.roomId });
			}
		} catch (err) {
			console.error('Failed to mark as read:', err);
		}
	}
}

function onMessage(message: Misskey.entities.ChatMessageLite) {
	if (messages.value.some(m => m.id === message.id)) return;

	sound.playMisskeySfx('chatMessage');

	if (canFetchNewer.value) {
		showIndicator.value = true;
		return;
	}

	messages.value.unshift(normalizeMessage(message));

	if (message.fromUserId !== $i.id && !window.document.hidden && isActivated) {
		connection.value?.send('read', {
			id: message.id,
		});
		void markAsRead();
	}
}

function onDeleted(id: string) {
	const index = messages.value.findIndex(m => m.id === id);
	if (index !== -1) {
		messages.value.splice(index, 1);
	}
	if (room.value?.pinnedMessageId === id) {
		room.value = { ...room.value, pinnedMessageId: null, pinnedMessage: null };
	}
}

function onReact(ctx: Parameters<Misskey.Channels['chatUser']['events']['react']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['react']>[0]) {
	const message = messages.value.find(m => m.id === ctx.messageId);
	if (!message) return;

	const reactor = room.value == null
		? (ctx.user ?? (message.fromUserId === $i.id ? user.value! : $i))
		: ctx.user;
	if (!reactor) return;

	if (message.reactions.some(r => r.reaction === ctx.reaction && r.user.id === reactor.id)) return;

	message.reactions.push({
		reaction: ctx.reaction,
		user: reactor,
	});
}

function onUnreact(ctx: Parameters<Misskey.Channels['chatUser']['events']['unreact']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['unreact']>[0]) {
	const message = messages.value.find(m => m.id === ctx.messageId);
	if (!message) return;

	const reactorId = ctx.user?.id ?? (message.fromUserId === $i.id ? user.value?.id : $i.id);
	if (!reactorId) return;

	const index = message.reactions.findIndex(r => r.reaction === ctx.reaction && r.user.id === reactorId);
	if (index !== -1) {
		message.reactions.splice(index, 1);
	}
}

function scrollToBottom() {
	if (canFetchNewer.value) {
		void onIndicatorClick();
		return;
	}
	if (timelineEl.value) {
		const scrollContainer = getScrollContainer(timelineEl.value);
		scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
	}
}

async function onIndicatorClick() {
	if (canFetchNewer.value) {
		showIndicator.value = false;
		unreadSnapshot.value = null;
		showUnreadJump.value = false;
		initializing.value = true;
		try {
			const LIMIT = 20;
			const m = props.userId
				? await misskeyApi('chat/messages/user-timeline', { userId: props.userId, limit: LIMIT })
				: await misskeyApi('chat/messages/room-timeline', { roomId: props.roomId!, limit: LIMIT });
			messages.value = m.map(x => normalizeMessage(x));
			canFetchMore.value = messages.value.length === LIMIT;
			canFetchNewer.value = false;
			await nextTick();
			if (timelineEl.value) {
				const scrollContainer = getScrollContainer(timelineEl.value);
				scrollContainer?.scrollTo({ top: 0, behavior: 'instant' });
			}
		} catch (err) {
			console.error(err);
			await os.alert({ type: 'error', text: formatApiError(err) });
		} finally {
			initializing.value = false;
		}
	} else {
		showIndicator.value = false;
		if (timelineEl.value) {
			const scrollContainer = getScrollContainer(timelineEl.value);
			scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}
}

function onVisibilitychange() {
	if (window.document.hidden) return;
	if (connection.value && isActivated && initialized.value && !canFetchNewer.value) {
		void captureUnreadSnapshot().then(() => {
			if (window.document.hidden || !isActivated || !connection.value) return;
			(connection.value as any).send('read', {});
			void markAsRead();
			void evaluateUnreadJump();
		});
	}
}

onMounted(() => {
	void initialize();
});

onBeforeUnmount(() => {
	if (highlightTimeoutId !== null) {
		window.clearTimeout(highlightTimeoutId);
		highlightTimeoutId = null;
	}
	if (suspensionTimerId !== null) {
		window.clearInterval(suspensionTimerId);
		suspensionTimerId = null;
	}
	connection.value?.dispose();
	connection.value = null;
	unbindUnreadScrollListener();
	unbindScrollFabListener();
	window.document.removeEventListener('visibilitychange', onVisibilitychange);
});

function selectUserOrCancel(): Promise<Misskey.entities.UserDetailed | null> {
	return new Promise((resolve) => {
		let settled = false;
		let disposeFn: (() => void) | null = null;
		const finish = (selected: Misskey.entities.UserDetailed | null) => {
			if (settled) return;
			settled = true;
			resolve(selected);
		};
		os.popupAsyncWithDialog(import('@/components/MkUserSelectDialog.vue').then(x => x.default), {
			includeSelf: false,
			localOnly: true,
		}, {
			ok: (selected: Misskey.entities.UserDetailed) => finish(selected),
			cancel: () => finish(null),
			closed: () => {
				disposeFn?.();
				finish(null);
			},
		}).then(d => {
			disposeFn = d.dispose;
		}).catch(() => finish(null));
	});
}

async function inviteUser() {
	if (room.value == null) return;

	const invitee = await selectUserOrCancel();
	if (invitee == null) return;

	try {
		await os.apiWithDialog('chat/rooms/invitations/create', {
			roomId: room.value.id,
			userId: invitee.id,
		});
		os.toast(i18n.ts._chat.saved);
		await membersComponentRef.value?.refresh();
	} catch {
		// apiWithDialog 已显示错误提示
	}
}

async function joinRoom() {
	if (room.value == null || joining.value) return;
	joining.value = true;
	try {
		await os.apiWithDialog('chat/rooms/join', { roomId: room.value.id });
		notMember.value = false;
		initialized.value = false;
		await initialize();
	} catch {
		// apiWithDialog 已显示错误提示
	} finally {
		joining.value = false;
	}
}

async function leaveRoom() {
	if (room.value == null) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	});
	if (canceled) return;

	try {
		await os.apiWithDialog('chat/rooms/leave', {
			roomId: room.value.id,
		});
		router.push('/chat');
	} catch {
		// apiWithDialog 已显示错误提示
	}
}

async function toggleMuteFromMenu() {
	if (!room.value) return;
	const nextMute = !room.value.isMuted;
	try {
		await os.apiWithDialog('chat/rooms/mute', {
			roomId: room.value.id,
			mute: nextMute,
		});
		room.value = { ...room.value, isMuted: nextMute };
	} catch {
		// apiWithDialog 已显示错误提示
	}
}

function showMenu(ev: PointerEvent) {
	if (!room.value) return;

	const menuItems: MenuItem[] = [{
		text: i18n.ts._chat.muteThisRoom,
		icon: room.value.isMuted ? 'ti ti-bell' : 'ti ti-bell-off',
		active: Boolean(room.value.isMuted),
		action: () => {
			void toggleMuteFromMenu();
		},
	}];

	if (canInvite.value && !room.value.isArchived) {
		menuItems.push({
			text: i18n.ts._chat.inviteUser,
			icon: 'ti ti-user-plus',
			action: () => {
				void inviteUser();
			},
		});
	}

	if (!isOwner.value) {
		menuItems.push({ type: 'divider' });
		menuItems.push({
			text: i18n.ts._chat.leave,
			icon: 'ti ti-door-exit',
			danger: true,
			action: () => {
				void leaveRoom();
			},
		});
	}

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

const headerTabs = computed(() => notMember.value ? [] : room.value ? [{
	key: 'chat',
	title: i18n.ts._chat.messages,
	icon: 'ti ti-messages',
}, {
	key: 'members',
	title: i18n.ts._chat.members,
	icon: 'ti ti-users',
}, {
	key: 'search',
	title: i18n.ts.search,
	icon: 'ti ti-search',
}, {
	key: 'info',
	title: i18n.ts.info,
	icon: 'ti ti-info-circle',
}] : [{
	key: 'chat',
	title: i18n.ts._chat.messages,
	icon: 'ti ti-messages',
}, {
	key: 'search',
	title: i18n.ts.search,
	icon: 'ti ti-search',
}]);

const headerActions = computed<PageHeaderItem[]>(() => {
	if (notMember.value || room.value == null) return [];
	const actions: PageHeaderItem[] = [{
		text: i18n.ts.search,
		icon: 'ti ti-search',
		highlighted: tab.value === 'search',
		handler: () => {
			tab.value = tab.value === 'search' ? 'chat' : 'search';
		},
	}, {
		text: i18n.ts._chat.members,
		icon: 'ti ti-users',
		highlighted: tab.value === 'members',
		handler: () => {
			tab.value = tab.value === 'members' ? 'chat' : 'members';
		},
	}, {
		text: i18n.ts._chat.roomSettings,
		icon: 'ti ti-settings',
		highlighted: tab.value === 'info',
		handler: () => {
			tab.value = tab.value === 'info' ? 'chat' : 'info';
		},
	}];

	if (canInvite.value && !room.value.isArchived) {
		actions.push({
			text: i18n.ts._chat.inviteUser,
			icon: 'ti ti-user-plus',
			handler: () => {
				void inviteUser();
			},
		});
	}

	actions.push({
		text: i18n.ts.menu,
		icon: 'ti ti-dots',
		handler: showMenu,
	});

	return actions;
});

definePage(computed(() => {
	if (initialized.value) {
		if (user.value) {
			return {
				userName: user.value,
				title: user.value.name ?? user.value.username,
				avatar: user.value,
				hideMobileFooter: true,
			};
		} else if (room.value) {
			return {
				title: room.value.name,
				subtitle: room.value.memberCount != null ? i18n.tsx._chat.memberCount({ count: room.value.memberCount }) : undefined,
				icon: 'ti ti-users',
				hideMobileFooter: true,
			};
		} else {
			return {
				title: i18n.ts.directMessage,
				hideMobileFooter: true,
			};
		}
	} else {
		return {
			title: i18n.ts.directMessage,
			hideMobileFooter: true,
		};
	}
}));
</script>

<style lang="scss" module>
.transition_x_move,
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_x_enterFrom,
.transition_x_leaveTo {
	opacity: 0;
	transform: translateY(80px);
}
.transition_x_leaveActive {
	position: absolute;
}

.stickyTopBanners {
	position: sticky;
	top: calc(var(--MI-stickyTop, 0px) + 8px);
	z-index: 4;
}

.roomHeaderStrip {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 12px;
	border-radius: var(--MI-radius);
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.9);
	border: 1px solid var(--MI_THEME-divider);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
}

.roomHeaderIcon {
	width: 32px;
	height: 32px;
	border-radius: 50%;
	object-fit: cover;
	flex-shrink: 0;
}

.roomHeaderMeta {
	min-width: 0;
	flex: 1;
}

.roomHeaderName {
	font-weight: bold;
	font-size: 0.95em;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.roomHeaderSub {
	font-size: 0.8em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.pinnedBanner {
	border: 1px solid var(--MI_THEME-divider);
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.92);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
}

.pinnedBannerHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	padding: 8px 12px;
	font-size: 0.85em;
	font-weight: 600;
	color: var(--MI_THEME-accent);
}

.pinnedBannerTitle {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.pinnedBannerBody {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 0 12px 10px;
	border-top: 1px solid var(--MI_THEME-divider);
	padding-top: 8px;
}

.announcementBox {
	font-size: 0.88em;
}

.announcementLabel {
	display: flex;
	align-items: center;
	gap: 4px;
	font-size: 0.85em;
	font-weight: bold;
	color: var(--MI_THEME-accent);
	margin-bottom: 2px;
}

.announcementText {
	white-space: pre-wrap;
	word-break: break-word;
}

.pinnedMsgRow {
	display: flex;
	align-items: center;
	gap: 8px;
}

.pinnedMsgLink {
	display: flex;
	align-items: center;
	gap: 6px;
	flex: 1;
	min-width: 0;
	text-align: left;
	font-size: 0.88em;
	color: var(--MI_THEME-fg);

	&:hover {
		color: var(--MI_THEME-accent);
	}
}

.pinnedMsgAuthor {
	font-weight: bold;
	flex-shrink: 0;
}

.pinnedMsgText {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	opacity: 0.85;
}

.unpinBtn {
	padding: 4px;
	color: var(--MI_THEME-fgTransparentWeak);
	flex-shrink: 0;

	&:hover {
		color: var(--MI_THEME-error);
	}
}

.more {
	margin: 0 auto;
}

.footer {
	width: 100%;
	padding-top: 8px;
}

.scrollFabWrap {
	display: flex;
	justify-content: flex-end;
	max-width: 700px;
	margin: 0 auto;
	padding: 0 8px;
}

.scrollFab {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 38px;
	height: 38px;
	border-radius: 50%;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	border: 1px solid var(--MI_THEME-divider);

	&:hover {
		color: var(--MI_THEME-accent);
		border-color: var(--MI_THEME-accent);
	}
}

.new {
	width: 100%;
	padding-bottom: 8px;
	text-align: center;
}

.newButton {
	display: inline-block;
	margin: 0;
	padding: 0 12px;
	line-height: 32px;
	font-size: 12px;
	border-radius: 16px;
}

.newIcon {
	display: inline-block;
	margin-right: 8px;
}

.form {
	margin: 0 auto;
	width: 100%;
	max-width: 700px;
	box-sizing: border-box;
	min-width: 0;
}

.fadeEnterActive,
.fadeLeaveActive {
	transition: opacity 0.2s ease;
}

.fadeEnterFrom,
.fadeLeaveTo {
	opacity: 0;
}

.dateDivider {
	display: flex;
	font-size: 85%;
	align-items: center;
	justify-content: center;
	gap: 0.5em;
	opacity: 0.75;
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: 999px;
	width: fit-content;
	padding: 0.5em 1em;
	margin: 0 auto;
}

.unreadDivider {
	width: fit-content;
	margin: 0 auto;
	padding: 0.4em 1em;
	font-size: 85%;
	border-radius: 999px;
	border: solid 0.5px color-mix(in srgb, var(--MI_THEME-accent) 40%, var(--MI_THEME-divider));
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 8%, transparent);
}

.unreadJump {
	position: sticky;
	top: calc(var(--MI-stickyTop, 0px) + 8px);
	z-index: 3;
	align-self: flex-end;
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 6px 12px;
	border-radius: 999px;
	font-size: 0.85em;
	font-weight: 600;
	color: var(--MI_THEME-accent);
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.85);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 36%, var(--MI_THEME-divider));
	box-shadow: 0 2px 10px color-mix(in srgb, var(--MI_THEME-shadow, #000) 25%, transparent);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
}

.joinPanel {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
	max-width: 400px;
	margin: 48px auto 0;
	padding: 40px 32px;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
	border: solid 0.5px var(--MI_THEME-divider);
}

.joinAvatar {
	width: 72px;
	height: 72px;
	border-radius: 50%;
	object-fit: cover;
}

.joinIcon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 72px;
	height: 72px;
	font-size: 32px;
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
	border-radius: 50%;
}

.joinName {
	margin-top: 20px;
	font-size: 1.4em;
	font-weight: bold;
}

.joinDesc {
	margin-top: 8px;
	font-size: 0.95em;
	opacity: 0.7;
}

.joinMeta {
	margin-top: 8px;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.joinHint {
	margin-top: 16px;
	font-size: 0.9em;
	opacity: 0.6;
}

.joinButton {
	margin-top: 24px;
	padding: 8px 24px;
}
</style>
