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
		<div :class="$style.header">
			<template v-if="message.fromUser != null && (prefer.s['chat.showSenderName'] || isRoomMessage)">
				<MkUserName :class="$style.headerName" :user="message.fromUser"/>
				<MkAcct v-if="isRoomMessage" :class="$style.headerAcct" :user="message.fromUser"/>
			</template>
		</div>
		<!-- 引用消息预览 -->
		<div
			v-if="hasReply && replyData != null"
			role="button"
			tabindex="0"
			:class="$style.replyPreview"
			@click.stop.prevent="scrollToReply"
			@keydown.enter.stop.prevent="scrollToReply"
			@keydown.space.stop.prevent="scrollToReply"
		>
			<div :class="$style.replyBar"></div>
			<div :class="$style.replyContent">
				<MkUserName v-if="replyData.fromUser" :user="replyData.fromUser" :class="$style.replyAuthor"/>
				<span v-else :class="$style.replyAuthor">{{ replyData.fromUserId }}</span>
				<span :class="$style.replyText">{{ replyData.text || i18n.ts._chat.attachmentPlaceholder }}</span>
			</div>
		</div>
		<div v-else-if="hasReply" :class="[$style.replyPreview, $style.replyDeleted]">
			<div :class="$style.replyBar"></div>
			<div :class="$style.replyContent">
				<span :class="$style.replyText">{{ i18n.ts._chat.deletedMessage }}</span>
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
				:enableEmojiMenu="canInteract && !isMe"
				:enableEmojiMenuReaction="canInteract && !isMe"
			/>
			<MkMediaList v-if="message.file" :mediaList="[message.file]" :user="message.fromUser"/>
		</MkFukidashi>
		<MkUrlPreview v-for="url in urls" :key="url" :url="url" style="margin: 8px 0;"/>
		<div :class="$style.footer">
			<button
				type="button"
				class="_textButton"
				:class="$style.footerAction"
				:aria-label="i18n.ts.menu"
				:title="i18n.ts.menu"
				@click="showMenu"
			>
				<i class="ti ti-dots-circle-horizontal"></i>
			</button>
			<template v-if="!isSearchResult && canInteract">
				<button
					type="button"
					class="_textButton"
					:class="[$style.footerAction, $style.quickAction]"
					:aria-label="i18n.ts._chat.reply"
					:title="i18n.ts._chat.reply"
					@click="emit('reply', props.message)"
				>
					<i class="ti ti-arrow-back-up"></i>
				</button>
				<button
					v-if="!isMe"
					type="button"
					class="_textButton"
					:class="[$style.footerAction, $style.quickAction]"
					:aria-label="i18n.ts.reaction"
					:title="i18n.ts.reaction"
					@click="react"
				>
					<i class="ti ti-mood-plus"></i>
				</button>
			</template>
			<MkTime :class="$style.time" :time="message.createdAt"/>
			<span v-if="editedAt" :class="$style.edited" :title="editedAt">({{ i18n.ts._chat.edited }})</span>
			<span v-if="isPinned" :class="$style.pinnedTag"><i class="ti ti-pin"></i> {{ i18n.ts._chat.pinnedMessage }}</span>
			<MkA v-if="isSearchResult && 'toRoom' in message && message.toRoom != null" :to="`/chat/room/${message.toRoomId}`">{{ message.toRoom.name }}</MkA>
			<MkA v-if="isSearchResult && 'toUser' in message && message.toUser != null && isMe" :to="`/chat/user/${message.toUserId}`">@{{ message.toUser.username }}</MkA>
		</div>
		<TransitionGroup
			:enterActiveClass="prefer.s.animation ? $style.transition_reaction_enterActive : ''"
			:leaveActiveClass="prefer.s.animation ? $style.transition_reaction_leaveActive : ''"
			:enterFromClass="prefer.s.animation ? $style.transition_reaction_enterFrom : ''"
			:leaveToClass="prefer.s.animation ? $style.transition_reaction_leaveTo : ''"
			:moveClass="prefer.s.animation ? $style.transition_reaction_move : ''"
			tag="div"
			:class="$style.reactions"
		>
			<button
				v-for="group in groupedReactions"
				:key="group.reaction"
				v-tooltip="reactionTooltip(group)"
				type="button"
				class="_button"
				:class="[$style.reaction, group.meReacted ? $style.reactionMy : null]"
				:aria-label="reactionTooltip(group)"
				:aria-pressed="group.meReacted"
				:disabled="!canInteract || (isMe && !group.meReacted)"
				@click="onReactionClick(group)"
			>
				<span v-if="group.users.length > 0" :class="$style.reactionAvatars">
					<MkAvatar
						v-for="reactor in group.users.slice(0, 3)"
						:key="reactor.id"
						:user="reactor"
						:link="false"
						:class="$style.reactionAvatar"
					/>
				</span>
				<MkReactionIcon
					:withTooltip="false"
					:reaction="group.reaction.replace(/^:(\w+):$/, ':$1@.:')"
					:noStyle="true"
					:class="$style.reactionIcon"
				/>
				<span v-if="group.count > 1" :class="$style.reactionCount">{{ group.count }}</span>
			</button>
		</TransitionGroup>
	</div>
</div>
</template>

<script lang="ts">
import * as Misskey from 'misskey-js';

export type GroupedReaction = {
	reaction: string;
	count: number;
	users: Misskey.entities.UserLite[];
	meReacted: boolean;
};

export function groupMessageReactions(
	reactions: readonly { reaction: string; user?: Misskey.entities.UserLite | null }[],
	myUserId: string,
): GroupedReaction[] {
	const map = new Map<string, { reaction: string; users: Misskey.entities.UserLite[]; seenUserIds: Set<string>; meReacted: boolean }>();

	for (const record of reactions) {
		let entry = map.get(record.reaction);
		if (!entry) {
			entry = {
				reaction: record.reaction,
				users: [],
				seenUserIds: new Set<string>(),
				meReacted: false,
			};
			map.set(record.reaction, entry);
		}
		const u = record.user;
		if (u != null) {
			if (!entry.seenUserIds.has(u.id)) {
				entry.seenUserIds.add(u.id);
				entry.users.push(u);
			}
			if (u.id === myUserId) {
				entry.meReacted = true;
			}
		}
	}

	return Array.from(map.values()).map(entry => ({
		reaction: entry.reaction,
		count: entry.users.length || 1,
		users: entry.users,
		meReacted: entry.meReacted,
	}));
}
</script>

<script lang="ts" setup>
import { computed, provide } from 'vue';
import * as mfm from 'mfm-js';
import { url } from '@@/js/config.js';
import { isLink } from '@@/js/is-link.js';
import type { MenuItem } from '@/types/menu.js';
import type { NormalizedChatMessage } from './room.vue';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import { ensureSignin } from '@/i.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import MkFukidashi from '@/components/MkFukidashi.vue';
import * as os from '@/os.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import MkMediaList from '@/components/MkMediaList.vue';
import MkUserName from '@/components/global/MkUserName.vue';
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
	roomOwnerId?: string; // 群主 ID，用于判断是否可以删除/置顶其他人的消息
	myRole?: 'owner' | 'admin' | 'member' | null;
	isRoomArchived?: boolean;
	isRoomSuspended?: boolean;
	pinnedMessageId?: string | null;
}>();

const emit = defineEmits<{
	(e: 'navigate', messageId: string): void;
	(e: 'reply', message: NormalizedChatMessage | Misskey.entities.ChatMessage): void;
	(e: 'edit', message: NormalizedChatMessage | Misskey.entities.ChatMessage): void;
	(e: 'pin', messageId: string | null): void;
	(e: 'mention', user: Misskey.entities.UserLite): void;
	(e: 'scrollToMessage', messageId: string): void;
}>();

const isMe = computed(() => props.message.fromUserId === $i.id);
const isRoomMessage = computed(() => props.roomOwnerId != null || ('toRoomId' in props.message && props.message.toRoomId != null));
const canAdminRoom = computed(() => props.roomOwnerId === $i.id || props.myRole === 'owner' || props.myRole === 'admin');
const canInteract = computed(() => $i.policies.chatAvailability === 'available' && !props.isRoomArchived && !props.isRoomSuspended);
const isPinned = computed(() => props.pinnedMessageId != null && props.pinnedMessageId === props.message.id);
const editedAt = computed(() => ('editedAt' in props.message ? props.message.editedAt : null) ?? null);
const hasReply = computed(() => 'replyId' in props.message && props.message.replyId != null);
const replyData = computed(() => ('reply' in props.message ? props.message.reply : null) ?? null);
const urls = computed(() => props.message.text ? extractUrlFromMfm(mfm.parse(props.message.text)) : []);
const groupedReactions = computed(() => groupMessageReactions(props.message.reactions, $i.id));

function reactionTooltip(group: GroupedReaction): string {
	const names = group.users.map(u => u.name || u.username).join(', ');
	return names ? `${group.reaction} — ${names}` : group.reaction;
}

// 点击搜索结果时触发导航
function onMessageClick(ev: MouseEvent) {
	if (!props.isSearchResult) return;

	const target = ev.target as HTMLElement;
	if (target.closest('a, button')) return;

	emit('navigate', props.message.id);
}

// 点击引用预览时滚动到被引用的消息
function scrollToReply() {
	if (!replyData.value) return;
	const replyId = 'replyId' in props.message ? props.message.replyId : null;
	if (!replyId) return;
	emit('scrollToMessage', replyId);
}

provide(DI.mfmEmojiReactCallback, (reaction) => {
	if (!canInteract.value || isMe.value) return;

	sound.playMisskeySfx('reaction');
	misskeyApi('chat/messages/react', {
		messageId: props.message.id,
		reaction: reaction,
	}).catch(e => {
		os.alert({ type: 'error', text: formatApiError(e) });
	});
});

function react(ev: PointerEvent) {
	if (!canInteract.value || isMe.value) return;

	const targetEl = getHTMLElementOrNull(ev.currentTarget ?? ev.target);
	if (!targetEl) return;

	reactionPicker.show(targetEl, null, async (reaction) => {
		sound.playMisskeySfx('reaction');
		try {
			await misskeyApi('chat/messages/react', {
				messageId: props.message.id,
				reaction: reaction,
			});
		} catch (e) {
			os.alert({ type: 'error', text: formatApiError(e) });
		}
	});
}

function onReactionClick(group: GroupedReaction) {
	if (!canInteract.value) return;

	if (group.meReacted) {
		misskeyApi('chat/messages/unreact', {
			messageId: props.message.id,
			reaction: group.reaction,
		}).catch(e => {
			os.alert({ type: 'error', text: formatApiError(e) });
		});
	} else if (!isMe.value) {
		sound.playMisskeySfx('reaction');
		misskeyApi('chat/messages/react', {
			messageId: props.message.id,
			reaction: group.reaction,
		}).catch(e => {
			os.alert({ type: 'error', text: formatApiError(e) });
		});
	}
}

function onContextmenu(ev: PointerEvent) {
	if (ev.target && isLink(ev.target as HTMLElement)) return;
	if (window.getSelection()?.toString() !== '') return;

	showMenu(ev, true);
}

async function confirmAndDeleteMessage(): Promise<void> {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.deleteConfirm,
	});
	if (canceled) return;
	try {
		await misskeyApi('chat/messages/delete', {
			messageId: props.message.id,
		});
		os.toast(i18n.ts.removed);
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}

function showMenu(ev: PointerEvent, contextmenu = false) {
	const sections: MenuItem[][] = [];

	// 1. 交互操作区
	const interactSection: MenuItem[] = [];
	if (canInteract.value) {
		if (!isMe.value) {
			interactSection.push({
				text: i18n.ts.reaction,
				icon: 'ti ti-mood-plus',
				action: (ev) => react(ev),
			});
		}
		if (!props.isSearchResult) {
			interactSection.push({
				text: i18n.ts._chat.reply,
				icon: 'ti ti-quote',
				action: () => emit('reply', props.message),
			});
			if (isRoomMessage.value && !isMe.value && props.message.fromUser != null) {
				interactSection.push({
					text: i18n.ts._chat.mention,
					icon: 'ti ti-at',
					action: () => emit('mention', props.message.fromUser!),
				});
			}
			if (isMe.value) {
				interactSection.push({
					text: i18n.ts._chat.editMessage,
					icon: 'ti ti-pencil',
					action: () => emit('edit', props.message),
				});
			}
		}
	}
	if (interactSection.length > 0) sections.push(interactSection);

	// 2. 群管理操作区（置顶）
	if (isRoomMessage.value && canAdminRoom.value && !props.isSearchResult && $i.policies.chatAvailability === 'available') {
		sections.push([{
			text: isPinned.value ? i18n.ts._chat.unpinMessage : i18n.ts._chat.pinMessage,
			icon: isPinned.value ? 'ti ti-pinned-off' : 'ti ti-pin',
			action: () => emit('pin', isPinned.value ? null : props.message.id),
		}]);
	}

	// 3. 通用操作区（复制、举报）
	const utilitySection: MenuItem[] = [];
	if (props.message.text) {
		utilitySection.push({
			text: i18n.ts._chat.copyText,
			icon: 'ti ti-copy',
			action: () => {
				copyToClipboard(props.message.text ?? '');
			},
		});
	}
	if (!isMe.value && props.message.fromUser != null) {
		utilitySection.push({
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
	if (utilitySection.length > 0) sections.push(utilitySection);

	// 4. 删除操作区
	const canDelete = $i.policies.chatAvailability === 'available'
		&& !props.isRoomArchived
		&& ((isMe.value && !props.isRoomSuspended) || (!isMe.value && canAdminRoom.value));
	if (canDelete) {
		sections.push([{
			text: i18n.ts.delete,
			icon: 'ti ti-trash',
			danger: true,
			action: () => {
				void confirmAndDeleteMessage();
			},
		}]);
	}

	const menu: MenuItem[] = [];
	sections.forEach((sec, index) => {
		if (index > 0) menu.push({ type: 'divider' });
		menu.push(...sec);
	});

	if (menu.length === 0) return;

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

		.header {
			justify-content: flex-end;
		}

		.headerName {
			order: 1;
			margin-left: 0.5em;
		}

		.headerAcct {
			order: 0;
			margin-left: 0;
		}

		.reactions {
			justify-content: flex-end;
		}
	}

	&:hover .quickAction,
	&:focus-within .quickAction {
		opacity: 0.85;
	}

	&.clickable {
		cursor: pointer;
		transition: background-color 0.2s;

		&:hover {
			background-color: var(--MI_THEME-panelHighlight);
			border-radius: var(--MI-radius);
		}
	}

	&.highlighted {
		animation: highlightBlink 1s ease-in-out 1;
		border-radius: var(--MI-radius);
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

	.quickAction {
		opacity: 0.7;
	}
}

.body {
	margin: 0 12px;
	min-width: 0;

	&.fullWidth {
		width: 100%;
	}
}

.header {
	display: flex;
	align-items: baseline;
	min-height: 4px; // fukidashiの位置調整も兼ねるため
	font-size: 80%;
	white-space: nowrap;
}

.headerName {
	font-weight: bold;
}

.headerAcct {
	margin-left: 0.5em;
	font-size: 0.9em;
	opacity: 0.6;
}

.fukidashi {
	text-align: left;
}

.footer {
	display: flex;
	flex-direction: row;
	align-items: center;
	flex-wrap: wrap;
	gap: 0.5em;
	margin-top: 4px;
	font-size: 75%;
}

.footerAction {
	color: currentColor;
}

.quickAction {
	opacity: 0.35;
	transition: opacity 0.15s ease;

	&:hover,
	&:focus-visible {
		opacity: 1 !important;
		color: var(--MI_THEME-accent);
	}
}

.time {
	opacity: 0.5;
}

.edited {
	opacity: 0.55;
}

.pinnedTag {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	color: var(--MI_THEME-accent);
}

.reactions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	margin-top: 8px;

	&:empty {
		display: none;
	}
}

.reaction {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 999px;
	padding: 4px 10px;
	background: var(--MI_THEME-panel);
	transition: border-color 0.15s ease, background-color 0.15s ease;

	&:hover:not(:disabled) {
		border-color: var(--MI_THEME-accent);
	}

	&.reactionMy {
		border-color: var(--MI_THEME-accent);
		background: color-mix(in srgb, var(--MI_THEME-accent) 10%, var(--MI_THEME-panel));
	}
}

.reactionAvatars {
	display: inline-flex;
	align-items: center;
}

.reactionAvatar {
	width: 20px;
	height: 20px;

	&:not(:first-child) {
		margin-left: -6px;
	}
}

.reactionIcon {
	width: 20px;
	height: 20px;
}

.reactionCount {
	font-size: 0.85em;
	font-weight: 600;
	color: var(--MI_THEME-fg);
}

// 引用消息预览样式
.replyPreview {
	display: flex;
	align-items: stretch;
	gap: 8px;
	max-width: 100%;
	box-sizing: border-box;
	margin-bottom: 8px;
	padding: 6px 10px;
	background: var(--MI_THEME-bg);
	border-radius: 8px;
	cursor: pointer;
	opacity: 0.85;
	transition: opacity 0.2s;
	text-align: left;

	&:hover {
		opacity: 1;
	}

	&.replyDeleted {
		cursor: default;
		opacity: 0.65;
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
	overflow-wrap: break-word;
	word-break: break-word;
}
</style>
