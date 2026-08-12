<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="history.length > 0" class="_gaps_s">
	<MkA
		v-for="item in history"
		:key="item.id"
		:class="[$style.message, { [$style.isMe]: item.isMe, [$style.isRead]: item.isRead }]"
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
				</header>
				<div v-if="item.session.lastMessagePreview" :class="$style.messageBodyText">
					<span v-if="item.session.lastMessageRole === 'user'" :class="$style.youSaid">{{ i18n.ts.you }}:</span>{{ item.session.lastMessagePreview }}
				</div>
			</div>
		</template>
		<template v-else>
			<template v-if="item.message.toRoomId">
				<img v-if="(item.message.toRoom as any)?.iconUrl" :src="(item.message.toRoom as any).iconUrl" :class="[$style.messageAvatar, $style.roomIcon]"/>
				<div v-else :class="[$style.messageAvatar, $style.roomIconPlaceholder]"><i class="ti ti-users"></i></div>
			</template>
			<MkAvatar v-else-if="item.other" :class="$style.messageAvatar" :user="item.other" indicator :preview="false"/>
			<div :class="$style.messageBody">
				<header v-if="item.message.toRoom" :class="$style.messageHeader">
					<span :class="$style.messageHeaderName"><i class="ti ti-users"></i> {{ item.message.toRoom.name }}</span>
					<MkTime :time="item.message.createdAt" :class="$style.messageHeaderTime"/>
				</header>
				<header v-else :class="$style.messageHeader">
					<MkUserName :class="$style.messageHeaderName" :user="item.other!"/>
					<MkAcct :class="$style.messageHeaderUsername" :user="item.other!"/>
					<MkTime :time="item.message.createdAt" :class="$style.messageHeaderTime"/>
				</header>
				<div v-if="item.message.toRoom" :class="[$style.messageBodyText, $style.inlineLayout]">
					<template v-if="!item.isMe">
						<MkUserName :class="$style.inlineSenderName" :user="item.message.fromUser"/>
						<MkAcct :class="$style.inlineSenderAcct" :user="item.message.fromUser"/>
					</template>
					<span v-if="item.isMe" :class="$style.youSaid">{{ i18n.ts.you }}:</span>
					<span :class="$style.messageText">{{ item.message.text }}</span>
				</div>
				<div v-else :class="$style.messageBodyText"><span v-if="item.isMe" :class="$style.youSaid">{{ i18n.ts.you }}:</span>{{ item.message.text }}</div>
			</div>
		</template>
	</MkA>
</div>
<MkResult v-if="!initializing && history.length == 0" type="empty" :text="i18n.ts._chat.noHistory"/>
<MkLoading v-if="initializing"/>
</template>

<script lang="ts" setup>
import { onActivated, onDeactivated, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import type { AgentsSessionsListMineResponse } from 'misskey-js/entities.js';
import { useInterval } from '@@/js/use-interval.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { updateCurrentAccountPartial } from '@/accounts.js';
import { useStream } from '@/stream.js';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';

const props = withDefaults(defineProps<{
	/** 是否把智能体会话合并进列表（/chat「全部」页启用；Deck 列、Widget 保持原样） */
	includeAgentSessions?: boolean;
}>(), {
	includeAgentSessions: false,
});

const $i = ensureSignin();

/** 历史列表条目：普通私信/群聊消息，或智能体会话（合并展示时 session 存在） */
type ChatHistoryItem = {
	id: string;
	isMe: boolean;
	isRead: boolean;
	href: string;
} & (
	| {
		session: AgentsSessionsListMineResponse[number];
		message: null;
		other: null;
	}
	| {
		session?: undefined;
		message: Misskey.entities.ChatMessage;
		other: Misskey.entities.ChatMessage['fromUser'] | Misskey.entities.ChatMessage['toUser'] | null;
	}
);

const history = ref<ChatHistoryItem[]>([]);

const initializing = ref(true);
const fetching = ref(false);

async function fetchHistory(updateGlobalStatus = false) {
	if (fetching.value) return;

	fetching.value = true;

	try {
		const [userMessages, roomMessages, agentSessions] = await Promise.all([
			misskeyApi('chat/history', { room: false }),
			misskeyApi('chat/history', { room: true }),
			props.includeAgentSessions
				// 智能体会话获取失败不影响私信列表刷新
				? misskeyApi('agents/sessions/list-mine', {}).catch(() => [] as AgentsSessionsListMineResponse)
				: Promise.resolve([] as AgentsSessionsListMineResponse),
		]);

		const chatItems: ChatHistoryItem[] = [...userMessages, ...roomMessages].map(m => ({
			id: m.id,
			message: m,
			other: (!('room' in m) || m.room == null) ? (m.fromUserId === $i.id ? m.toUser : m.fromUser) : null,
			isMe: m.fromUserId === $i.id,
			isRead: m.isRead === true,
			href: m.toRoomId ? `/chat/room/${m.toRoomId}` : `/chat/user/${(m.fromUserId === $i.id ? m.toUser : m.fromUser)!.id}`,
		}));

		// 智能体会话与私信合并展示：按最后活动时间统一排序。
		// 未读光标只按 hasUnread 判定（与「智能体」标签页一致）；lastMessageRole 仅用于「你:」前缀展示，
		// 不参与 isMe（否则会话最后一条是用户消息时会错误隐藏未读光标）
		const agentItems: ChatHistoryItem[] = (agentSessions ?? []).map(s => ({
			id: s.id,
			message: null,
			other: null,
			isMe: false,
			isRead: !s.hasUnread,
			href: `/chat/agent/${s.id}`,
			session: s,
		}));

		history.value = [...chatItems, ...agentItems]
			.toSorted((a, b) => {
				const timeOf = (item: ChatHistoryItem) =>
					item.session ? new Date(item.session.lastMessageAt).getTime() : new Date(item.message.createdAt).getTime();
				return timeOf(b) - timeOf(a);
			});

		// 只在明确要求时才更新全局状态（例如用户进入 /chat 页面时）
		if (updateGlobalStatus) {
			const hasUnread = [...userMessages, ...roomMessages].some(m => m.fromUserId !== $i.id && !m.isRead);
			updateCurrentAccountPartial({ hasUnreadChatMessages: hasUnread });
		}
	} finally {
		// 无论成功失败都复位锁，避免异常时 fetching 永久卡死导致列表不再刷新
		fetching.value = false;
		initializing.value = false;
	}
}

let isActivated = true;

onActivated(() => {
	isActivated = true;
});

onDeactivated(() => {
	isActivated = false;
});

useInterval(() => {
	// TODO: DOM的にバックグラウンドになっていないかどうかも考慮する
	if (!window.document.hidden && isActivated) {
		fetchHistory(false); // 定时刷新不更新全局状态
	}
}, 1000 * 10, {
	immediate: false,
	afterMounted: true,
});

onActivated(() => {
	// 用户返回页面时延迟刷新列表
	// 延迟是为了确保后端处理 read 信号完成后 API 能返回最新数据
	// （用户可能刚从 room.vue 返回，read 信号可能还在处理中）
	window.setTimeout(() => {
		fetchHistory(false);
	}, 200);
});

onMounted(() => {
	fetchHistory(true); // 初次加载时更新全局状态

	// 监听新消息事件，自动刷新列表
	const stream = useStream();
	const mainChannel = stream.useChannel('main');
	mainChannel.on('newChatMessage', () => {
		// 有新消息时刷新列表，但不更新全局状态（由 main-boot.ts 处理）
		fetchHistory(false);
	});

	// 合并智能体会话时：同步响应消息到达/已读事件，刷新各会话未读标记（与智能体标签页一致）
	if (props.includeAgentSessions) {
		mainChannel.on('newAgentMessage', () => {
			fetchHistory(false);
		});
		mainChannel.on('agentRead', () => {
			// 延迟刷新列表，确保后端 Redis 操作完成后 API 能返回最新数据
			window.setTimeout(() => {
				fetchHistory(false);
			}, 150);
		});
	}

	// 监听聊天已读事件
	// 当用户在其他页面阅读消息后，后端发送此事件通知刷新列表
	// 使用 as any 因为 chatRead 是新增的事件，前端类型定义还没有更新
	(mainChannel as any).on('chatRead', (data: { hasUnreadChatMessages: boolean }) => {
		// 首先立即更新全局未读状态（来自后端，绝对可靠）
		updateCurrentAccountPartial({ hasUnreadChatMessages: data.hasUnreadChatMessages });
		// 延迟刷新列表，确保后端 Redis 操作完成后 API 能返回最新数据
		window.setTimeout(() => {
			fetchHistory(false);
		}, 150);
	});
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

	&:not(.isMe):not(.isRead) {
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

.youSaid {
	font-weight: bold;
	margin-right: 0.5em;
}
</style>
