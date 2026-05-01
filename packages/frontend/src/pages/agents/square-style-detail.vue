<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader show-back narrow-merged-row>
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<MkLoading v-if="loading"/>
		<MkInfo v-else-if="styleRow == null">{{ i18n.ts.somethingHappened }}</MkInfo>
		<div v-else class="_gaps_m">
			<div v-panel :class="$style.hero">
				<div :class="$style.styleIconWrap">
					<i class="ti ti-message-cog"></i>
				</div>
				<div :class="$style.heroBody">
					<h1 :class="$style.title">{{ styleRow.name }}</h1>
					<p v-if="styleRow.summary" :class="$style.summary">{{ styleRow.summary }}</p>
					<div :class="$style.badgeRow">
						<span v-if="styleRow.publishedVersion != null" class="_acrylicBadge">V{{ styleRow.publishedVersion }}</span>
						<span v-if="rowState === 'mine'" class="_acrylicBadge">{{ i18n.ts._agents.stylePlazaMine }}</span>
						<span v-else-if="rowState === 'subscribed'" class="_acrylicBadge">{{ i18n.ts._agents.subscribedBadge }}</span>
					</div>
					<div :class="$style.metaBlock">
						<span :class="$style.metaLabel"><i class="ti ti-user-heart"></i> {{ i18n.ts._agents.cardCreator }}</span>
						<div v-if="creator" :class="$style.metaAuthor">
							<MkAvatar :user="creator" class="_noSelect" link preview/>
							<MkUserName :user="creator" :nowrap="false"/>
						</div>
					</div>
					<div :class="$style.timeRow">
						<span :class="$style.timeChip">
							<i class="ti ti-calendar-plus"></i>
							{{ i18n.ts._agents.cardCreated }}
							<MkTime :time="styleRow.createdAt" mode="relative"/>
						</span>
						<span :class="$style.timeChip">
							<i class="ti ti-history"></i>
							{{ i18n.ts._agents.cardUpdated }}
							<MkTime :time="styleRow.updatedAt" mode="relative"/>
						</span>
					</div>
					<div :class="$style.plazaMetrics">
						<div :class="$style.plazaMetric">
							<span :class="$style.plazaMetricLabel"><i class="ti ti-star"/> {{ i18n.ts._agents.plazaMetricRating }}</span>
							<div :class="$style.plazaMetricBody">
								<template v-if="styleRow.rating.count === 0">
									<span :class="$style.plazaMetricMuted">{{ i18n.ts._agents.plazaRatingNone }}</span>
								</template>
								<template v-else>
									<span :class="$style.plazaMetricStars" aria-hidden="true">{{ styleRatingStarString }}</span>
									<span :class="$style.plazaMetricValue">{{ styleRatingAverageText }} · {{ styleRow.rating.count }} {{ i18n.ts._agents.plazaRatingCountSuffix }}</span>
								</template>
							</div>
						</div>
						<div :class="$style.plazaMetric">
							<span :class="$style.plazaMetricLabel"><i class="ti ti-message-cog"/> {{ i18n.ts._agents.plazaMetricAiReplies }}</span>
							<span :class="$style.plazaMetricValue">{{ styleRow.aiReplyCount }}</span>
						</div>
					</div>
				</div>
			</div>

			<MkFolder :defaultOpen="true" :class="$style.folderCard">
				<template #icon><i class="ti ti-ruler"></i></template>
				<template #label>{{ i18n.ts._agents.plazaPromptStatsTitle }}</template>
				<dl :class="$style.statGrid">
					<dt>{{ i18n.ts._agents.fieldStyleBody }}</dt>
					<dd>{{ styleRow.bodyChars }} {{ i18n.ts._agents.plazaStatChars }}</dd>
				</dl>
			</MkFolder>

			<MkFolder v-if="styleRow.promptOpenSourced && styleRow.openSourceBody" :defaultOpen="false" :class="$style.folderCard">
				<template #icon><i class="ti ti-license"></i></template>
				<template #label>{{ i18n.ts._agents.openSourcePromptDetail }}</template>
				<div class="_gaps">
					<MkInfo>{{ i18n.ts._agents.openSourcePromptNotice }}</MkInfo>
					<p :class="$style.promptBody">{{ styleRow.openSourceBody }}</p>
				</div>
			</MkFolder>

			<div v-panel :class="$style.reviewsCard">
				<XSquarePlazaReviews
					:style-id="styleRow.id"
					:rating="styleRow.rating"
					:show-rating-summary="false"
					@updated="load"
				/>
			</div>

			<div v-panel :class="$style.footerActions">
				<MkButton rounded @click="goPlaza"><i class="ti ti-layout-grid"></i> {{ i18n.ts._agents.navSquare }}</MkButton>
				<MkButton v-if="rowState === 'other'" rounded @click="subscribe"><i class="ti ti-plus"></i> {{ i18n.ts._agents.addStyleToMine }}</MkButton>
				<MkButton v-if="rowState === 'subscribed'" rounded @click="unsubscribe"><i class="ti ti-x"></i> {{ i18n.ts._agents.removeStyleFromMine }}</MkButton>
				<MkButton v-if="rowState === 'mine'" rounded @click="goEdit"><i class="ti ti-pencil"></i> {{ i18n.ts._agents.edit }}</MkButton>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import type { UserDetailed } from 'misskey-js/entities.js';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import MkTime from '@/components/global/MkTime.vue';
import XSquarePlazaReviews from './square-plaza-reviews.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';
import { $i } from '@/i.js';

const props = defineProps<{
	styleId: string;
}>();

const router = useRouter();

type StylePlazaDetail = {
	id: string;
	userId: string;
	name: string;
	summary: string | null;
	bodyChars: number;
	publishedVersion?: number | null;
	createdAt: string;
	updatedAt: string;
	rating: { average: number | null; count: number };
	myReview?: { noteId: string; stars: number };
	conversationCount: number;
	aiReplyCount: number;
	promptOpenSourced: boolean;
	openSourceBody?: string;
};

const loading = ref(true);
const styleRow = ref<StylePlazaDetail | null>(null);
const creator = ref<UserDetailed | null>(null);
const usableSubscribed = ref(false);

const rowState = computed<'mine' | 'subscribed' | 'other'>(() => {
	if (styleRow.value == null) return 'other';
	if ($i && styleRow.value.userId === $i.id) return 'mine';
	if (usableSubscribed.value) return 'subscribed';
	return 'other';
});

function starStringFromAverage(n: number | null) {
	if (n == null || !Number.isFinite(n)) return '—';
	const full = Math.round(n);
	return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
}

const styleRatingStarString = computed(() => {
	const s = styleRow.value;
	if (s == null) return '—';
	return starStringFromAverage(s.rating.average);
});

const styleRatingAverageText = computed(() => {
	const s = styleRow.value;
	if (s == null) return '—';
	const a = s.rating.average;
	if (a == null || !Number.isFinite(a)) return '—';
	return a.toFixed(2);
});

definePage(computed(() => ({
	title: styleRow.value?.name ?? i18n.ts._agents.stylesPlazaTab,
	icon: 'ti ti-message-cog',
})));

async function loadUsableFlag() {
	try {
		const usable = await misskeyApi('agents/styles/list-usable', {}) as { id: string; subscribed: boolean }[];
		const hit = usable.find(u => u.id === props.styleId);
		usableSubscribed.value = hit?.subscribed === true;
	} catch {
		usableSubscribed.value = false;
	}
}

async function load() {
	loading.value = true;
	styleRow.value = null;
	creator.value = null;
	try {
		await loadUsableFlag();
		const row = await misskeyApi(
			'agents/styles/plaza-detail' as keyof Misskey.Endpoints,
			{ styleId: props.styleId } as Misskey.Endpoints[keyof Misskey.Endpoints]['req'],
		) as StylePlazaDetail;
		styleRow.value = row;
		creator.value = await misskeyApi('users/show', { userId: row.userId }) as UserDetailed;
	} catch {
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	} finally {
		loading.value = false;
	}
}

function goPlaza() {
	router.push('/agents' as '/agents');
}

function goEdit() {
	router.push(('/agents/style/' + props.styleId) as '/agents/style/:styleId');
}

async function subscribe() {
	try {
		await misskeyApi('agents/styles/subscribe', { styleId: props.styleId });
		await load();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}

async function unsubscribe() {
	try {
		await misskeyApi('agents/styles/unsubscribe', { styleId: props.styleId });
		await load();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}

onMounted(() => { void load(); });
watch(() => props.styleId, () => { void load(); });
</script>

<style lang="scss" module>
.hero {
	display: flex;
	gap: 16px;
	align-items: flex-start;
	flex-wrap: wrap;
	padding: 16px;
	border-radius: var(--MI-radius);
	background: linear-gradient(145deg, color-mix(in srgb, var(--MI_THEME-accent) 10%, var(--MI_THEME-panel)), var(--MI_THEME-panel));
	border: solid 1px var(--MI_THEME-divider);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.styleIconWrap {
	flex-shrink: 0;
	width: 88px;
	height: 88px;
	border-radius: 18px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 2.1rem;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	border: solid 1px var(--MI_THEME-divider);
}

.heroBody {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.title {
	margin: 0;
	font-size: 1.35em;
	font-weight: 800;
	line-height: 1.3;
}

.summary {
	margin: 0;
	font-size: 0.95em;
	line-height: 1.55;
	opacity: 0.9;
	white-space: pre-line;
	padding: 10px 12px;
	border-radius: 10px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 35%, transparent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 80%, transparent);
}

.badgeRow {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.metaBlock {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin-top: 4px;
}

.metaLabel {
	font-size: 0.78em;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	opacity: 0.55;
	display: flex;
	align-items: center;
	gap: 6px;
}

.metaAuthor {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.timeRow {
	display: flex;
	flex-wrap: wrap;
	gap: 10px 16px;
	font-size: 0.82em;
	opacity: 0.72;
}

.timeChip {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	white-space: nowrap;
}

.plazaMetrics {
	display: flex;
	flex-wrap: wrap;
	gap: 12px 20px;
	margin-top: 6px;
	padding: 12px 14px;
	border-radius: var(--MI-radius);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 16%, var(--MI_THEME-divider));
	background: linear-gradient(150deg, color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-panel)), var(--MI_THEME-panel));
}

.plazaMetric {
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-width: 0;
	padding: 8px 10px;
	border-radius: 10px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 24%, transparent);
}

.plazaMetricLabel {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 0.78em;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	opacity: 0.62;
}

.plazaMetricBody {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px 10px;
}

.plazaMetricStars {
	color: var(--MI_THEME-warn);
	letter-spacing: 0.04em;
}

.plazaMetricValue {
	font-size: 0.95em;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.plazaMetricMuted {
	font-size: 0.92em;
	opacity: 0.72;
}

.statGrid {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 8px 16px;
	margin: 0;
	font-size: 0.92em;
	line-height: 1.45;

	dt {
		margin: 0;
		font-weight: 600;
		opacity: 0.75;
	}

	dd {
		margin: 0;
		text-align: end;
		font-variant-numeric: tabular-nums;
	}
}

.footerActions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	padding: 12px;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 88%, transparent);
}

.folderCard {
	border-radius: var(--MI-radius);
}

.reviewsCard {
	border-radius: var(--MI-radius);
	padding: 4px;
}

.promptBody {
	margin: 0;
	padding: 10px 12px;
	white-space: pre-wrap;
	line-height: 1.6;
	font-size: 0.92em;
	border-radius: 10px;
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-bg) 30%, transparent);
}
</style>
