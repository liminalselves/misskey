<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button type="button" :class="$style.root" @click="goDetail">
	<div :class="$style.accent"/>
	<div :class="$style.inner">
		<div v-if="meta.kind === 'character' && meta.avatar" :class="$style.avatarWrap">
			<MkDriveFileThumbnail :file="meta.avatar" fit="cover" :class="$style.avatar"/>
		</div>
		<div v-else :class="$style.iconFallback">
			<i :class="meta.kind === 'character' ? 'ti ti-user' : 'ti ti-message-cog'"></i>
		</div>
		<div :class="$style.textCol">
			<div :class="$style.badgeRow">
				<span :class="$style.badge">{{ i18n.ts._agents.plazaReviewNoteBadge }}</span>
				<span :class="$style.kind">{{ kindLabel }}</span>
			</div>
			<div :class="$style.title">「{{ meta.name }}」</div>
			<div :class="$style.metricBlock">
				<div :class="$style.metricRow">
					<span :class="$style.metricLabel"><i class="ti ti-star"/> {{ i18n.ts._agents.plazaMetricRating }}</span>
					<template v-if="plazaRatingCount === 0">
						<span :class="$style.metricMuted">{{ i18n.ts._agents.plazaRatingNone }}</span>
					</template>
					<template v-else>
						<span :class="$style.metricStars" aria-hidden="true">{{ plazaAggregateStarVisual }}</span>
						<span :class="$style.metricValue">{{ plazaAggregateAverageText }} · {{ plazaRatingCount }} {{ i18n.ts._agents.plazaRatingCountSuffix }}</span>
					</template>
				</div>
				<div :class="$style.metricRow">
					<span :class="$style.metricLabel">{{ i18n.ts._agents.plazaReviewCardThisNote }}</span>
					<span :class="$style.metricStars" aria-hidden="true">{{ thisNoteStarVisual }}</span>
					<span :class="$style.metricValue">({{ meta.stars }}/5)</span>
				</div>
				<div :class="$style.metricRow">
					<span :class="$style.metricLabel"><i class="ti ti-messages"/> {{ i18n.ts._agents.plazaMetricConversations }}</span>
					<span :class="$style.metricValue">{{ conversationCount }}</span>
				</div>
				<div :class="$style.metricRow">
					<span :class="$style.metricLabel"><i class="ti ti-robot"/> {{ i18n.ts._agents.plazaMetricAiReplies }}</span>
					<span :class="$style.metricValue">{{ aiReplyCount }}</span>
				</div>
			</div>
			<div :class="$style.hint">{{ i18n.ts._agents.plazaViewDetails }} <i class="ti ti-chevron-right"/></div>
		</div>
	</div>
</button>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type * as Misskey from 'misskey-js';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';

export type AgentsPlazaReviewNoteMeta = {
	kind: 'character' | 'style';
	id: string;
	name: string;
	stars: number;
	avatar?: Misskey.entities.DriveFile | null;
	plazaRatingAverage?: number | null;
	plazaRatingCount?: number;
	conversationCount?: number;
	aiReplyCount?: number;
};

const props = defineProps<{
	meta: AgentsPlazaReviewNoteMeta;
}>();

const router = useRouter();

const kindLabel = computed(() =>
	props.meta.kind === 'character'
		? i18n.ts._agents.plazaReviewNoteKindCharacter
		: i18n.ts._agents.plazaReviewNoteKindStyle,
);

const plazaRatingCount = computed(() => props.meta.plazaRatingCount ?? 0);

const plazaAggregateAverage = computed(() => props.meta.plazaRatingAverage ?? null);

const plazaAggregateStarVisual = computed(() => {
	const n = plazaAggregateAverage.value;
	if (n == null || !Number.isFinite(n)) return '—';
	const full = Math.max(0, Math.min(5, Math.round(n)));
	return '★'.repeat(full) + '☆'.repeat(5 - full);
});

const plazaAggregateAverageText = computed(() => {
	const n = plazaAggregateAverage.value;
	if (n == null || !Number.isFinite(n)) return '—';
	return n.toFixed(2);
});

const thisNoteStarVisual = computed(() => {
	const s = props.meta.stars;
	const full = Math.max(0, Math.min(5, Math.round(s)));
	return '★'.repeat(full) + '☆'.repeat(5 - full);
});

const conversationCount = computed(() => props.meta.conversationCount ?? 0);

const aiReplyCount = computed(() => props.meta.aiReplyCount ?? 0);

function goDetail() {
	if (props.meta.kind === 'character') {
		router.push(`/agents/square/character/${props.meta.id}` as '/agents/square/character/:characterId');
	} else {
		router.push(`/agents/square/style/${props.meta.id}` as '/agents/square/style/:styleId');
	}
}
</script>

<style lang="scss" module>
.root {
	display: block;
	width: 100%;
	margin: 0 0 10px;
	padding: 0;
	text-align: start;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	color: var(--MI_THEME-fg);
	background: var(--MI_THEME-panel);
	background: color-mix(in srgb, var(--MI_THEME-accent) 10%, var(--MI_THEME-panel));
	overflow: hidden;
	cursor: pointer;
	transition: opacity 0.12s ease, transform 0.12s ease;

	&:hover {
		opacity: 0.95;
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.accent {
	height: 3px;
	width: 100%;
	background: linear-gradient(90deg, var(--MI_THEME-accent), color-mix(in srgb, var(--MI_THEME-accent) 40%, transparent));
}

.inner {
	display: flex;
	align-items: stretch;
	gap: 12px;
	padding: 12px 14px;
}

.avatarWrap {
	flex-shrink: 0;
	width: 52px;
	height: 52px;
	border-radius: 12px;
	overflow: hidden;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}

.avatar {
	width: 100%;
	height: 100%;
	border-radius: 12px;

	:global(.root) {
		width: 100%;
		height: 100%;
		border-radius: 12px;
	}
}

.iconFallback {
	flex-shrink: 0;
	width: 52px;
	height: 52px;
	border-radius: 12px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 1.6rem;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	border: solid 1px var(--MI_THEME-divider);
}

.textCol {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.badgeRow {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px 10px;
}

.badge {
	font-size: 0.72em;
	font-weight: 800;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--MI_THEME-accent);
	opacity: 0.9;
}

.kind {
	font-size: 0.78em;
	font-weight: 700;
	opacity: 0.55;
}

.title {
	font-size: 1.05em;
	font-weight: 800;
	line-height: 1.35;
	word-break: break-word;
	color: var(--MI_THEME-fg);
}

.metricBlock {
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: 0.88em;
}

.metricRow {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 6px 8px;
	line-height: 1.4;
}

.metricLabel {
	font-weight: 700;
	opacity: 0.65;
	flex-shrink: 0;
	display: inline-flex;
	align-items: center;
	gap: 4px;
}

.metricStars {
	color: var(--MI_THEME-warn);
	letter-spacing: 0.04em;
	font-weight: 700;
}

.metricValue {
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	opacity: 0.92;
}

.metricMuted {
	font-weight: 600;
	opacity: 0.5;
}

.hint {
	margin-top: 2px;
	font-size: 0.82em;
	font-weight: 600;
	opacity: 0.55;
	display: inline-flex;
	align-items: center;
	gap: 4px;
}
</style>
