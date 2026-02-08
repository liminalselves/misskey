<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="[$style.root, { [$style.isMe]: isMe, [$style.highlighted]: highlighted, [$style.clickable]: isSearchResult }]"
	:data-message-id="message.id"
	@click="onMessageClick"
>
	<MkAvatar :class="[$style.avatar, prefer.s.useStickyIcons ? $style.useSticky : null]" :user="message.fromUser!" :link="!isMe" :preview="false"/>
	<div :class="[$style.body, message.file != null ? $style.fullWidth : null]" @contextmenu.stop="onContextmenu">
		<div :class="$style.header"><MkUserName v-if="!isMe && prefer.s['chat.showSenderName'] && message.fromUser != null" :user="message.fromUser"/></div>
		<!-- 引用消息预览 -->
		<div v-if="'reply' in message && message.reply" :class="$style.replyPreview" @click.stop.prevent="scrollToReply">
			<div :class="$style.replyBar"></div>
			<div :class="$style.replyContent">
				<span :class="$style.replyAuthor">{{ (message.reply as any).fromUser?.name || (message.reply as any).fromUser?.username }}</span>
				<span :class="$style.replyText">{{ (message.reply as any).text || '[附件]' }}</span>
			</div>
		</div>
		<MkFukidashi :class="$style.fukidashi" :tail="isMe ? 'right' : 'left'" :fullWidth="message.file != null" :accented="isMe">
			<Mfm
				v-if="message.text"
				ref="text"
				class="_selectable"
				:text="message.text"
				:i="$i"
				:nyaize="'respect'"
				:enableEmojiMenu="true"
				:enableEmojiMenuReaction="true"
			/>
			<MkMediaList v-if="message.file" :mediaList="[message.file]"/>
		</MkFukidashi>
		<MkUrlPreview v-for="url in urls" :key="url" :url="url" style="margin: 8px 0;"/>
		<div :class="$style.footer">
			<button class="_textButton" style="color: currentColor;" @click="showMenu"><i class="ti ti-dots-circle-horizontal"></i></button>
			<MkTime :class="$style.time" :time="message.createdAt"/>
			<MkA v-if="isSearchResult && 'toRoom' in message && message.toRoom != null" :to="`/chat/room/${message.toRoomId}`">{{ message.toRoom.name }}</MkA>
			<MkA v-if="isSearchResult && 'toUser' in message && message.toUser != null && isMe" :to="`/chat/user/${message.toUserId}`">@{{ message.toUser.username }}</MkA>
		</div>
		<TransitionGroup
			:enterActiveClass="prefer.s.animation ? $style.transition_reaction_enterActive : ''"
			:leaveActiveClass="prefer.s.animation ? $style.transition_reaction_leaveActive : ''"
			:enterFromClass="prefer.s.animation ? $style.transition_reaction_enterFrom : ''"
			:leaveToClass="prefer.s.animation ? $style.transition_reaction_leaveTo : ''"
			:moveClass="prefer.s.animation ? $style.transition_reaction_move : ''"
			tag="div" :class="$style.reactions"
		>
			<div v-for="record in message.reactions" :key="record.reaction + record.user.id" :class="[$style.reaction, record.user.id === $i.id ? $style.reactionMy : null]" @click="onReactionClick(record)">
				<MkAvatar :user="record.user" :link="false" :class="$style.reactionAvatar"/>
				<MkReactionIcon
					:withTooltip="true"
					:reaction="record.reaction.replace(/^:(\w+):$/, ':$1@.:')"
					:noStyle="true"
					:class="$style.reactionIcon"
				/>
			</div>
		</TransitionGroup>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, provide } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import { isLink } from '@@/js/is-link.js';
import type { MenuItem } from '@/types/menu.js';
import type { NormalizedChatMessage } from './room.vue';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import MkFukidashi from '@/components/MkFukidashi.vue';
import * as os from '@/os.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import MkMediaList from '@/components/MkMediaList.vue';
import { reactionPicker } from '@/utility/reaction-picker.js';
import * as sound from '@/utility/sound.js';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { getHTMLElementOrNull } from '@/utility/get-dom-node-or-null.js';

const $i = ensureSignin();

const props = defineProps<{
	message: NormalizedChatMessage | Misskey.entities.ChatMessage;
	isSearchResult?: boolean;
	highlighted?: boolean;
	roomOwnerId?: string; // 群主 ID，用于判断是否可以删除其他人的消息
}>();

const emit = defineEmits<{
	(e: 'navigate', messageId: string): void;
	(e: 'reply', message: NormalizedChatMessage | Misskey.entities.ChatMessage): void;
	(e: 'scrollToMessage', messageId: string): void;
}>();

const isMe = computed(() => props.message.fromUserId === $i.id);
const isRoomOwner = computed(() => props.roomOwnerId != null && props.roomOwnerId === $i.id);
const urls = computed(() => props.message.text ? extractUrlFromMfm(mfm.parse(props.message.text)) : []);

// 点击搜索结果时触发导航
function onMessageClick(ev: MouseEvent) {
	// 如果不是搜索结果模式，不处理点击
	if (!props.isSearchResult) return;

	// 如果点击的是链接或按钮，不处理
	const target = ev.target as HTMLElement;
	if (target.closest('a, button')) return;

	// 触发导航事件
	emit('navigate', props.message.id);
}

// 点击引用预览时滚动到被引用的消息
function scrollToReply() {
	if (!('reply' in props.message) || !props.message.reply) return;
	const replyId = 'replyId' in props.message ? props.message.replyId : null;
	if (!replyId) return;
	// 统一使用 emit 让 room.vue 处理定位（支持翻页加载）
	emit('scrollToMessage', replyId as string);
}

provide(DI.mfmEmojiReactCallback, (reaction) => {
	if ($i.policies.chatAvailability !== 'available') return;

	sound.playMisskeySfx('reaction');
	misskeyApi('chat/messages/react', {
		messageId: props.message.id,
		reaction: reaction,
	});
});

function react(ev: PointerEvent) {
	if ($i.policies.chatAvailability !== 'available') return;

	const targetEl = getHTMLElementOrNull(ev.currentTarget ?? ev.target);
	if (!targetEl) return;

	reactionPicker.show(targetEl, null, async (reaction) => {
		sound.playMisskeySfx('reaction');
		misskeyApi('chat/messages/react', {
			messageId: props.message.id,
			reaction: reaction,
		});
	});
}

function onReactionClick(record: Misskey.entities.ChatMessage['reactions'][0]) {
	if ($i.policies.chatAvailability !== 'available') return;

	if (record.user.id === $i.id) {
		misskeyApi('chat/messages/unreact', {
			messageId: props.message.id,
			reaction: record.reaction,
		});
	} else {
		if (!props.message.reactions.some(r => r.user.id === $i.id && r.reaction === record.reaction)) {
			sound.playMisskeySfx('reaction');
			misskeyApi('chat/messages/react', {
				messageId: props.message.id,
				reaction: record.reaction,
			});
		}
	}
}

function onContextmenu(ev: PointerEvent) {
	if (ev.target && isLink(ev.target as HTMLElement)) return;
	if (window.getSelection()?.toString() !== '') return;

	showMenu(ev, true);
}

function showMenu(ev: PointerEvent, contextmenu = false) {
	const menu: MenuItem[] = [];

	if (!isMe.value) {
		// === 他人消息 ===
		// 回应
		if ($i.policies.chatAvailability === 'available') {
			menu.push({
				text: i18n.ts.reaction,
				icon: 'ti ti-mood-plus',
				action: (ev) => {
					react(ev);
				},
			});
		}

		// 引用
		if ($i.policies.chatAvailability === 'available' && !props.isSearchResult) {
			menu.push({
				text: '引用',
				icon: 'ti ti-quote',
				action: () => {
					emit('reply', props.message);
				},
			});
		}

		menu.push({ type: 'divider' });

		// 复制内容
		menu.push({
			text: i18n.ts.copyContent,
			icon: 'ti ti-copy',
			action: () => {
				copyToClipboard(props.message.text ?? '');
			},
		});

		// 举报
		if (props.message.fromUser != null) {
			menu.push({
				text: i18n.ts.reportAbuse,
				icon: 'ti ti-exclamation-circle',
				action: async () => {
					const localUrl = `${url}/chat/messages/${props.message.id}`;
					const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkAbuseReportWindow.vue').then(x => x.default), {
						user: props.message.fromUser!,
						initialComment: `${localUrl}\n-----\n`,
					}, {
						closed: () => dispose(),
					});
				},
			});
		}
	} else {
		// === 自己的消息 ===
		// 引用
		if ($i.policies.chatAvailability === 'available' && !props.isSearchResult) {
			menu.push({
				text: '引用',
				icon: 'ti ti-quote',
				action: () => {
					emit('reply', props.message);
				},
			});
		}

		menu.push({ type: 'divider' });

		// 复制内容
		menu.push({
			text: i18n.ts.copyContent,
			icon: 'ti ti-copy',
			action: () => {
				copyToClipboard(props.message.text ?? '');
			},
		});

		menu.push({ type: 'divider' });

		// 删除
		if ($i.policies.chatAvailability === 'available') {
			menu.push({
				text: i18n.ts.delete,
				icon: 'ti ti-trash',
				danger: true,
				action: () => {
					misskeyApi('chat/messages/delete', {
						messageId: props.message.id,
					});
				},
			});
		}
	}

	// 群主可以删除其他人消息
	if (!isMe.value && isRoomOwner.value && $i.policies.chatAvailability === 'available') {
		menu.push({ type: 'divider' });
		menu.push({
			text: i18n.ts.delete,
			icon: 'ti ti-trash',
			danger: true,
			action: () => {
				misskeyApi('chat/messages/delete', {
					messageId: props.message.id,
				});
			},
		});
	}

	if (contextmenu) {
		os.contextMenu(menu, ev);
	} else {
		os.popupMenu(menu, ev.currentTarget ?? ev.target);
	}
}
</script>

<style lang="scss" module>
.transition_reaction_move,
.transition_reaction_enterActive,
.transition_reaction_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_reaction_enterFrom,
.transition_reaction_leaveTo {
	opacity: 0;
	transform: scale(0.7);
}
.transition_reaction_leaveActive {
	position: absolute;
}

.root {
	position: relative;
	display: flex;

	&.isMe {
		flex-direction: row-reverse;
		text-align: right;

		.footer {
			flex-direction: row-reverse;
		}
	}

	&.clickable {
		cursor: pointer;
		transition: background-color 0.2s;

		&:hover {
			background-color: var(--MI_THEME-panelHighlight);
			border-radius: 12px;
		}
	}

	&.highlighted {
		animation: highlightBlink 1s ease-in-out 1;
		border-radius: 12px;
	}
}

/* 高光闪烁动画：1秒一次循环，只执行1次 */
@keyframes highlightBlink {
	0% {
		background-color: transparent;
	}
	5% {
		background-color: var(--MI_THEME-accentedBg);
	}
	95% {
		background-color: var(--MI_THEME-accentedBg);
	}
	100% {
		background-color: transparent;
	}
}

.avatar {
	display: block;
	width: 50px;
	height: 50px;

	&.useSticky {
		position: sticky;
		top: calc(16px + var(--MI-stickyTop, 0px));
	}
}

@container (max-width: 450px) {
	.root {
		&.isMe {
			.avatar {
				display: none;
			}
		}
	}

	.avatar {
		width: 42px;
		height: 42px;
	}

	.fukidashi {
		font-size: 90%;
	}
}

.body {
	margin: 0 12px;

	&.fullWidth {
		width: 100%;
	}
}

.header {
	min-height: 4px; // fukidashiの位置調整も兼ねるため
	font-size: 80%;
}

.fukidashi {
	text-align: left;
}

.content {
	overflow: clip;
	overflow-wrap: break-word;
	word-break: break-word;
}

.footer {
	display: flex;
	flex-direction: row;
	gap: 0.5em;
	margin-top: 4px;
	font-size: 75%;
}

.time {
	opacity: 0.5;
}

.reactions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-top: 8px;

	&:empty {
		display: none;
	}
}

.reaction {
	display: flex;
	align-items: center;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 999px;
	padding: 8px;

	&.reactionMy {
		border-color: var(--MI_THEME-accent);
	}
}

.reactionAvatar {
	width: 24px;
	height: 24px;
	margin-right: 8px;
}

.reactionIcon {
	width: 24px;
	height: 24px;
}

// 引用消息预览样式
.replyPreview {
	display: flex;
	align-items: stretch;
	gap: 8px;
	margin-bottom: 8px;
	padding: 6px 10px;
	background: var(--MI_THEME-bg);
	border-radius: 8px;
	cursor: pointer;
	opacity: 0.8;
	transition: opacity 0.2s;

	&:hover {
		opacity: 1;
	}
}

.replyBar {
	width: 3px;
	background: var(--MI_THEME-accent);
	border-radius: 2px;
	flex-shrink: 0;
}

.replyContent {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
	overflow: hidden;
}

.replyAuthor {
	font-size: 0.85em;
	font-weight: bold;
	color: var(--MI_THEME-accent);
}

.replyText {
	font-size: 0.85em;
	color: var(--MI_THEME-fg);
	opacity: 0.8;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
</style>
