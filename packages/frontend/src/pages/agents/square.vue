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
								<span v-if="a.publishedVersion != null" class="_acrylicBadge">V{{ a.publishedVersion }}</span>
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
							<span :class="$style.plazaLabel"><i class="ti ti-star"/> {{ i18n.ts._agents.plazaMetricRating }}</span>
							<template v-if="a.rating.count === 0">
								<span :class="$style.plazaMuted">{{ i18n.ts._agents.plazaRatingNone }}</span>
							</template>
							<template v-else>
								<span :class="$style.plazaStars" aria-hidden="true">{{ plazaStarVisual(a.rating.average) }}</span>
								<span :class="$style.plazaVal">{{ plazaAverageText(a.rating.average) }} · {{ a.rating.count }} {{ i18n.ts._agents.plazaRatingCountSuffix }}</span>
							</template>
							<span :class="$style.plazaSep">·</span>
							<span :class="$style.plazaLabel"><i class="ti ti-messages"/> {{ i18n.ts._agents.plazaMetricConversations }}</span>
							<span :class="$style.plazaVal">{{ a.conversationCount }}</span>
							<span :class="$style.plazaSep">·</span>
							<span :class="$style.plazaLabel"><i class="ti ti-robot"/> {{ i18n.ts._agents.plazaMetricAiReplies }}</span>
							<span :class="$style.plazaVal">{{ a.aiReplyCount }}</span>
						</div>
					</div>
				</div>
				<div :class="$style.cardActions">
					<MkButton rounded @click="goCharacterDetail(a.id)"><i class="ti ti-eye"></i> {{ i18n.ts._agents.plazaViewDetails }}</MkButton>
					<MkButton primary rounded @click="startPlay(a)"><i class="ti ti-message"></i> {{ i18n.ts._agents.play }}</MkButton>
				</div>
			</div>
		</div>
	</template>

	<template v-else>
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
								<span v-if="s.publishedVersion != null" class="_acrylicBadge">V{{ s.publishedVersion }}</span>
								<span v-if="plazaRowState(s) === 'mine'" class="_acrylicBadge">{{ i18n.ts._agents.stylePlazaMine }}</span>
								<span v-else-if="plazaRowState(s) === 'subscribed'" class="_acrylicBadge">{{ i18n.ts._agents.subscribedBadge }}</span>
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
							<span :class="$style.plazaLabel"><i class="ti ti-star"/> {{ i18n.ts._agents.plazaMetricRating }}</span>
							<template v-if="s.rating.count === 0">
								<span :class="$style.plazaMuted">{{ i18n.ts._agents.plazaRatingNone }}</span>
							</template>
							<template v-else>
								<span :class="$style.plazaStars" aria-hidden="true">{{ plazaStarVisual(s.rating.average) }}</span>
								<span :class="$style.plazaVal">{{ plazaAverageText(s.rating.average) }} · {{ s.rating.count }} {{ i18n.ts._agents.plazaRatingCountSuffix }}</span>
							</template>
							<span :class="$style.plazaSep">·</span>
							<span :class="$style.plazaLabel"><i class="ti ti-messages"/> {{ i18n.ts._agents.plazaMetricConversations }}</span>
							<span :class="$style.plazaVal">{{ s.conversationCount }}</span>
							<span :class="$style.plazaSep">·</span>
							<span :class="$style.plazaLabel"><i class="ti ti-robot"/> {{ i18n.ts._agents.plazaMetricAiReplies }}</span>
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
		</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
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

const list = ref<AgentsCharactersPublicListResponse>([]);
const loadingCh = ref(true);
const plazaStyles = ref<AgentsStylesPublicListResponse>([]);
const usableById = ref<Map<string, { isMine: boolean; subscribed: boolean }>>(new Map());
const loadingPlaza = ref(true);

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

async function loadCharacters() {
	loadingCh.value = true;
	try {
		list.value = await misskeyApi('agents/characters/public-list', { limit: 50 });
	} catch {
		list.value = [];
	} finally {
		loadingCh.value = false;
	}
}

async function loadPlaza() {
	loadingPlaza.value = true;
	try {
		const [pub, usable] = await Promise.all([
			misskeyApi('agents/styles/public-list', { limit: 50 }),
			misskeyApi('agents/styles/list-usable', {}),
		]);
		plazaStyles.value = pub;
		const m = new Map<string, { isMine: boolean; subscribed: boolean }>();
		for (const u of usable as { id: string; isMine: boolean; subscribed: boolean }[]) {
			m.set(u.id, { isMine: u.isMine, subscribed: u.subscribed });
		}
		usableById.value = m;
	} catch {
		plazaStyles.value = [];
		usableById.value = new Map();
	} finally {
		loadingPlaza.value = false;
	}
}

onMounted(() => {
	loadCharacters();
	loadPlaza();
});

watch(sub, (t) => {
	if (t === 'stylesPlaza') loadPlaza();
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
			router.push('/agents' as '/agents');
			return;
		}
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}
</script>

<style lang="scss" module>
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
}

.badgeRow {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.cardSummary {
	margin: 0;
	font-size: 0.92em;
	line-height: 1.5;
	color: var(--MI_THEME-fg);
	opacity: 0.88;
	display: -webkit-box;
	-webkit-line-clamp: 3;
	-webkit-box-orient: vertical;
	overflow: hidden;
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
