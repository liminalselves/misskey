<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkTab
		v-model="sub"
		:tabs="subTabs"
		style="margin-bottom: var(--MI-margin);"
	/>

	<template v-if="sub === 'characters'">
		<div :class="$style.sortBar">
			<div :class="$style.sortInfo">{{ i18n.ts._agents.exploreSubCharacters }} · {{ list.length }}</div>
			<div :class="$style.sortControls">
				<div :class="$style.sortSwitch" role="tablist" :aria-label="i18n.ts.sort">
					<button type="button" :class="[$style.sortBtn, sortCharacters === 'recommended' ? $style.sortBtnActive : '']" @click="sortCharacters = 'recommended'">{{ i18n.ts.recommended }}</button>
					<button type="button" :class="[$style.sortBtn, sortCharacters === 'heat' ? $style.sortBtnActive : '']" @click="sortCharacters = 'heat'">{{ i18n.ts.exploreFeaturedSortHeat }}</button>
					<button type="button" :class="[$style.sortBtn, sortCharacters === 'rating' ? $style.sortBtnActive : '']" @click="sortCharacters = 'rating'">{{ i18n.ts._agents.plazaMetricRating }}</button>
					<button type="button" :class="[$style.sortBtn, sortCharacters === 'latest' ? $style.sortBtnActive : '']" @click="sortCharacters = 'latest'">{{ i18n.ts.exploreFeaturedSortLatest }}</button>
				</div>
				<MkButton v-tooltip="i18n.ts.reload" iconOnly transparent rounded @click="loadCharacters(true)">
					<i class="ti ti-refresh"></i>
				</MkButton>
			</div>
		</div>
		<MkLoading v-if="loadingCh"/>
		<MkInfo v-else-if="list.length === 0">{{ i18n.ts._agents.noAgentsYet }}</MkInfo>
		<div v-else :class="$style.grid">
			<div v-for="a in list" :key="a.id" v-panel :class="$style.card">
				<div :class="$style.cardMain">
					<div :class="$style.charAvatarWrap">
						<MkDriveFileThumbnail
							v-if="a.avatar"
							:file="a.avatar"
							fit="cover"
							:class="$style.charThumb"
						/>
						<div v-else :class="$style.charAvatarFallback"><i class="ti ti-user"></i></div>
					</div>
					<div :class="$style.cardBody">
						<div :class="$style.cardTitleRow">
							<span :class="$style.cardTitle">{{ a.name }}</span>
							<div :class="$style.badgeRow">
								<span v-if="a.publishedVersion != null" :class="$style.metaBadge">V{{ a.publishedVersion }}</span>
							</div>
						</div>
						<p v-if="a.summary" :class="$style.cardSummary">{{ a.summary }}</p>
						<div :class="$style.cardMeta">
							<span :class="$style.metaLabel"><i class="ti ti-user-heart"></i> {{ i18n.ts._agents.cardCreator }}</span>
							<div :class="$style.metaAuthor">
								<MkAvatar :user="a.user" class="_noSelect" link preview/>
								<MkUserName :user="a.user" :nowrap="false" :class="$style.metaUserName"/>
							</div>
						</div>
						<div :class="$style.cardTimes">
							<span :class="$style.timeChip">
								<i class="ti ti-calendar-plus"></i>
								{{ i18n.ts._agents.cardCreated }}
								<MkTime :time="a.createdAt" mode="relative"/>
							</span>
							<span :class="$style.timeChip">
								<i class="ti ti-history"></i>
								{{ i18n.ts._agents.cardUpdated }}
								<MkTime :time="a.updatedAt" mode="relative"/>
							</span>
						</div>
						<div :class="$style.plazaRow">
							<span :class="$style.plazaLabel"><i class="ti ti-star"></i> {{ i18n.ts._agents.plazaMetricRating }}</span>
							<template v-if="a.rating.count === 0">
								<span :class="$style.plazaMuted">{{ i18n.ts._agents.plazaRatingNone }}</span>
							</template>
							<template v-else>
								<span :class="$style.plazaStars" aria-hidden="true">{{ plazaStarVisual(a.rating.average) }}</span>
								<span :class="$style.plazaVal">{{ plazaAverageText(a.rating.average) }} · {{ a.rating.count }} {{ i18n.ts._agents.plazaRatingCountSuffix }}</span>
							</template>
							<span :class="$style.plazaSep">·</span>
							<span :class="$style.plazaLabel"><i class="ti ti-message-cog"></i> {{ i18n.ts._agents.plazaMetricAiReplies }}</span>
							<span :class="$style.plazaVal">{{ a.aiReplyCount }}</span>
						</div>
					</div>
				</div>
				<div :class="$style.cardActions">
					<MkButton rounded @click="goCharacterDetail(a.id)"><i class="ti ti-eye"></i> {{ i18n.ts._agents.plazaViewDetails }}</MkButton>
					<MkButton primary rounded @click="startPlay(a)"><i class="ti ti-message"></i> {{ i18n.ts._agents.play }}</MkButton>
				</div>
			</div>
			<div v-if="loadingMoreCharacters" class="_buttonsCenter">
				<MkLoading/>
			</div>
		</div>
	</template>

	<template v-else>
		<div :class="$style.sortBar">
			<div :class="$style.sortInfo">{{ i18n.ts._agents.stylesPlazaTab }} · {{ plazaStyles.length }}</div>
			<div :class="$style.sortControls">
				<div :class="$style.sortSwitch" role="tablist" :aria-label="i18n.ts.sort">
					<button type="button" :class="[$style.sortBtn, sortStyles === 'recommended' ? $style.sortBtnActive : '']" @click="sortStyles = 'recommended'">{{ i18n.ts.recommended }}</button>
					<button type="button" :class="[$style.sortBtn, sortStyles === 'heat' ? $style.sortBtnActive : '']" @click="sortStyles = 'heat'">{{ i18n.ts.exploreFeaturedSortHeat }}</button>
					<button type="button" :class="[$style.sortBtn, sortStyles === 'rating' ? $style.sortBtnActive : '']" @click="sortStyles = 'rating'">{{ i18n.ts._agents.plazaMetricRating }}</button>
					<button type="button" :class="[$style.sortBtn, sortStyles === 'latest' ? $style.sortBtnActive : '']" @click="sortStyles = 'latest'">{{ i18n.ts.exploreFeaturedSortLatest }}</button>
				</div>
				<MkButton v-tooltip="i18n.ts.reload" iconOnly transparent rounded @click="loadPlaza(true)">
					<i class="ti ti-refresh"></i>
				</MkButton>
			</div>
		</div>
		<MkLoading v-if="loadingPlaza"/>
		<MkInfo v-else-if="plazaStyles.length === 0">{{ i18n.ts._agents.stylesPlazaEmpty }}</MkInfo>
		<div v-else :class="$style.grid">
			<div v-for="s in plazaStyles" :key="s.id" v-panel :class="$style.card">
				<div :class="$style.cardMain">
					<div :class="$style.styleIconWrap">
						<i class="ti ti-message-cog"></i>
					</div>
					<div :class="$style.cardBody">
						<div :class="$style.cardTitleRow">
							<span :class="$style.cardTitle">{{ s.name }}</span>
							<div :class="$style.badgeRow">
								<span v-if="s.publishedVersion != null" :class="$style.metaBadge">V{{ s.publishedVersion }}</span>
								<span v-if="plazaRowState(s) === 'mine'" :class="$style.metaBadge">{{ i18n.ts._agents.stylePlazaMine }}</span>
								<span v-else-if="plazaRowState(s) === 'subscribed'" :class="$style.metaBadge">{{ i18n.ts._agents.subscribedBadge }}</span>
							</div>
						</div>
						<p v-if="s.summary" :class="$style.cardSummary">{{ s.summary }}</p>
						<p v-else-if="s.bodyPreview" :class="$style.cardSummary">{{ s.bodyPreview }}</p>
						<div :class="$style.cardMeta">
							<span :class="$style.metaLabel"><i class="ti ti-user-heart"></i> {{ i18n.ts._agents.cardCreator }}</span>
							<div :class="$style.metaAuthor">
								<MkAvatar :user="s.user" class="_noSelect" link preview/>
								<MkUserName :user="s.user" :nowrap="false" :class="$style.metaUserName"/>
							</div>
						</div>
						<div :class="$style.cardTimes">
							<span :class="$style.timeChip">
								<i class="ti ti-calendar-plus"></i>
								{{ i18n.ts._agents.cardCreated }}
								<MkTime :time="s.createdAt" mode="relative"/>
							</span>
							<span :class="$style.timeChip">
								<i class="ti ti-history"></i>
								{{ i18n.ts._agents.cardUpdated }}
								<MkTime :time="s.updatedAt" mode="relative"/>
							</span>
						</div>
						<div :class="$style.plazaRow">
							<span :class="$style.plazaLabel"><i class="ti ti-star"></i> {{ i18n.ts._agents.plazaMetricRating }}</span>
							<template v-if="s.rating.count === 0">
								<span :class="$style.plazaMuted">{{ i18n.ts._agents.plazaRatingNone }}</span>
							</template>
							<template v-else>
								<span :class="$style.plazaStars" aria-hidden="true">{{ plazaStarVisual(s.rating.average) }}</span>
								<span :class="$style.plazaVal">{{ plazaAverageText(s.rating.average) }} · {{ s.rating.count }} {{ i18n.ts._agents.plazaRatingCountSuffix }}</span>
							</template>
							<span :class="$style.plazaSep">·</span>
							<span :class="$style.plazaLabel"><i class="ti ti-message-cog"></i> {{ i18n.ts._agents.plazaMetricAiReplies }}</span>
							<span :class="$style.plazaVal">{{ s.aiReplyCount }}</span>
						</div>
					</div>
				</div>
				<div :class="$style.cardActions">
					<MkButton rounded @click="goStyleDetail(s.id)"><i class="ti ti-eye"></i> {{ i18n.ts._agents.plazaViewDetails }}</MkButton>
					<MkButton v-if="plazaRowState(s) === 'other'" rounded @click="subscribe(s.id)"><i class="ti ti-plus"></i> {{ i18n.ts._agents.addStyleToMine }}</MkButton>
					<MkButton v-if="plazaRowState(s) === 'subscribed'" rounded @click="unsubscribe(s.id)"><i class="ti ti-x"></i> {{ i18n.ts._agents.removeStyleFromMine }}</MkButton>
					<MkButton v-if="plazaRowState(s) === 'mine'" rounded @click="router.push(('/agents/style/' + s.id) as '/agents/style/:styleId')"><i class="ti ti-pencil"></i> {{ i18n.ts._agents.edit }}</MkButton>
				</div>
			</div>
			<div v-if="loadingMoreStyles" class="_buttonsCenter">
				<MkLoading/>
			</div>
		</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AgentsCharactersPublicListResponse, AgentsStylesPublicListResponse } from 'misskey-js/entities.js';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkTab from '@/components/MkTab.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import MkTime from '@/components/global/MkTime.vue';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';
import { $i } from '@/i.js';

const router = useRouter();
const sub = ref<'characters' | 'stylesPlaza'>('characters');
const subTabs = computed(() => [
	{ key: 'characters', label: i18n.ts._agents.exploreSubCharacters },
	{ key: 'stylesPlaza', label: i18n.ts._agents.stylesPlazaTab },
]);

type SortKey = 'recommended' | 'heat' | 'rating' | 'latest';

const sortCharacters = ref<SortKey>('recommended');
const sortStyles = ref<SortKey>('recommended');

const list = ref<AgentsCharactersPublicListResponse>([]);
const loadingCh = ref(true);
const plazaStyles = ref<AgentsStylesPublicListResponse>([]);
const usableById = ref<Map<string, { isMine: boolean; subscribed: boolean }>>(new Map());
const loadingPlaza = ref(true);

// Sorting is handled server-side for correct pagination.

const charactersOffset = ref(0);
const stylesOffset = ref(0);
const canLoadMoreCharacters = ref(true);
const canLoadMoreStyles = ref(true);
const loadingMoreCharacters = ref(false);
const loadingMoreStyles = ref(false);
let scrollTicking = false;
const SCROLL_NEAR_BOTTOM_PX = 420;

function plazaStarVisual(avg: number | null | undefined): string {
	if (avg == null || !Number.isFinite(avg)) return '—';
	const full = Math.max(0, Math.min(5, Math.round(avg)));
	return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function plazaAverageText(avg: number | null | undefined): string {
	if (avg == null || !Number.isFinite(avg)) return '—';
	return avg.toFixed(2);
}

function plazaRowState(s: { id: string; userId: string }) {
	if ($i && s.userId === $i.id) return 'mine';
	const u = usableById.value.get(s.id);
	if (u?.subscribed) return 'subscribed';
	return 'other';
}

async function loadCharacters(reset = true) {
	if (reset) {
		charactersOffset.value = 0;
		canLoadMoreCharacters.value = true;
		list.value = [];
	}
	if (!canLoadMoreCharacters.value) return;
	loadingCh.value = true;
	try {
		const base = { limit: 30, sort: sortCharacters.value } as const;
		const res = await misskeyApi('agents/characters/public-list', sortCharacters.value === 'recommended'
			? ({
				...base,
				excludeIds: list.value.map(x => x.id),
			} as any)
			: ({
				...base,
				offset: charactersOffset.value,
			} as any));
		const next = res as AgentsCharactersPublicListResponse;
		if (reset) list.value = next;
		else list.value = [...list.value, ...next];
		if (sortCharacters.value !== 'recommended') charactersOffset.value += next.length;
		canLoadMoreCharacters.value = next.length === 30;
	} catch (err) {
		if (sortCharacters.value !== 'latest') {
			try {
				const fallback = await misskeyApi('agents/characters/public-list', {
					limit: 30,
					offset: charactersOffset.value,
					sort: 'latest',
				});
				const next = fallback as AgentsCharactersPublicListResponse;
				if (reset) list.value = next;
				else list.value = [...list.value, ...next];
				charactersOffset.value += next.length;
				canLoadMoreCharacters.value = next.length === 30;
				os.toast('推荐排序加载失败，已自动切换为最新排序结果。');
				return;
			} catch {
				// fallthrough
			}
		}
		if (reset) list.value = [];
		canLoadMoreCharacters.value = false;
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		loadingCh.value = false;
	}
}

async function loadPlaza(reset = true) {
	if (reset) {
		stylesOffset.value = 0;
		canLoadMoreStyles.value = true;
		plazaStyles.value = [];
	}
	if (!canLoadMoreStyles.value) return;
	loadingPlaza.value = true;
	try {
		const [pub, usable] = await Promise.all([
			misskeyApi('agents/styles/public-list', sortStyles.value === 'recommended'
				? ({
					limit: 30,
					sort: sortStyles.value,
					excludeIds: plazaStyles.value.map(x => x.id),
				} as any)
				: ({
					limit: 30,
					sort: sortStyles.value,
					offset: stylesOffset.value,
				} as any)),
			misskeyApi('agents/styles/list-usable', {}),
		]);
		const next = pub as AgentsStylesPublicListResponse;
		if (reset) plazaStyles.value = next;
		else plazaStyles.value = [...plazaStyles.value, ...next];
		if (sortStyles.value !== 'recommended') stylesOffset.value += next.length;
		canLoadMoreStyles.value = next.length === 30;
		const m = new Map<string, { isMine: boolean; subscribed: boolean }>();
		for (const u of usable as { id: string; isMine: boolean; subscribed: boolean }[]) {
			m.set(u.id, { isMine: u.isMine, subscribed: u.subscribed });
		}
		usableById.value = m;
	} catch (err) {
		if (sortStyles.value !== 'latest') {
			try {
				const [pub2, usable2] = await Promise.all([
					misskeyApi('agents/styles/public-list', {
						limit: 30,
						offset: stylesOffset.value,
						sort: 'latest',
					}),
					misskeyApi('agents/styles/list-usable', {}),
				]);
				const next = pub2 as AgentsStylesPublicListResponse;
				if (reset) plazaStyles.value = next;
				else plazaStyles.value = [...plazaStyles.value, ...next];
				stylesOffset.value += next.length;
				canLoadMoreStyles.value = next.length === 30;
				const m = new Map<string, { isMine: boolean; subscribed: boolean }>();
				for (const u of usable2 as { id: string; isMine: boolean; subscribed: boolean }[]) {
					m.set(u.id, { isMine: u.isMine, subscribed: u.subscribed });
				}
				usableById.value = m;
				os.toast('推荐排序加载失败，已自动切换为最新排序结果。');
				return;
			} catch {
				// fallthrough
			}
		}
		if (reset) plazaStyles.value = [];
		usableById.value = new Map();
		canLoadMoreStyles.value = false;
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		loadingPlaza.value = false;
	}
}

async function maybeLoadMoreByScroll() {
	if (sub.value === 'characters') {
		if (loadingCh.value || loadingMoreCharacters.value || !canLoadMoreCharacters.value) return;
		loadingMoreCharacters.value = true;
		try {
			await loadCharacters(false);
		} finally {
			loadingMoreCharacters.value = false;
		}
		return;
	}
	if (loadingPlaza.value || loadingMoreStyles.value || !canLoadMoreStyles.value) return;
	loadingMoreStyles.value = true;
	try {
		await loadPlaza(false);
	} finally {
		loadingMoreStyles.value = false;
	}
}

function onWindowScroll() {
	if (scrollTicking) return;
	scrollTicking = true;
	window.requestAnimationFrame(() => {
		scrollTicking = false;
		const remain = window.document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
		if (remain <= SCROLL_NEAR_BOTTOM_PX) {
			void maybeLoadMoreByScroll();
		}
	});
}

onMounted(() => {
	loadCharacters(true);
	loadPlaza(true);
	window.addEventListener('scroll', onWindowScroll, { passive: true });
});

onBeforeUnmount(() => {
	window.removeEventListener('scroll', onWindowScroll);
});

watch(sub, (t) => {
	if (t === 'stylesPlaza') loadPlaza(true);
});

watch(sortCharacters, () => {
	if (sub.value !== 'characters') return;
	void loadCharacters(true);
});

watch(sortStyles, () => {
	if (sub.value !== 'stylesPlaza') return;
	void loadPlaza(true);
});

async function subscribe(styleId: string) {
	try {
		await misskeyApi('agents/styles/subscribe', { styleId });
		await loadPlaza();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}

async function unsubscribe(styleId: string) {
	try {
		await misskeyApi('agents/styles/unsubscribe', { styleId });
		await loadPlaza();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}

function goCharacterDetail(characterId: string) {
	router.push(('/agents/square/character/' + characterId) as '/agents/square/character/:characterId');
}

function goStyleDetail(styleId: string) {
	router.push(('/agents/square/style/' + styleId) as '/agents/square/style/:styleId');
}

async function startPlay(a: { id: string }) {
	try {
		const session = await misskeyApi('agents/sessions/create', {
			characterId: a.id,
			sessionKind: 'community',
		});
		router.push(('/chat/agent/' + session.id) as '/chat/agent/:sessionId');
	} catch (e) {
		if (e && typeof e === 'object' && (e as { code?: string }).code === 'AGENT_NEED_PUBLISHED_STYLE') {
			os.alert({ type: 'info', text: i18n.ts._agents.needPublishedStyleExplore });
			router.push('/agents' as const);
			return;
		}
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}
</script>

<style lang="scss" module>
.sortBar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	flex-wrap: wrap;
}

.sortInfo {
	font-size: 0.92em;
	font-weight: 700;
	opacity: 0.72;
}

.sortControls {
	display: inline-flex;
	align-items: center;
	gap: 8px;
}

.sortSwitch {
	display: inline-flex;
	gap: 6px;
	padding: 4px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--MI_THEME-panel) 92%, transparent);
	border: solid 1px var(--MI_THEME-divider);
	flex-wrap: wrap;
	justify-content: flex-end;
}

.sortBtn {
	border: 0;
	background: transparent;
	color: var(--MI_THEME-fgTransparentWeak);
	height: 30px;
	padding: 0 12px;
	border-radius: 999px;
	font-size: 0.88em;
	font-weight: 600;
	cursor: pointer;
	transition: 0.15s;
}

.sortBtnActive {
	background: color-mix(in srgb, var(--MI_THEME-accent) 20%, transparent);
	color: var(--MI_THEME-accent);
}

.grid {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.card {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 16px;
	border-radius: var(--MI-radius);
}

.cardMain {
	display: flex;
	gap: 14px;
	align-items: flex-start;
	min-width: 0;
}

.charAvatarWrap {
	flex-shrink: 0;
	width: 64px;
	height: 64px;
	border-radius: 999px;
	overflow: hidden;
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
}

.charThumb {
	width: 100%;
	height: 100%;
	border-radius: 999px;

	:global(.root) {
		width: 100%;
		height: 100%;
		border-radius: 999px;
	}
}

.charAvatarFallback {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 1.75rem;
	color: var(--MI_THEME-fgTransparentWeak);
}

.styleIconWrap {
	flex-shrink: 0;
	width: 64px;
	height: 64px;
	border-radius: 16px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 1.85rem;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	border: solid 1px var(--MI_THEME-divider);
}

.cardBody {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.cardTitleRow {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	justify-content: space-between;
}

.cardTitle {
	font-weight: 700;
	font-size: 1.05em;
	line-height: 1.35;
	flex: 1;
	min-width: 0;
}

.badgeRow {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-left: auto;
	justify-content: flex-end;
	align-items: center;
}

.metaBadge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	height: 26px;
	padding: 0 11px;
	border-radius: 999px;
	font-size: 0.82em;
	font-weight: 700;
	line-height: 1;
	white-space: nowrap;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 88%, transparent);
	background: color-mix(in srgb, var(--MI_THEME-panel) 86%, transparent);
	color: var(--MI_THEME-fg);
}

.cardSummary {
	margin: 0;
	font-size: 0.92em;
	line-height: 1.5;
	color: var(--MI_THEME-fg);
	opacity: 0.88;
	display: block;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.cardMeta {
	display: flex;
	flex-direction: column;
	gap: 6px;
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

.metaUserName {
	min-width: 0;
	font-weight: 600;
}

.cardTimes {
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

.plazaRow {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 6px 8px;
	font-size: 0.84em;
	line-height: 1.45;
	padding-top: 2px;
}

.plazaLabel {
	font-weight: 700;
	opacity: 0.65;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	flex-shrink: 0;
}

.plazaVal {
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	opacity: 0.92;
}

.plazaMuted {
	font-weight: 600;
	opacity: 0.55;
}

.plazaStars {
	color: var(--MI_THEME-warn);
	letter-spacing: 0.04em;
	font-weight: 700;
}

.plazaSep {
	opacity: 0.45;
	font-weight: 600;
	flex-shrink: 0;
}

.cardActions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	padding-top: 4px;
	border-top: solid 1px var(--MI_THEME-divider);
}

@media (min-width: 520px) {
	.card {
		flex-direction: row;
		align-items: stretch;
		justify-content: space-between;
	}

	.cardActions {
		border-top: none;
		padding-top: 0;
		border-left: solid 1px var(--MI_THEME-divider);
		padding-left: 16px;
		margin-left: 4px;
		flex-direction: column;
		justify-content: center;
		align-items: stretch;
		min-width: 160px;
	}
}
</style>
