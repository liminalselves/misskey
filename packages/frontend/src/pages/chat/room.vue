<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :reversed="tab === 'chat'" :tabs="headerTabs" :actions="headerActions" narrowMergedRow showBack>
	<div v-if="tab === 'chat'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<div class="_gaps">
			<div v-if="initializing">
				<MkLoading/>
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
					<template v-else-if="room">
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
					tag="div" class="_gaps"
				>
					<template v-for="item in timeline.toReversed()" :key="item.id">
						<XMessage v-if="item.type === 'item'" :message="item.data" :highlighted="highlightedMessageId === item.data.id" :roomOwnerId="room?.ownerId" :data-message-id="item.data.id" @reply="handleReply" @scrollToMessage="handleScrollToMessage"/>
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

			<MkInfo v-if="$i.policies.chatAvailability !== 'available'" warn>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>
		</div>
	</div>

	<div v-else-if="tab === 'search'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XSearch :userId="userId" :roomId="roomId" @scrollToMessage="handleScrollToMessage"/>
	</div>

	<div v-else-if="tab === 'members'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XMembers v-if="room != null" :room="room" @inviteUser="inviteUser"/>
	</div>

	<div v-else-if="tab === 'info'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XInfo v-if="room != null" :room="room"/>
	</div>

	<template #footer>
		<div v-if="tab === 'chat'" :class="$style.footer">
			<div class="_gaps">
				<Transition name="fade">
					<div v-show="showIndicator" :class="$style.new">
						<button class="_buttonPrimary" :class="$style.newButton" @click="onIndicatorClick">
							<i class="fas ti-fw fa-arrow-circle-down" :class="$style.newIcon"></i>{{ i18n.ts._chat.newMessage }}
						</button>
					</div>
				</Transition>
				<XForm v-if="initialized" :user="user" :room="room" :replyTo="replyingTo" :class="$style.form" @cancelReply="cancelReply" @sent="onMessageSent"/>
			</div>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, computed, onMounted, onBeforeUnmount, onDeactivated, onActivated, nextTick } from 'vue';
import * as Misskey from 'misskey-js';
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
import { misskeyApi } from '@/utility/misskey-api.js';
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

export type NormalizedChatMessage = Omit<Misskey.entities.ChatMessageLite, 'fromUser' | 'reactions'> & {
	fromUser: Misskey.entities.UserLite;
	reactions: (Misskey.entities.ChatMessageLite['reactions'][number] & {
		user: Misskey.entities.UserLite;
	})[];
};

const initializing = ref(false);
const initialized = ref(false);
const moreFetching = ref(false);
const fetchingNewer = ref(false);
const messages = ref<NormalizedChatMessage[]>([]);
const canFetchMore = ref(false);
const canFetchNewer = ref(false);
const user = ref<Misskey.entities.UserDetailed | null>(null);
const room = ref<Misskey.entities.ChatRoom | null>(null);
const connection = ref<Misskey.IChannelConnection<Misskey.Channels['chatUser']> | Misskey.IChannelConnection<Misskey.Channels['chatRoom']> | null>(null);
const showIndicator = ref(false);
const timelineEl = useTemplateRef('timelineEl');
const timeline = makeDateSeparatedTimelineComputedRef(messages);
const highlightedMessageId = ref<string | null>(null);
let highlightTimeoutId: number | null = null; // 防抖用
const replyingTo = ref<{ id: string; text?: string | null } | null>(null);

const SCROLL_HEAD_THRESHOLD = 200;

// column-reverseなので本来はスクロール位置の最下部への追従は不要なはずだが、おそらくブラウザのバグにより、最下部にスクロールした状態でも追従されない場合がある(スクロール位置が少数になることがあるのが関わっていそう)
// そのため補助としてMutationObserverを使って追従を行う
// そのため補助としてMutationObserverを使って追従を行う
useMutationObserver(timelineEl, {
	subtree: true,
	childList: true,
	attributes: false,
}, () => {
	// 只有在没有加载更多新消息时才自动滚动到底部
	if (canFetchNewer.value) return;

	const scrollContainer = getScrollContainer(timelineEl.value)!;
	// column-reverseなのでscrollTopは負になる
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

// 引用回复处理
function handleReply(message: NormalizedChatMessage | Misskey.entities.ChatMessage) {
	replyingTo.value = {
		id: message.id,
		text: message.text,
	};
}

function cancelReply() {
	replyingTo.value = null;
}

function onMessageSent() {
	replyingTo.value = null;
}

// 加载特定消息及其上下文
async function loadContext(targetId: string, limit = 20) {
	initializing.value = true;
	messages.value = [];

	try {
		const targetParam = { messageId: targetId };
		const target = await misskeyApi('chat/messages/show', targetParam);

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
		// sinceId 返回的是 ASC (旧->新)，我们需要 DESC (新->旧) 以便与 messages 列表（Column Reverse）匹配
		const normalizedNewer = newer.map(x => normalizeMessage(x)).reverse();

		// messages 顺序: [Newer... (Newest First), Target, Older... (Newest First)]
		messages.value = [...normalizedNewer, normalizedTarget, ...normalizedOlder];

		canFetchMore.value = older.length === limit;
		canFetchNewer.value = newer.length === limit;
	} catch (err) {
		console.error(err);
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	} finally {
		initializing.value = false;
	}
}

async function initialize() {
	const LIMIT = 20;

	if (initializing.value) return;

	// 如果有 props.messageId，直接进入上下文加载模式
	if (props.messageId) {
		// 先获取 Room/User 信息以便建立连接
		if (props.userId) {
			user.value = await misskeyApi('users/show', { userId: props.userId });
			connection.value = useStream().useChannel('chatUser', { otherId: user.value!.id });
		} else if (props.roomId) {
			const r = await misskeyApi('chat/rooms/show', { roomId: props.roomId });
			room.value = r;
			connection.value = useStream().useChannel('chatRoom', { roomId: room.value.id });
		}

		if (connection.value) {
			connection.value.on('message', onMessage);
			connection.value.on('deleted', onDeleted);
			connection.value.on('react', onReact);
			connection.value.on('unreact', onUnreact);
		}

		await loadContext(props.messageId);
		initialized.value = true;

		// 滚动到该消息
		await new Promise(resolve => window.setTimeout(resolve, 300));
		await scrollToMessage(props.messageId);
		return;
	}

	initializing.value = true;
	initialized.value = false;
	canFetchNewer.value = false;

	if (props.userId) {
		const [u, m] = await Promise.all([
			misskeyApi('users/show', { userId: props.userId }),
			misskeyApi('chat/messages/user-timeline', { userId: props.userId, limit: LIMIT }),
		]);

		user.value = u;
		messages.value = m.map(x => normalizeMessage(x));

		if (messages.value.length === LIMIT) {
			canFetchMore.value = true;
		}

		connection.value = useStream().useChannel('chatUser', {
			otherId: user.value.id,
		});
		connection.value.on('message', onMessage);
		connection.value.on('deleted', onDeleted);
		connection.value.on('react', onReact);
		connection.value.on('unreact', onUnreact);

		// 打开对话页面时立即发送 read 信号，标记该对话的消息为已读
		// 这样后端会更新已读状态并发送 chatRead 事件
		// 使用类型断言：后端实际上不需要 id 参数
		(connection.value as any).send('read', {});
		markAsRead(); // 调用 API 强制标记已读
	} else if (props.roomId) {
		const [rResult, mResult] = await Promise.allSettled([
			misskeyApi('chat/rooms/show', { roomId: props.roomId }),
			misskeyApi('chat/messages/room-timeline', { roomId: props.roomId, limit: LIMIT }),
		]);

		if (rResult.status === 'rejected') {
			const error = rResult.reason as any;
			if (error?.code === 'ACCESS_DENIED') {
				os.alert({
					type: 'error',
					text: i18n.ts.permissionDeniedError as string,
				});
			} else if (error?.code === 'NO_SUCH_ROOM') {
				os.alert({
					type: 'error',
					text: i18n.ts.noSuchRoom as string ?? 'No such room',
				});
			} else {
				os.alert({
					type: 'error',
					text: i18n.ts.somethingHappened,
				});
			}
			initializing.value = false;
			router.push('/chat');
			return;
		}

		const r = rResult.value as Misskey.entities.ChatRoomsShowResponse;

		if (r.invitationExists) {
			const confirm = await os.confirm({
				type: 'question',
				title: r.name,
				text: i18n.ts._chat.youAreNotAMemberOfThisRoomButInvited + '\n' + i18n.ts._chat.doYouAcceptInvitation,
			});
			if (confirm.canceled) {
				initializing.value = false;
				router.push('/chat');
				return;
			} else {
				await os.apiWithDialog('chat/rooms/join', { roomId: r.id });
				initializing.value = false;
				initialize();
				return;
			}
		}

		const m = mResult.status === 'fulfilled' ? mResult.value as Misskey.entities.ChatMessagesRoomTimelineResponse : [];

		room.value = r;
		messages.value = m.map(x => normalizeMessage(x));

		if (messages.value.length === LIMIT) {
			canFetchMore.value = true;
		}

		connection.value = useStream().useChannel('chatRoom', {
			roomId: room.value.id,
		});
		connection.value.on('message', onMessage);
		connection.value.on('deleted', onDeleted);
		connection.value.on('react', onReact);
		connection.value.on('unreact', onUnreact);

		// 打开对话页面时立即发送 read 信号，标记该对话的消息为已读
		// 这样后端会更新已读状态并发送 chatRead 事件
		// 使用类型断言：后端实际上不需要 id 参数
		(connection.value as any).send('read', {});
		markAsRead(); // 调用 API 强制标记已读
	}

	window.document.addEventListener('visibilitychange', onVisibilitychange);

	initialized.value = true;
	initializing.value = false;
}

let isActivated = true;

onActivated(() => {
	isActivated = true;
	// 用户从其他页面返回时，发送 read 信号标记该对话为已读
	if (connection.value && !window.document.hidden) {
		(connection.value as any).send('read', {});
	}
});

onDeactivated(() => {
	isActivated = false;
});

async function fetchMore() {
	const LIMIT = 30;

	moreFetching.value = true;

	const newMessages = props.userId ? await misskeyApi('chat/messages/user-timeline', {
		userId: user.value!.id,
		limit: LIMIT,
		untilId: messages.value[messages.value.length - 1].id,
	}) : await misskeyApi('chat/messages/room-timeline', {
		roomId: room.value!.id,
		limit: LIMIT,
		untilId: messages.value[messages.value.length - 1].id,
	});

	messages.value.push(...newMessages.map(x => normalizeMessage(x)));

	canFetchMore.value = newMessages.length === LIMIT;
	moreFetching.value = false;
}

// 加载更新的消息
async function fetchNewer() {
	const LIMIT = 30;
	if (fetchingNewer.value) return;
	fetchingNewer.value = true;

	// 获取当前列表最新消息 ID
	const sinceId = messages.value[0]?.id;
	if (!sinceId) {
		fetchingNewer.value = false;
		return;
	}

	let newMessages: Misskey.entities.ChatMessageLite[] = [];

	if (props.userId) {
		newMessages = await misskeyApi('chat/messages/user-timeline', {
			userId: user.value!.id,
			limit: LIMIT,
			sinceId: sinceId,
		});
	} else {
		newMessages = await misskeyApi('chat/messages/room-timeline', {
			roomId: room.value!.id,
			limit: LIMIT,
			sinceId: sinceId,
		});
	}

	if (newMessages.length > 0) {
		// NewMessages 是 Newest First.
		// Messages 列表也是 Newest First.
		// 所以直接 unshift 进去
		// NewMessages 是 ASC (旧->新)，我们需要反转为 DESC (新->旧)
		const reversed = newMessages.map(x => normalizeMessage(x)).reverse();
		messages.value.unshift(...reversed);
	}

	// 如果返回数量少于 Limit，说明已经到达最顶端（最新），没有更多 gap 了
	if (newMessages.length < LIMIT) {
		canFetchNewer.value = false;
		showIndicator.value = false;
	} else {
		canFetchNewer.value = true;
	}

	fetchingNewer.value = false;
}

// 滚动到指定消息
async function scrollToMessage(targetMessageId: string) {
	// 清除旧的高光 timeout
	if (highlightTimeoutId !== null) {
		window.clearTimeout(highlightTimeoutId);
		highlightTimeoutId = null;
	}
	highlightedMessageId.value = null;

	// 辅助函数：执行滚动和高光
	const performScrollAndHighlight = (targetEl: HTMLElement) => {
		// 强制执行滚动（即使元素已在视口内也执行）
		targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

		// 等待滚动动画完成后（约500ms）开始高光，持续1秒
		highlightTimeoutId = window.setTimeout(() => {
			highlightedMessageId.value = targetMessageId;
			highlightTimeoutId = window.setTimeout(() => {
				highlightedMessageId.value = null;
				highlightTimeoutId = null;
			}, 1000); // 高光持续1秒
		}, 500); // 等待滚动完成
	};

	// 辅助函数：尝试查找元素并滚动
	const tryScrollToElement = async (retryCount = 0): Promise<boolean> => {
		const targetEl = window.document.querySelector(`[data-message-id="${targetMessageId}"]`) as HTMLElement | null;
		if (targetEl) {
			performScrollAndHighlight(targetEl);
			return true;
		}
		// 最多重试3次，每次等待100ms
		if (retryCount < 3) {
			await new Promise(resolve => window.setTimeout(resolve, 100));
			return tryScrollToElement(retryCount + 1);
		}
		return false;
	};

	// 第一步：尝试在当前DOM中查找
	if (await tryScrollToElement()) {
		return;
	}

	// 第二步：检查消息是否在列表中但DOM还没渲染
	const exists = messages.value.some(m => m.id === targetMessageId);
	if (exists) {
		await nextTick();
		if (await tryScrollToElement()) {
			return;
		}
	}

	// 第三步：消息不在当前列表，需要加载上下文
	await loadContext(targetMessageId);
	await nextTick();
	await tryScrollToElement();
}

// 处理从搜索结果或引用点击定位的事件
async function handleScrollToMessage(messageId: string) {
	tab.value = 'chat';
	// 等待 tab 切换完成
	await nextTick();
	// scrollToMessage 已处理消息是否在当前页的逻辑
	await scrollToMessage(messageId);
}

// 标记为已读
async function markAsRead() {
	// 延迟 100ms 以确保后端已经写入了未读标记（双重保障）
	await new Promise(resolve => window.setTimeout(resolve, 100));

	if (!window.document.hidden && isActivated) {
		try {
			if (props.userId) {
				await misskeyApi('chat/read' as any, { userId: props.userId });
			} else if (props.roomId) {
				await misskeyApi('chat/read' as any, { roomId: props.roomId });
			}
		} catch (err) {
			console.error('Failed to mark as read:', err);
		}
	}
}

function onMessage(message: Misskey.entities.ChatMessageLite) {
	sound.playMisskeySfx('chatMessage');

	// 如果我们处于历史模式（canFetchNewer=true），不直接把新消息加进去，而是显示提示
	if (canFetchNewer.value) {
		showIndicator.value = true;
		return;
	}

	messages.value.unshift(normalizeMessage(message));

	// TODO: DOM的にバックグラウンドになっていないかどうかも考慮する
	if (message.fromUserId !== $i.id && !window.document.hidden && isActivated) {
		connection.value?.send('read', {
			id: message.id,
		});
		markAsRead(); // 调用 API 强制标记已读
	}

	if (message.fromUserId !== $i.id) {
		//notifyNewMessage();
	}
}

function onDeleted(id: string) {
	const index = messages.value.findIndex(m => m.id === id);
	if (index !== -1) {
		messages.value.splice(index, 1);
	}
}

function onReact(ctx: Parameters<Misskey.Channels['chatUser']['events']['react']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['react']>[0]) {
	const message = messages.value.find(m => m.id === ctx.messageId);
	if (message) {
		if (room.value == null) { // 1on1の時はuserは省略される
			message.reactions.push({
				reaction: ctx.reaction,
				user: message.fromUserId === $i.id ? user.value! : $i,
			});
		} else {
			message.reactions.push({
				reaction: ctx.reaction,
				user: ctx.user!,
			});
		}
	}
}

function onUnreact(ctx: Parameters<Misskey.Channels['chatUser']['events']['unreact']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['unreact']>[0]) {
	const message = messages.value.find(m => m.id === ctx.messageId);
	if (message) {
		const index = message.reactions.findIndex(r => r.reaction === ctx.reaction && r.user.id === ctx.user!.id);
		if (index !== -1) {
			message.reactions.splice(index, 1);
		}
	}
}

function onIndicatorClick() {
	if (canFetchNewer.value) {
		showIndicator.value = false;
		// 重新初始化以加载最新消息
		initializing.value = true;
		(async () => {
			try {
				const LIMIT = 20;
				let m: Misskey.entities.ChatMessageLite[] = [];
				if (props.userId) {
					m = await misskeyApi('chat/messages/user-timeline', { userId: props.userId, limit: LIMIT });
				} else {
					m = await misskeyApi('chat/messages/room-timeline', { roomId: props.roomId!, limit: LIMIT });
				}
				messages.value = m.map(x => normalizeMessage(x));
				canFetchMore.value = messages.value.length === LIMIT;
				canFetchNewer.value = false;
			} finally {
				initializing.value = false;
			}
		})();
	} else {
		showIndicator.value = false;
		// 滚动到底部（顶部）
		const scrollContainer = getScrollContainer(timelineEl.value!);
		scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
	}
}

function onVisibilitychange() {
	if (window.document.hidden) return;
	// TODO
}

onMounted(() => {
	initialize();
});

onActivated(() => {
	if (!initialized.value) {
		initialize();
	}
});

onBeforeUnmount(() => {
	connection.value?.dispose();
	window.document.removeEventListener('visibilitychange', onVisibilitychange);
});

async function inviteUser() {
	if (room.value == null) return;

	const invitee = await os.selectUser({ includeSelf: false, localOnly: true });
	os.apiWithDialog('chat/rooms/invitations/create', {
		roomId: room.value.id,
		userId: invitee.id,
	});
}

async function leaveRoom() {
	if (room.value == null) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	});
	if (canceled) return;

	misskeyApi('chat/rooms/leave', {
		roomId: room.value.id,
	});
	router.push('/chat');
}

function showMenu(ev: PointerEvent) {
	const menuItems: MenuItem[] = [];

	if (room.value) {
		if (room.value.ownerId === $i.id) {
			menuItems.push({
				text: i18n.ts._chat.inviteUser,
				icon: 'ti ti-user-plus',
				action: () => {
					inviteUser();
				},
			});
		} else {
			menuItems.push({
				text: i18n.ts._chat.leave,
				icon: 'ti ti-x',
				action: () => {
					leaveRoom();
				},
			});
		}
	}

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

const tab = ref('chat');

const headerTabs = computed(() => room.value ? [{
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

const headerActions = computed<PageHeaderItem[]>(() => [{
	icon: 'ti ti-dots',
	handler: showMenu,
}]);

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

.root {
}

.more {
	margin: 0 auto;
}

.footer {
	width: 100%;
	padding-top: 8px;
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

.footer {

}

.form {
	margin: 0 auto;
	width: 100%;
	max-width: 700px;
	box-sizing: border-box;
	min-width: 0;
}

.fade-enter-active, .fade-leave-active {
	transition: opacity 0.1s;
}

.fade-enter-from, .fade-leave-to {
	transition: opacity 0.5s;
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
</style>
