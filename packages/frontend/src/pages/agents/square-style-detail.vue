<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader showBack narrowMergedRow>
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<MkLoading v-if="loading"/>
		<MkInfo v-else-if="styleRow == null">{{ i18n.ts.somethingHappened }}</MkInfo>
		<div v-else class="_gaps_m">
			<div v-panel :class="$style.hero">
				<div :class="$style.heroTop">
					<div :class="$style.styleIconWrap">
						<i class="ti ti-message-cog"></i>
					</div>
					<div :class="$style.heroHead">
						<div :class="$style.titleRow">
							<h1 :class="$style.title">{{ styleRow.name }}</h1>
							<span v-if="styleRow.publishedVersion != null" class="_acrylicBadge">V{{ styleRow.publishedVersion }}</span>
							<span v-if="rowState === 'mine'" class="_acrylicBadge">{{ i18n.ts._agents.stylePlazaMine }}</span>
							<span v-else-if="rowState === 'subscribed'" class="_acrylicBadge">{{ i18n.ts._agents.subscribedBadge }}</span>
						</div>
						<MkA v-if="creator" v-user-preview="creator.id" :to="userPage(creator)" :class="$style.creatorRow" :title="i18n.ts._agents.cardCreator">
							<MkAvatar :user="creator" :class="$style.creatorAvatar"/>
							<MkUserName :user="creator" :class="$style.creatorName"/>
							<MkAcct :user="creator" :class="$style.creatorAcct"/>
						</MkA>
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
					</div>
				</div>

				<p v-if="styleRow.summary" :class="$style.summary">{{ styleRow.summary }}</p>

				<div :class="$style.metricsGrid">
					<div :class="$style.metricCard">
						<span :class="$style.metricLabel"><i class="ti ti-star"></i> {{ i18n.ts._agents.plazaMetricRating }}</span>
						<div :class="$style.metricBody">
							<template v-if="styleRow.rating.count === 0">
								<span :class="$style.metricMuted">{{ i18n.ts._agents.plazaRatingNone }}</span>
							</template>
							<template v-else>
								<span :class="$style.metricStars" aria-hidden="true">{{ styleRatingStarString }}</span>
								<span :class="$style.metricSub">{{ styleRatingAverageText }} · {{ styleRow.rating.count }} {{ i18n.ts._agents.plazaRatingCountSuffix }}</span>
							</template>
						</div>
					</div>
					<div :class="$style.metricCard">
						<span :class="$style.metricLabel"><i class="ti ti-message-cog"></i> {{ i18n.ts._agents.plazaMetricAiReplies }}</span>
						<span :class="$style.metricValue">{{ styleRow.aiReplyCount }}</span>
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
					:styleId="styleRow.id"
					:rating="styleRow.rating"
					:showRatingSummary="false"
					@updated="load"
				/>
			</div>

			<div v-panel :class="$style.footerActions">
				<MkButton rounded :class="$style.footerBtn" @click="goPlaza"><i class="ti ti-layout-grid"></i> {{ i18n.ts._agents.navSquare }}</MkButton>
				<MkButton v-if="rowState === 'other'" rounded :class="$style.footerBtn" @click="subscribe"><i class="ti ti-plus"></i> {{ i18n.ts._agents.addStyleToMine }}</MkButton>
				<MkButton v-if="rowState === 'subscribed'" rounded :class="$style.footerBtn" @click="unsubscribe"><i class="ti ti-x"></i> {{ i18n.ts._agents.removeStyleFromMine }}</MkButton>
				<MkButton v-if="rowState === 'mine'" rounded :class="$style.footerBtn" @click="goEdit"><i class="ti ti-pencil"></i> {{ i18n.ts._agents.edit }}</MkButton>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import XSquarePlazaReviews from './square-plaza-reviews.vue';
import type * as Misskey from 'misskey-js';
import type { UserDetailed } from 'misskey-js/entities.js';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import MkTime from '@/components/global/MkTime.vue';
import { userPage } from '@/filters/user.js';
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
	title: styleRow.value?.name ?? i18n.ts._agents.stylesTab,
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
	router.push('/agents' as const);
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
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 20px;
	border-radius: var(--MI-radius);
	background: linear-gradient(160deg, color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-panel)), var(--MI_THEME-panel) 60%);
	border: solid 1px var(--MI_THEME-divider);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
	overflow: hidden;

	&::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--MI_THEME-accent), color-mix(in srgb, var(--MI_THEME-accent) 25%, transparent) 55%, transparent);
	}
}

.heroTop {
	display: flex;
	gap: 16px;
	align-items: flex-start;
}

.styleIconWrap {
	flex-shrink: 0;
	width: 96px;
	height: 96px;
	border-radius: 24px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 2.2rem;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	border: solid 2px color-mix(in srgb, var(--MI_THEME-accent) 35%, var(--MI_THEME-divider));
	box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
}

.heroHead {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.titleRow {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.title {
	margin: 0;
	font-size: 1.3em;
	font-weight: 800;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.creatorRow {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	align-self: flex-start;
	max-width: 100%;
	min-width: 0;
	padding: 4px 12px 4px 4px;
	border-radius: 999px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 80%, transparent);
	background: color-mix(in srgb, var(--MI_THEME-panel) 72%, transparent);
	transition: background 0.15s ease, border-color 0.15s ease;

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-panel));
		border-color: color-mix(in srgb, var(--MI_THEME-accent) 35%, var(--MI_THEME-divider));
		text-decoration: none;
	}
}

a.creatorRow {
	color: var(--MI_THEME-fg);
}

.creatorAvatar {
	width: 26px;
	height: 26px;
}

.creatorName {
	font-size: 0.92em;
	font-weight: 700;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.creatorAcct {
	font-size: 0.84em;
	opacity: 0.6;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.timeRow {
	display: flex;
	flex-wrap: wrap;
	gap: 6px 16px;
	font-size: 0.82em;
	opacity: 0.72;
}

.timeChip {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	white-space: nowrap;
}

.summary {
	margin: 0;
	padding: 12px 14px;
	font-size: 0.95em;
	line-height: 1.7;
	opacity: 0.95;
	white-space: pre-line;
	overflow-wrap: anywhere;
	border-radius: 10px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 70%, transparent);
	border-left: solid 3px var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-bg) 40%, transparent);
}

.metricsGrid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.metricCard {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
	padding: 12px 14px;
	border-radius: 10px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 18%, var(--MI_THEME-divider));
	background: color-mix(in srgb, var(--MI_THEME-panel) 55%, transparent);
}

.metricLabel {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 0.78em;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	opacity: 0.62;
}

.metricBody {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 4px 10px;
}

.metricStars {
	color: var(--MI_THEME-warn);
	font-size: 1.1em;
	letter-spacing: 0.04em;
}

.metricValue {
	font-size: 1.5em;
	font-weight: 800;
	font-variant-numeric: tabular-nums;
	line-height: 1.2;
}

.metricSub {
	font-size: 0.85em;
	opacity: 0.7;
}

.metricMuted {
	font-size: 0.95em;
	opacity: 0.7;
}

.statGrid {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	margin: 0;
	font-size: 0.92em;
	line-height: 1.45;

	dt,
	dd {
		margin: 0;
		padding: 7px 10px;
	}

	dt {
		font-weight: 600;
		opacity: 0.75;
	}

	dd {
		text-align: end;
		font-variant-numeric: tabular-nums;
	}

	dt:nth-of-type(odd),
	dd:nth-of-type(odd) {
		background: color-mix(in srgb, var(--MI_THEME-bg) 30%, transparent);
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

.footerBtn {
	flex: 1 1 auto;
	min-width: 120px;
}

@media (max-width: 600px) {
	.hero {
		padding: 16px;
		gap: 12px;
	}

	.heroTop {
		gap: 12px;
	}

	.styleIconWrap {
		width: 72px;
		height: 72px;
		border-radius: 18px;
		font-size: 1.8rem;
	}

	.title {
		font-size: 1.15em;
	}

	.metricValue {
		font-size: 1.3em;
	}
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
