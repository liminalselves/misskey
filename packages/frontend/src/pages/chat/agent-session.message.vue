<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	v-if="message.role === 'system'"
	:class="[$style.systemRoot, { [$style.clickable]: isSearchResult }]"
	:data-message-id="message.id"
	@click="onSearchResultClick"
>
	<span :class="$style.systemText">{{ message.content }}</span>
	<div :class="$style.systemFooter" @click.stop>
		<button class="_textButton" style="color: currentColor;" @click="showMenu"><i class="ti ti-dots-circle-horizontal"></i></button>
		<MkTime :class="$style.systemTime" :time="message.createdAt"/>
	</div>
</div>
<div
	v-else
	:class="[$style.root, { [$style.isMe]: isUser, [$style.highlighted]: highlighted, [$style.clickable]: isSearchResult }]"
	:data-message-id="message.id"
	@click="onSearchResultClick"
>
	<MkAvatar
		v-if="isUser"
		:class="[$style.avatar, prefer.s.useStickyIcons ? $style.useSticky : null]"
		:user="$i"
		:link="false"
		:preview="false"
	/>
	<div v-else :class="[$style.avatar, prefer.s.useStickyIcons ? $style.useSticky : null, $style.assistantAvatar]">
		<img v-if="assistantAvatarUrl" :class="$style.assistantImg" :src="assistantAvatarUrl" alt=""/>
		<div v-else :class="$style.assistantFallback"><i class="ti ti-robot"></i></div>
	</div>
	<div :class="$style.body" @contextmenu.stop="onContextmenu">
		<div v-if="!isUser && prefer.s['chat.showSenderName'] && assistantName" :class="$style.header">{{ assistantName }}</div>
		<MkFukidashi :class="$style.fukidashi" :tail="isUser ? 'right' : 'left'" :accented="isUser">
			<Mfm
				v-if="message.content"
				class="_selectable"
				:text="message.content"
				:i="$i"
				:nyaize="'respect'"
				:enableEmojiMenu="true"
				:enableEmojiMenuReaction="false"
			/>
		</MkFukidashi>
		<div :class="$style.footer">
			<button class="_textButton" style="color: currentColor;" @click="showMenu"><i class="ti ti-dots-circle-horizontal"></i></button>
			<MkTime :class="$style.time" :time="message.createdAt"/>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { MenuItem } from '@/types/menu.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import MkFukidashi from '@/components/MkFukidashi.vue';
import MkTime from '@/components/global/MkTime.vue';
import * as os from '@/os.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { prefer } from '@/preferences.js';
import { isLink } from '@@/js/is-link.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';

const $i = ensureSignin();

export type AgentSessionMessageView = {
	id: string;
	role: string;
	content: string;
	createdAt: string;
};

const props = defineProps<{
	sessionId: string;
	message: AgentSessionMessageView;
	assistantName?: string | null;
	assistantAvatarUrl?: string | null;
	highlighted?: boolean;
	/** 与私信 XMessage 搜索结果一致：点击行跳转到该条消息 */
	isSearchResult?: boolean;
}>();

const emit = defineEmits<{
	(e: 'navigate', messageId: string): void;
	(e: 'deleted', messageId: string): void;
}>();

const isUser = computed(() => props.message.role === 'user');

function onSearchResultClick(ev: MouseEvent) {
	if (!props.isSearchResult) return;
	const target = ev.target as HTMLElement;
	if (target.closest('a, button')) return;
	emit('navigate', props.message.id);
}

function menuItems(): MenuItem[] {
	const items: MenuItem[] = [{
		text: i18n.ts.copyContent,
		icon: 'ti ti-copy',
		action: () => {
			copyToClipboard(props.message.content ?? '');
		},
	}, {
		type: 'divider',
	}, {
		text: i18n.ts.delete,
		icon: 'ti ti-trash',
		danger: true,
		action: () => {
			void confirmDelete();
		},
	}];
	return items;
}

function showMenu(ev: PointerEvent) {
	os.popupMenu(menuItems(), ev.currentTarget ?? ev.target);
}

function onContextmenu(ev: PointerEvent) {
	if (ev.target && isLink(ev.target as HTMLElement)) return;
	if (window.getSelection()?.toString() !== '') return;
	os.contextMenu(menuItems(), ev);
}

async function confirmDelete() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.deleteConfirm,
	});
	if (canceled) return;
	try {
		await misskeyApi('agents/messages/delete', {
			sessionId: props.sessionId,
			messageId: props.message.id,
		});
		emit('deleted', props.message.id);
		os.toast(i18n.ts.removed);
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}
</script>

<style lang="scss" module>
.systemRoot {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	padding: 8px 12px;
	margin: 0 auto;
	max-width: 90%;
	text-align: center;
	font-size: 85%;
	opacity: 0.72;

	&.clickable {
		cursor: pointer;
		transition: background-color 0.2s;

		&:hover {
			opacity: 0.95;
			background-color: var(--MI_THEME-panelHighlight);
			border-radius: 12px;
		}
	}
}

.systemText {
	white-space: pre-wrap;
	word-break: break-word;
}

.systemFooter {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: center;
	gap: 0.5em;
	margin-top: 2px;
	font-size: 75%;
}

.systemTime {
	opacity: 0.55;
	font-size: 90%;
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

	&.highlighted {
		animation: highlightBlink 1s ease-in-out 1;
		border-radius: 12px;
	}

	&.clickable {
		cursor: pointer;
		transition: background-color 0.2s;

		&:hover {
			background-color: var(--MI_THEME-panelHighlight);
			border-radius: 12px;
		}
	}
}

/* 与私信 XMessage 一致：定位后整行背景闪烁一次 */
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

.assistantAvatar {
	flex-shrink: 0;
}

.assistantImg {
	width: 50px;
	height: 50px;
	border-radius: 999px;
	object-fit: cover;
	display: block;
}

.assistantFallback {
	width: 50px;
	height: 50px;
	border-radius: 999px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
	color: var(--MI_THEME-fg);
	font-size: 1.35em;
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

	.assistantImg,
	.assistantFallback {
		width: 42px;
		height: 42px;
	}

	.fukidashi {
		font-size: 90%;
	}
}

.body {
	margin: 0 12px;
	min-width: 0;
}

.header {
	min-height: 4px;
	font-size: 80%;
}

.fukidashi {
	text-align: left;
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
</style>
