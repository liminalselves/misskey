<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="history.length > 0" class="_gaps_s">
	<MkA
		v-for="item in history"
		:key="item.id"
		:class="[$style.message, { [$style.isMe]: item.isMe, [$style.isRead]: item.isRead, [$style.hasUnreadCount]: !item.isMe && !item.isRead && item.unreadCount != null && item.unreadCount > 0 }]"
		class="_panel"
		:to="item.href"
	>
		<template v-if="item.session">
			<MkDriveFileThumbnail
				v-if="item.session.characterAvatar"
				:file="item.session.characterAvatar"
				fit="cover"
				:class="[$style.messageAvatar, $style.agentAvatar]"
			/>
			<div v-else :class="[$style.messageAvatar, $style.roomIconPlaceholder]"><i class="ti ti-robot"></i></div>
			<div :class="$style.messageBody">
				<header :class="$style.messageHeader">
					<span :class="$style.messageHeaderName">{{ item.session.name }}</span>
					<MkTime :time="item.session.lastMessageAt" :class="$style.messageHeaderTime"/>
					<span v-if="!item.isMe && !item.isRead && item.unreadCount != null && item.unreadCount > 0" class="_indicateCounter" :class="$style.unreadBadge">{{ item.unreadCount > 99 ? '99+' : item.unreadCount }}</span>
				</header>
				<div v-if="item.session.lastMessagePreview" :class="$style.messageBodyText">
					<span v-if="item.session.lastMessageRole === 'user'" :class="$style.youSaid">{{ i18n.ts.you }}:</span>{{ item.session.lastMessagePreview }}
				</div>
			</div>
		</template>
		<template v-else>
			<template v-if="item.message.toRoomId">
				<img v-if="item.message.toRoom?.iconUrl" :src="item.message.toRoom.iconUrl" :class="[$style.messageAvatar, $style.roomIcon]" alt="">
				<MkAvatar v-else-if="item.message.toRoom?.owner" :class="$style.messageAvatar" :user="item.message.toRoom.owner" :preview="false"/>
				<div v-else :class="[$style.messageAvatar, $style.roomIconPlaceholder]"><i class="ti ti-users"></i></div>
			</template>
			<MkAvatar v-else-if="item.other" :class="$style.messageAvatar" :user="item.other" indicator :preview="false"/>
			<div v-else :class="[$style.messageAvatar, $style.roomIconPlaceholder]"><i class="ti ti-user"></i></div>
			<div :class="$style.messageBody">
				<header v-if="item.message.toRoom" :class="$style.messageHeader">
					<span :class="$style.messageHeaderName"><i class="ti ti-users"></i> {{ item.message.toRoom.name }}</span>
					<span v-if="item.message.toRoom.isMuted" :class="$style.roomBadge" :title="i18n.ts._chat.mutedBadge"><i class="ti ti-bell-off"></i></span>
					<span v-if="item.message.toRoom.isArchived" :class="$style.roomBadge">{{ i18n.ts._chat.archivedBadge }}</span>
					<MkTime :time="item.message.createdAt" :class="$style.messageHeaderTime"/>
					<span v-if="!item.isMe && !item.isRead && item.unreadCount != null && item.unreadCount > 0" class="_indicateCounter" :class="$style.unreadBadge">{{ item.unreadCount > 99 ? '99+' : item.unreadCount }}</span>
				</header>
				<header v-else :class="$style.messageHeader">
					<MkUserName v-if="item.other" :class="$style.messageHeaderName" :user="item.other"/>
					<MkAcct v-if="item.other" :class="$style.messageHeaderUsername" :user="item.other"/>
					<span v-else :class="$style.messageHeaderName">{{ i18n.ts.unknown }}</span>
					<MkTime :time="item.message.createdAt" :class="$style.messageHeaderTime"/>
					<span v-if="!item.isMe && !item.isRead && item.unreadCount != null && item.unreadCount > 0" class="_indicateCounter" :class="$style.unreadBadge">{{ item.unreadCount > 99 ? '99+' : item.unreadCount }}</span>
				</header>
				<div v-if="item.message.toRoom" :class="[$style.messageBodyText, $style.inlineLayout]">
					<template v-if="!item.isRecalled && !item.isMe && item.message.fromUser">
						<MkUserName :class="$style.inlineSenderName" :user="item.message.fromUser"/>
						<MkAcct :class="$style.inlineSenderAcct" :user="item.message.fromUser"/>
					</template>
					<span v-if="!item.isRecalled && item.isMe" :class="$style.youSaid">{{ i18n.ts.you }}:</span>
					<span :class="$style.messageText">{{ getMessagePreview(item.message) }}</span>
				</div>
				<div v-else :class="$style.messageBodyText"><span v-if="!item.isRecalled && item.isMe" :class="$style.youSaid">{{ i18n.ts.you }}:</span>{{ getMessagePreview(item.message) }}</div>
			</div>
		</template>
	</MkA>
	<div v-if="hasMore" :class="$style.loadMore">
		<button type="button" class="_button" :class="$style.loadMoreButton" :disabled="loadingMore" @click="loadMore">
			<i class="ti ti-chevron-down"></i> {{ loadingMore ? i18n.ts.loading : i18n.ts.loadMore }}
		</button>
	</div>
</div>
<MkLoading v-if="initializing"/>
<MkResult v-else-if="fetchError && history.length === 0" type="error">
	<button type="button" class="_button _buttonPrimary" :class="$style.retryButton" @click="fetchHistory(true)">{{ i18n.ts.retry }}</button>
</MkResult>
<MkResult v-else-if="history.length === 0" type="empty" :text="i18n.ts._chat.noHistory"/>
</template>

<script lang="ts" setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import type { AgentsSessionsListMineResponse } from 'misskey-js/entities.js';
import { useInterval } from '@@/js/use-interval.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { appendCursorPage, mergeCursorTopPage, takeCursorFirstPage } from '@/utility/cursor-page.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { updateCurrentAccountPartial } from '@/accounts.js';
import { useStream } from '@/stream.js';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import { formatRecallNoticeText } from '@/utility/chat-recall.js';

const props = withDefaults(defineProps<{
	/** 是否把智能体会话合并进列表（/chat「全部」页启用；Deck 列、Widget 保持原样） */
	includeAgentSessions?: boolean;
	/** 只展示与用户的私信（/chat「私信」页启用；不含群组与智能体会话） */
	directOnly?: boolean;
	/** 筛选类型：all（全部）/ direct（仅私聊）/ rooms（仅群组） */
	filter?: 'all' | 'direct' | 'rooms';
}>(), {
	includeAgentSessions: false,
	directOnly: false,
	filter: 'all',
});

const $i = ensureSignin();

const effectiveFilter = computed<'all' | 'direct' | 'rooms'>(() => props.directOnly ? 'direct' : props.filter);

/** 历史列表条目：普通私信/群组消息，或智能体会话（合并展示时 session 存在） */
type ChatHistoryItem = {
	id: string;
	isMe: boolean;
	isRead: boolean;
	/** 未读条数；null 表示有未读但条数未知（存量数据无计数） */
	unreadCount: number | null;
	href: string;
} & (
	| {
		session: AgentsSessionsListMineResponse[number];
		message: null;
		other: null;
	}
	| {
		session?: undefined;
		isRecalled: boolean;
		message: Misskey.entities.ChatMessage;
		other: Misskey.entities.ChatMessage['fromUser'] | Misskey.entities.ChatMessage['toUser'] | null;
	}
);

const history = ref<ChatHistoryItem[]>([]);

const initializing = ref(true);
const fetching = ref(false);
const loadingMore = ref(false);
const fetchError = ref(false);

const hasMoreUsers = ref(false);
const hasMoreRooms = ref(false);
const hasMoreAgents = ref(false);
const hasMore = computed(() => hasMoreUsers.value || hasMoreRooms.value || hasMoreAgents.value);

// 概览列表：两侧都显式限定页大小（chat/history 与 agents/sessions/list-mine 均为
// limit/untilId 页面游标裸数组端点），不依赖端点默认值，也避免深翻页串行全量拉取
const HISTORY_PAGE_SIZE = 30;

type AgentSessionRow = AgentsSessionsListMineResponse[number];

const fetchChatHistoryApi = misskeyApi as unknown as (
	endpoint: 'chat/history',
	data: { room: boolean; limit: number; untilId?: string },
	token: string | undefined,
	signal?: AbortSignal,
) => Promise<Misskey.entities.ChatMessage[]>;

const fetchAgentSessionsApi = misskeyApi as unknown as (
	endpoint: 'agents/sessions/list-mine',
	data: { limit?: number; untilId?: string },
	token: string | undefined,
	signal?: AbortSignal,
) => Promise<AgentsSessionsListMineResponse>;

let userMessagesList: Misskey.entities.ChatMessage[] = [];
let roomMessagesList: Misskey.entities.ChatMessage[] = [];
let agentSessionsList: AgentSessionRow[] = [];
let agentSessionsCache: AgentSessionRow[] = [];
let agentSessionsInFlight: Promise<AgentSessionRow[]> | null = null;
let fetchSeq = 0;

function getMessagePreview(message: Misskey.entities.ChatMessage): string {
	if ('recalledAt' in message && message.recalledAt != null) {
		return formatRecallNoticeText(message);
	}
	if (message.text != null && message.text !== '') return message.text;
	if (message.file != null || message.fileId != null) return i18n.ts._chat.attachmentPlaceholder;
	return '';
}

function toChatHistoryItem(m: Misskey.entities.ChatMessage): ChatHistoryItem | null {
	const isRoom = ('toRoomId' in m && m.toRoomId != null) || ('toRoom' in m && m.toRoom != null);
	const peer = isRoom ? null : (m.fromUserId === $i.id ? m.toUser : m.fromUser) ?? null;
	const fallbackPeerId = m.fromUserId === $i.id ? m.toUserId : m.fromUserId;
	const href = isRoom
		? (m.toRoomId ? `/chat/room/${m.toRoomId}` : (m.toRoom ? `/chat/room/${m.toRoom.id}` : null))
		: (peer?.id ? `/chat/user/${peer.id}` : (fallbackPeerId ? `/chat/user/${fallbackPeerId}` : null));
	if (href == null) return null;

	return {
		id: m.id,
		isRecalled: 'recalledAt' in m && m.recalledAt != null,
		message: m,
		other: peer,
		isMe: m.fromUserId === $i.id,
		isRead: m.isRead === true,
		unreadCount: m.unreadCount ?? null,
		href,
	};
}

function rebuildHistory() {
	const chatItems = [...userMessagesList, ...roomMessagesList]
		.map(toChatHistoryItem)
		.filter((item): item is ChatHistoryItem => item != null);

	// 智能体会话与私信合并展示：按最后活动时间统一排序。
	// 未读光标只按 hasUnread 判定（与「智能体」标签页一致）；lastMessageRole 仅用于「你:」前缀展示，
	// 不参与 isMe（否则会话最后一条是用户消息时会错误隐藏未读光标）
	const agentItems: ChatHistoryItem[] = agentSessionsList.map(s => ({
		id: s.id,
		message: null,
		other: null,
		isMe: false,
		isRead: !s.hasUnread,
		unreadCount: s.unreadCount,
		href: `/chat/agent/${s.id}`,
		session: s,
	}));

	history.value = [...chatItems, ...agentItems]
		.toSorted((a, b) => {
			const timeOf = (item: ChatHistoryItem) =>
				item.session ? new Date(item.session.lastMessageAt).getTime() : new Date(item.message.createdAt).getTime();
			return timeOf(b) - timeOf(a);
		});
}

function fetchAgentSessions(signal: AbortSignal, untilId?: string): Promise<AgentSessionRow[]> {
	if (untilId != null) {
		return fetchAgentSessionsApi('agents/sessions/list-mine', { limit: HISTORY_PAGE_SIZE + 1, untilId }, undefined, signal);
	}
	if (agentSessionsInFlight != null) return agentSessionsInFlight;
	// 新参数未进 misskey-js 类型，按惯例组件内强转
	agentSessionsInFlight = fetchAgentSessionsApi('agents/sessions/list-mine', { limit: HISTORY_PAGE_SIZE + 1 }, undefined, signal)
		.then(rows => {
			agentSessionsCache = rows;
			return rows;
		})
		// 失败（含 429 限流、超时中止）保留上次成功数据，不让智能体会话从合并列表中消失
		.catch(() => agentSessionsCache)
		.finally(() => {
			agentSessionsInFlight = null;
		});
	return agentSessionsInFlight;
}

async function fetchHistory(updateGlobalStatus = false) {
	if (fetching.value) return;

	const seq = ++fetchSeq;
	const filterMode = effectiveFilter.value;
	const wantUsers = filterMode === 'all' || filterMode === 'direct';
	const wantRooms = filterMode === 'all' || filterMode === 'rooms';
	const wantAgents = props.includeAgentSessions && filterMode === 'all';

	fetching.value = true;
	fetchError.value = false;

	// 请求不能无限悬置：休眠恢复/网络切换后 TCP 半开会让 fetch 长时间不 settle，
	// fetching 锁将一直被占用，列表在整页刷新前都不再更新
	const abort = new AbortController();
	const abortTimer = window.setTimeout(() => abort.abort(), 20000);

	try {
		const [userMessages, roomMessages, agentSessions] = await Promise.all([
			wantUsers
				? fetchChatHistoryApi('chat/history', { room: false, limit: HISTORY_PAGE_SIZE + 1 }, undefined, abort.signal)
				: Promise.resolve([] as Misskey.entities.ChatMessage[]),
			wantRooms
				? fetchChatHistoryApi('chat/history', { room: true, limit: HISTORY_PAGE_SIZE + 1 }, undefined, abort.signal)
				: Promise.resolve([] as Misskey.entities.ChatMessage[]),
			wantAgents
				// 智能体会话获取失败保留上次数据，不影响私信列表刷新
				? fetchAgentSessions(abort.signal)
				: Promise.resolve([] as AgentsSessionsListMineResponse),
		]);

		if (seq !== fetchSeq) return;

		if (wantUsers) {
			const page = userMessagesList.length > HISTORY_PAGE_SIZE
				? mergeCursorTopPage(userMessagesList, userMessages, HISTORY_PAGE_SIZE, hasMoreUsers.value)
				: takeCursorFirstPage(userMessages, HISTORY_PAGE_SIZE);
			userMessagesList = page.items;
			hasMoreUsers.value = page.hasMore;
		} else {
			userMessagesList = [];
			hasMoreUsers.value = false;
		}

		if (wantRooms) {
			const page = roomMessagesList.length > HISTORY_PAGE_SIZE
				? mergeCursorTopPage(roomMessagesList, roomMessages, HISTORY_PAGE_SIZE, hasMoreRooms.value)
				: takeCursorFirstPage(roomMessages, HISTORY_PAGE_SIZE);
			roomMessagesList = page.items;
			hasMoreRooms.value = page.hasMore;
		} else {
			roomMessagesList = [];
			hasMoreRooms.value = false;
		}

		if (wantAgents) {
			const page = agentSessionsList.length > HISTORY_PAGE_SIZE
				? mergeCursorTopPage(agentSessionsList, agentSessions ?? [], HISTORY_PAGE_SIZE, hasMoreAgents.value)
				: takeCursorFirstPage(agentSessions ?? [], HISTORY_PAGE_SIZE);
			agentSessionsList = page.items;
			hasMoreAgents.value = page.hasMore;
		} else {
			agentSessionsList = [];
			hasMoreAgents.value = false;
		}

		rebuildHistory();

		// 只在明确要求时才更新全局状态（例如用户进入 /chat 页面时）
		// 仅筛选单侧时不拉取全量，无法据此判定全局未读，跳过
		if (updateGlobalStatus && filterMode === 'all') {
			const hasUnread = [...userMessages, ...roomMessages].some(m => m.fromUserId !== $i.id && !m.isRead);
			updateCurrentAccountPartial({ hasUnreadChatMessages: hasUnread });
		}
	} catch {
		if (seq !== fetchSeq) return;
		// 初次加载失败展示错误与重试；后台刷新失败保持现有数据
		if (history.value.length === 0) {
			fetchError.value = true;
		}
	} finally {
		window.clearTimeout(abortTimer);
		// 无论成功失败都复位锁，避免异常时 fetching 永久卡死导致列表不再刷新
		fetching.value = false;
		initializing.value = false;
	}
}

async function loadMore() {
	if (fetching.value || loadingMore.value || !hasMore.value) return;

	const seq = fetchSeq;
	loadingMore.value = true;

	const abort = new AbortController();
	const abortTimer = window.setTimeout(() => abort.abort(), 20000);

	try {
		const userUntilId = userMessagesList.at(-1)?.id;
		const roomUntilId = roomMessagesList.at(-1)?.id;
		const agentUntilId = agentSessionsList.at(-1)?.id;

		const [moreUsers, moreRooms, moreAgents] = await Promise.all([
			hasMoreUsers.value && userUntilId != null
				? fetchChatHistoryApi('chat/history', { room: false, limit: HISTORY_PAGE_SIZE + 1, untilId: userUntilId }, undefined, abort.signal)
				: Promise.resolve(null),
			hasMoreRooms.value && roomUntilId != null
				? fetchChatHistoryApi('chat/history', { room: true, limit: HISTORY_PAGE_SIZE + 1, untilId: roomUntilId }, undefined, abort.signal)
				: Promise.resolve(null),
			hasMoreAgents.value && agentUntilId != null
				? fetchAgentSessions(abort.signal, agentUntilId).catch(() => null)
				: Promise.resolve(null),
		]);

		if (seq !== fetchSeq) return;

		if (moreUsers != null) {
			const page = appendCursorPage(userMessagesList, moreUsers, HISTORY_PAGE_SIZE);
			userMessagesList = page.items;
			hasMoreUsers.value = page.hasMore;
		}
		if (moreRooms != null) {
			const page = appendCursorPage(roomMessagesList, moreRooms, HISTORY_PAGE_SIZE);
			roomMessagesList = page.items;
			hasMoreRooms.value = page.hasMore;
		}
		if (moreAgents != null) {
			const page = appendCursorPage(agentSessionsList, moreAgents, HISTORY_PAGE_SIZE);
			agentSessionsList = page.items;
			hasMoreAgents.value = page.hasMore;
		}

		rebuildHistory();
	} catch {
		// 翻页失败保留现有列表
	} finally {
		window.clearTimeout(abortTimer);
		loadingMore.value = false;
	}
}

watch(effectiveFilter, () => {
	fetchSeq++;
	fetching.value = false;
	userMessagesList = [];
	roomMessagesList = [];
	agentSessionsList = [];
	hasMoreUsers.value = false;
	hasMoreRooms.value = false;
	hasMoreAgents.value = false;
	history.value = [];
	initializing.value = true;
	fetchError.value = false;
	void fetchHistory(false);
});

/** 后台恢复/断网重连时立即刷新列表，不等下一个 10s 轮询 */
function onVisibleOrOnline() {
	if (!window.document.hidden && isActivated) {
		void fetchHistory(false);
	}
}

let isActivated = true;
let hasBeenDeactivated = false;
let activatedTimer: number | null = null;
let agentReadTimer: number | null = null;
let chatReadTimer: number | null = null;
let mainChannel: { dispose: () => void } | null = null;

onDeactivated(() => {
	isActivated = false;
	hasBeenDeactivated = true;
	if (activatedTimer != null) {
		window.clearTimeout(activatedTimer);
		activatedTimer = null;
	}
});

useInterval(() => {
	// TODO: DOM的にバックグラウンドになっていないかどうかも考慮する
	if (!window.document.hidden && isActivated) {
		void fetchHistory(false); // 定时刷新不更新全局状态
	}
}, 1000 * 10, {
	immediate: false,
	afterMounted: true,
});

onActivated(() => {
	isActivated = true;
	if (!hasBeenDeactivated) return;
	// 用户从缓存外页面返回时延迟刷新列表，确保后端处理 read 信号完成
	if (activatedTimer != null) window.clearTimeout(activatedTimer);
	activatedTimer = window.setTimeout(() => {
		activatedTimer = null;
		void fetchHistory(false);
	}, 200);
});

onMounted(() => {
	void fetchHistory(true); // 初次加载时更新全局状态

	// 监听新消息事件，自动刷新列表
	const stream = useStream();
	const channel = stream.useChannel('main');
	mainChannel = channel;
	channel.on('newChatMessage', () => {
		// 有新消息时刷新列表，但不更新全局状态（由 main-boot.ts 处理）
		void fetchHistory(false);
	});

	// 合并智能体会话时：同步响应消息到达/已读事件，刷新各会话未读标记（与智能体标签页一致）
	if (props.includeAgentSessions) {
		channel.on('newAgentMessage', () => {
			void fetchHistory(false);
		});
		channel.on('agentRead', () => {
			// 延迟刷新列表，确保后端 Redis 操作完成后 API 能返回最新数据
			if (agentReadTimer != null) window.clearTimeout(agentReadTimer);
			agentReadTimer = window.setTimeout(() => {
				agentReadTimer = null;
				void fetchHistory(false);
			}, 150);
		});
	}

	// 监听聊天已读事件
	// 当用户在其他页面阅读消息后，后端发送此事件通知刷新列表
	channel.on('chatRead', data => {
		// 首先立即更新全局未读状态（来自后端，绝对可靠）
		updateCurrentAccountPartial({ hasUnreadChatMessages: data.hasUnreadChatMessages });
		// 延迟刷新列表，确保后端 Redis 操作完成后 API 能返回最新数据
		if (chatReadTimer != null) window.clearTimeout(chatReadTimer);
		chatReadTimer = window.setTimeout(() => {
			chatReadTimer = null;
			void fetchHistory(false);
		}, 150);
	});

	window.document.addEventListener('visibilitychange', onVisibleOrOnline);
	window.addEventListener('online', onVisibleOrOnline);
});

onBeforeUnmount(() => {
	if (activatedTimer != null) window.clearTimeout(activatedTimer);
	if (agentReadTimer != null) window.clearTimeout(agentReadTimer);
	if (chatReadTimer != null) window.clearTimeout(chatReadTimer);
	mainChannel?.dispose();
	mainChannel = null;
	window.document.removeEventListener('visibilitychange', onVisibleOrOnline);
	window.removeEventListener('online', onVisibleOrOnline);
});
</script>

<style lang="scss" module>
.message {
	position: relative;
	display: flex;
	padding: 16px 24px;

	&.isRead,
	&.isMe {
		opacity: 0.8;
	}

	// 条数已知时改显示数字角标（unreadBadge），圆点仅留给条数未知的存量数据
	&:not(.isMe):not(.isRead):not(.hasUnreadCount) {
		&::before {
			content: '';
			position: absolute;
			top: 8px;
			right: 8px;
			width: 8px;
			height: 8px;
			border-radius: 100%;
			background-color: var(--MI_THEME-accent);
		}
	}
}

.unreadBadge {
	flex-shrink: 0;
	margin-left: 6px;
	font-size: 0.72em;
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

.messageAvatar {
	width: 50px;
	height: 50px;
	margin: 0 16px 0 0;
}

.roomIcon {
	object-fit: cover;
	border-radius: 50%;
}

.agentAvatar {
	border-radius: 999px;
	overflow: hidden;
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);

	:global(.root) {
		width: 100%;
		height: 100%;
		border-radius: 999px;
	}
}

.roomIconPlaceholder {
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 24px;
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
	border-radius: 50%;
}

@container (max-width: 500px) {
	.messageAvatar {
		width: 45px;
		height: 45px;
	}
}

@container (max-width: 450px) {
	.messageAvatar {
		width: 40px;
		height: 40px;
	}
}

.messageBody {
	flex: 1;
	min-width: 0;
}

.messageHeader {
	display: flex;
	align-items: center;
	margin-bottom: 2px;
	white-space: nowrap;
	overflow: clip;
}

.messageHeaderName {
	margin: 0;
	padding: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	font-size: 1em;
	font-weight: bold;
}

.messageHeaderSender {
	margin: 0 8px;
	overflow: hidden;
	text-overflow: ellipsis;
}

.messageHeaderUsername {
	margin: 0 8px;
	opacity: 0.7;
}

.messageHeaderTime {
	margin-left: auto;
}

.messageBodyText {
	overflow: hidden;
	overflow-wrap: break-word;
	font-size: 1.1em;
}

.inlineLayout {
	display: flex;
	align-items: baseline;
	gap: 0.5em;
	white-space: nowrap;
}

.inlineSenderName {
	font-weight: bold;
	flex-shrink: 0;
}

.inlineSenderAcct {
	flex-shrink: 0;
	font-size: 0.85em;
	opacity: 0.6;
}

.messageText {
	overflow: hidden;
	text-overflow: ellipsis;
	min-width: 0;
}

.roomBadge {
	flex-shrink: 0;
	margin-left: 6px;
	padding: 1px 6px;
	font-size: 0.72em;
	border-radius: 999px;
	background: var(--MI_THEME-panelHighlight);
	color: var(--MI_THEME-fg);
	opacity: 0.85;
}

.loadMore {
	display: flex;
	justify-content: center;
}

.loadMoreButton,
.retryButton {
	padding: 6px 14px;
	border-radius: 999px;
	font-size: 90%;
}

.loadMoreButton {
	background: var(--MI_THEME-buttonBg);

	&:not(:disabled):hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&:disabled {
		opacity: 0.5;
	}
}

.youSaid {
	font-weight: bold;
	margin-right: 0.5em;
}
</style>
