<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkA :to="`/chat/room/${room.id}`" class="_panel _gaps_s" :class="$style.root">
	<div :class="$style.header">
		<img v-if="room.iconUrl" :src="room.iconUrl" :alt="room.name" :class="$style.roomIcon"/>
		<div v-else :class="[$style.roomIcon, $style.roomIconPlaceholder]">
			<i class="ti ti-users"></i>
		</div>
		<div :class="$style.titleWrap">
			<div :class="$style.titleRow">
				<span :class="$style.name">{{ room.name }}</span>
				<span v-if="room.isPublic" :class="[$style.badge, $style.publicBadge]">{{ i18n.ts._chat.publicBadge }}</span>
				<span v-if="room.isArchived" :class="[$style.badge, $style.archivedBadge]">{{ i18n.ts._chat.archivedBadge }}</span>
				<span v-if="room.isMuted" :class="[$style.badge, $style.mutedBadge]">
					<i class="ti ti-bell-off"></i> {{ i18n.ts._chat.mutedBadge }}
				</span>
			</div>
			<div :class="$style.meta">
				<span v-if="room.memberCount != null">{{ i18n.tsx._chat.memberCount({ count: room.memberCount }) }}</span>
				<span v-if="room.owner" :class="$style.ownerMeta">
					<MkUserName :user="room.owner"/>
				</span>
			</div>
		</div>
		<span v-if="room.unreadCount != null && room.unreadCount > 0" :class="$style.unreadBadge">{{ room.unreadCount }}</span>
		<MkAvatar :user="room.owner" :link="false" :class="$style.headerAvatar"/>
	</div>
	<template v-if="room.description">
		<hr :class="$style.divider">
		<div :class="$style.description">{{ room.description }}</div>
	</template>
</MkA>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import MkUserName from '@/components/global/MkUserName.vue';

defineProps<{
	room: Misskey.entities.ChatRoom;
}>();
</script>

<style lang="scss" module>
.root {
	padding: 16px;
}

.header {
	display: flex;
	align-items: center;
	gap: 12px;
}

.roomIcon {
	width: 40px;
	height: 40px;
	border-radius: 50%;
	object-fit: cover;
	flex-shrink: 0;
}

.roomIconPlaceholder {
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 18px;
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
}

.titleWrap {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.titleRow {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
}

.name {
	font-weight: bold;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.badge {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	font-size: 0.75em;
	padding: 1px 6px;
	border-radius: 999px;
	line-height: 1.4;
}

.publicBadge {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
}

.archivedBadge {
	color: var(--MI_THEME-infoWarnFg);
	background: var(--MI_THEME-infoWarnBg);
}

.mutedBadge {
	color: var(--MI_THEME-fgTransparentWeak);
	background: color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
}

.meta {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 0.82em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.ownerMeta {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.unreadBadge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 20px;
	height: 20px;
	padding: 0 6px;
	border-radius: 999px;
	font-size: 0.75em;
	font-weight: bold;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	flex-shrink: 0;
}

.headerAvatar {
	width: 30px;
	height: 30px;
	flex-shrink: 0;
}

.divider {
	margin: 0;
	border: none;
	border-top: solid 1px var(--MI_THEME-divider);
}

.description {
	font-size: 0.92em;
	color: var(--MI_THEME-fgTransparentWeak);
	word-break: break-word;
}
</style>
