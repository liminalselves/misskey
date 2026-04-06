<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.avatarWrap">
	<MkDriveFileThumbnail
		v-if="session.characterAvatar"
		:file="session.characterAvatar"
		fit="cover"
		:class="$style.avatarThumb"
	/>
	<div v-else :class="$style.avatarFallback"><i class="ti ti-robot"></i></div>
</div>
<div :class="$style.messageBody">
	<header :class="$style.messageHeader">
		<div :class="$style.headerMain">
			<span :class="$style.messageHeaderName">{{ session.name }}</span>
			<span class="_acrylicBadge">{{ kindLabel }}</span>
		</div>
		<MkTime :time="session.lastMessageAt" :class="$style.messageHeaderTime" mode="relative"/>
	</header>
	<div v-if="session.characterName && session.characterName !== session.name" :class="$style.characterMeta">
		<i class="ti ti-user"></i>
		<span>{{ session.characterName }}</span>
	</div>
	<div v-if="session.characterSummary" :class="$style.characterSummary">{{ session.characterSummary }}</div>
	<div v-if="session.lastMessagePreview" :class="$style.messageBodyText">
		<span v-if="session.lastMessageRole === 'user'" :class="$style.youSaid">{{ i18n.ts.you }}:</span>
		{{ session.lastMessagePreview }}
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { AgentsSessionsListMineResponse } from 'misskey-js/entities.js';
import MkTime from '@/components/global/MkTime.vue';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	session: AgentsSessionsListMineResponse[number];
}>();

const kindLabel = computed(() =>
	props.session.sessionKind === 'draft_test'
		? i18n.ts._agents.sessionKindDraft
		: i18n.ts._agents.sessionKindCommunity,
);
</script>

<style lang="scss" module>
.avatarWrap {
	flex-shrink: 0;
	width: 50px;
	height: 50px;
	margin: 0 16px 0 0;
	border-radius: 999px;
	overflow: hidden;
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
}

.avatarThumb {
	width: 100%;
	height: 100%;
	border-radius: 999px;

	:global(.root) {
		width: 100%;
		height: 100%;
		border-radius: 999px;
	}
}

.avatarFallback {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 1.5rem;
	color: var(--MI_THEME-accent);
	background: var(--MI_THEME-accentedBg);
}

@container (max-width: 500px) {
	.avatarWrap {
		width: 45px;
		height: 45px;
	}
}

@container (max-width: 450px) {
	.avatarWrap {
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
	gap: 10px;
	margin-bottom: 4px;
	width: 100%;
	min-width: 0;
}

.headerMain {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	flex: 1;
	overflow: hidden;
}

.messageHeaderName {
	margin: 0;
	padding: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 1em;
	font-weight: bold;
	min-width: 0;
}

.messageHeaderTime {
	flex-shrink: 0;
	font-size: 0.85em;
	opacity: 0.65;
}

.characterMeta {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 0.88em;
	opacity: 0.72;
	margin-bottom: 4px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.characterSummary {
	font-size: 0.88em;
	line-height: 1.45;
	opacity: 0.8;
	margin-bottom: 6px;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.messageBodyText {
	overflow: hidden;
	overflow-wrap: break-word;
	font-size: 1.05em;
	opacity: 0.92;
}

.youSaid {
	font-weight: bold;
	margin-right: 0.5em;
}
</style>
