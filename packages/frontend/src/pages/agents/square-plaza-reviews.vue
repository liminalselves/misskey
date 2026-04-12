<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div id="plaza-reviews" class="_gaps_m">
	<div v-if="showRatingSummary" :class="$style.ratingBar">
		<span :class="$style.ratingLabel">{{ i18n.ts._agents.plazaRatingTitle }}</span>
		<span v-if="rating.count === 0" :class="$style.ratingMuted">{{ i18n.ts._agents.plazaRatingNone }}</span>
		<template v-else>
			<span :class="$style.ratingStars" aria-hidden="true">{{ starString(rating.average) }}</span>
			<span :class="$style.ratingMeta">{{ ratingAverageText }} · {{ rating.count }} {{ i18n.ts._agents.plazaRatingCountSuffix }}</span>
		</template>
	</div>

	<section v-panel :class="$style.formSection">
		<h2 :class="$style.formSectionTitle">
			<i class="ti ti-star"/>
			{{ i18n.ts._agents.plazaReviewFormTitle }}
		</h2>
		<div class="_gaps">
			<div :class="$style.starPick">
				<span :class="$style.starPickLabel">{{ i18n.ts._agents.plazaReviewStars }}</span>
				<div :class="$style.starButtons">
					<button
						v-for="s in starOptions"
						:key="s"
						type="button"
						class="_button"
						:class="[$style.starBtn, formStars === s ? $style.starBtnOn : '']"
						@click="formStars = s"
					>
						{{ s }}
					</button>
				</div>
			</div>
			<MkTextarea v-model="formText" :disabled="submitting" tall>
				<template #label>{{ i18n.ts._agents.plazaReviewComment }}</template>
				<template #caption>{{ i18n.ts._agents.plazaReviewCommentHint }}</template>
			</MkTextarea>
			<MkRadios v-model="visibility" :options="visibilityOptions">
				<template #label>{{ i18n.ts.visibility }}</template>
			</MkRadios>
			<MkButton primary rounded :disabled="submitDisabled" @click="submit">
				<template v-if="submitting"><MkLoading :em="true"/></template>
				<template v-else>{{ i18n.ts._agents.plazaReviewSubmit }}</template>
			</MkButton>
		</div>
	</section>

	<div :class="$style.reviewsHead">
		<h2 :class="$style.reviewsTitle">{{ i18n.ts._agents.plazaReviewsListTitle }}</h2>
		<MkButton rounded small :disabled="listLoading" @click="loadList">
			<i class="ti ti-refresh"/>
		</MkButton>
	</div>
	<MkLoading v-if="listLoading && reviews.length === 0"/>
	<div v-else class="_gaps">
		<MkInfo v-if="reviews.length === 0">{{ i18n.ts._agents.plazaReviewsEmpty }}</MkInfo>
		<div v-for="(row, i) in reviews" :key="row.note.id + '-' + i" :class="$style.reviewCard">
			<MkNote :note="row.note" :withHardMute="true"/>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import MkTextarea from '@/components/MkTextarea.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkNote from '@/components/MkNote.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { prefer } from '@/preferences.js';

const props = withDefaults(defineProps<{
	characterId?: string;
	styleId?: string;
	rating: { average: number | null; count: number };
	/** 为 false 时不在此组件顶部重复展示评分条（由详情页 hero 展示） */
	showRatingSummary?: boolean;
}>(), {
	showRatingSummary: true,
});

const emit = defineEmits<{
	(e: 'updated'): void;
}>();

const starOptions = [0, 1, 2, 3, 4, 5] as const;
const reviews = ref<{ stars: number; note: Misskey.entities.Note }[]>([]);
const listLoading = ref(false);
const submitting = ref(false);
const formStars = ref<number>(5);
const formText = ref('');
const visibility = ref<'public' | 'followers'>(
	prefer.s.defaultNoteVisibility === 'followers' ? 'followers' : 'public',
);

const visibilityOptions = computed(() => [
	{ value: 'public' as const, label: i18n.ts._visibility.public },
	{ value: 'followers' as const, label: i18n.ts._visibility.followers },
]);

const submitDisabled = computed(() => submitting.value || formText.value.trim().length === 0);

const ratingAverageText = computed(() => {
	const a = props.rating.average;
	if (a == null || !Number.isFinite(a)) return '—';
	return a.toFixed(2);
});

function starString(n: number | null) {
	if (n == null || !Number.isFinite(n)) return '—';
	const full = Math.round(n);
	return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
}

async function loadList() {
	listLoading.value = true;
	try {
		const q = props.characterId
			? { characterId: props.characterId, limit: 30 }
			: { styleId: props.styleId!, limit: 30 };
		const res = await misskeyApi(
			'agents/plaza-reviews/list' as keyof Misskey.Endpoints,
			q as Misskey.Endpoints[keyof Misskey.Endpoints]['req'],
		) as { reviews: { stars: number; note: Misskey.entities.Note }[] };
		reviews.value = res.reviews ?? [];
	} catch {
		reviews.value = [];
	} finally {
		listLoading.value = false;
	}
}

async function submit() {
	if (submitDisabled.value) return;
	submitting.value = true;
	try {
		const base = {
			stars: formStars.value,
			text: formText.value.trim(),
			visibility: visibility.value,
			localOnly: false,
			visibleUserIds: [] as string[],
		};
		if (props.characterId) {
			await misskeyApi(
				'agents/plaza-reviews/create' as keyof Misskey.Endpoints,
				{ ...base, characterId: props.characterId } as Misskey.Endpoints[keyof Misskey.Endpoints]['req'],
			);
		} else {
			await misskeyApi(
				'agents/plaza-reviews/create' as keyof Misskey.Endpoints,
				{ ...base, styleId: props.styleId! } as Misskey.Endpoints[keyof Misskey.Endpoints]['req'],
			);
		}
		formText.value = '';
		os.toast(i18n.ts._agents.plazaReviewSubmitted);
		emit('updated');
		await loadList();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		submitting.value = false;
	}
}

onMounted(() => { void loadList(); });
watch(() => [props.characterId, props.styleId], () => { void loadList(); });
</script>

<style lang="scss" module>
.formSection {
	padding: 14px 14px 16px;
	border-radius: var(--MI-radius);
}

.formSectionTitle {
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 0 0 8px;
	font-size: 1.05em;
	font-weight: 800;
	line-height: 1.35;
}

.ratingBar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 12px;
	padding: 10px 12px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
}

.ratingLabel {
	font-weight: 700;
	font-size: 0.95em;
}

.ratingMuted {
	opacity: 0.65;
	font-size: 0.92em;
}

.ratingStars {
	color: var(--MI_THEME-warn);
	letter-spacing: 0.05em;
}

.ratingMeta {
	font-size: 0.88em;
	opacity: 0.8;
}

.starPick {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.starPickLabel {
	font-size: 0.85em;
	font-weight: 600;
	opacity: 0.75;
}

.starButtons {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.starBtn {
	min-width: 2.25rem;
	height: 2.25rem;
	border-radius: 8px;
	border: solid 1px var(--MI_THEME-divider);
	font-weight: 700;
}

.starBtnOn {
	border-color: var(--MI_THEME-accent);
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
}

.reviewsHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-top: 4px;
}

.reviewsTitle {
	margin: 0;
	font-size: 1.05em;
	font-weight: 800;
}

.reviewCard {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
</style>
