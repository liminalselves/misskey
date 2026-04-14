<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button type="button" :class="$style.root" @click="goDetail">
	<div :class="$style.inner">
		<div :class="$style.headRow">
			<div v-if="meta.kind === 'character' && meta.avatar" :class="$style.avatarWrap">
				<MkDriveFileThumbnail :file="meta.avatar" fit="cover" :class="$style.avatar"/>
			</div>
			<div v-else :class="$style.iconFallback">
				<i :class="meta.kind === 'character' ? 'ti ti-user' : 'ti ti-message-cog'"></i>
			</div>
			<div :class="$style.headText">
				<div :class="$style.badgeRow">
					<span :class="$style.badge">{{ i18n.ts._agents.plazaReviewNoteBadge }}</span>
					<span :class="$style.kind">{{ kindLabel }}</span>
				</div>
				<div :class="$style.title">「{{ meta.name }}」</div>
			</div>
			<div :class="$style.chevron"><i class="ti ti-chevron-right"/></div>
		</div>
		<div :class="$style.metricGrid">
			<div :class="$style.metricCard">
				<div :class="$style.metricTop"><i class="ti ti-star"/> {{ i18n.ts._agents.plazaMetricRating }}</div>
				<template v-if="plazaRatingCount === 0">
					<div :class="$style.metricMuted">{{ i18n.ts._agents.plazaRatingNone }}</div>
				</template>
				<template v-else>
					<div :class="$style.metricStars" aria-hidden="true">{{ plazaAggregateStarVisual }}</div>
					<div :class="$style.metricValue">{{ plazaAggregateAverageText }} · {{ plazaRatingCount }} {{ i18n.ts._agents.plazaRatingCountSuffix }}</div>
				</template>
			</div>
			<div :class="$style.metricCard">
				<div :class="$style.metricTop">{{ i18n.ts._agents.plazaReviewCardThisNote }}</div>
				<div :class="$style.metricStars" aria-hidden="true">{{ thisNoteStarVisual }}</div>
				<div :class="$style.metricValue">({{ meta.stars }}/5)</div>
			</div>
			<div :class="$style.metricCard">
				<div :class="$style.metricTop"><i class="ti ti-message-cog"/> {{ i18n.ts._agents.plazaMetricAiReplies }}</div>
				<div :class="$style.metricValue">{{ aiReplyCount }}</div>
			</div>
		</div>
		<div :class="$style.hint">{{ i18n.ts._agents.plazaViewDetails }}</div>
	</div>
	<div :class="$style.accent"/>
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
	background: linear-gradient(155deg, color-mix(in srgb, var(--MI_THEME-accent) 9%, var(--MI_THEME-panel)), var(--MI_THEME-panel));
	overflow: hidden;
	cursor: pointer;
	transition: transform 0.15s ease, box-shadow 0.15s ease;

	&:hover {
		transform: translateY(-1px);
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.accent {
	height: 3px;
	width: 100%;
	background: linear-gradient(90deg, var(--MI_THEME-accent), color-mix(in srgb, var(--MI_THEME-accent) 35%, transparent));
}

.inner {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px 14px;
}

.headRow {
	display: flex;
	align-items: center;
	gap: 10px;
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

.headText {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.chevron {
	flex-shrink: 0;
	opacity: 0.45;
	font-size: 1rem;
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
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	color: var(--MI_THEME-fg);
}

.metricGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
	gap: 8px;
}

.metricCard {
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 4px;
	padding: 9px 10px;
	border-radius: 10px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 24%, transparent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 75%, transparent);
	min-height: 64px;
}

.metricTop {
	display: inline-flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 5px;
	line-height: 1.25;
	font-weight: 700;
	font-size: 0.82em;
	opacity: 0.65;
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
	font-size: 0.92em;
}

.metricMuted {
	font-weight: 600;
	opacity: 0.5;
}

.hint {
	font-size: 0.82em;
	font-weight: 600;
	opacity: 0.55;
	display: inline-flex;
	align-items: center;
}

@media (max-width: 520px) {
	.metricGrid {
		grid-template-columns: 1fr;
	}
}
</style>
