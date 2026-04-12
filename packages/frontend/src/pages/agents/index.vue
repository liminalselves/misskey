<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="mainTab" :tabs="mainHeaderTabs" :swipable="true">
	<div v-if="mainTab === 'square'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XSquare/>
	</div>
	<div v-else class="_spacer" style="--MI_SPACER-w: 700px;">
		<MkTab
			v-model="createSub"
			:tabs="createTabs"
			style="margin-bottom: var(--MI-margin);"
		/>

		<div v-if="createSub === 'characters'" class="_gaps">
			<MkButton primary rounded @click="newCharacter"><i class="ti ti-plus"></i> {{ i18n.ts._agents.newCharacter }}</MkButton>
			<MkLoading v-if="loadingCh"/>
			<div v-else :class="$style.grid">
				<div v-for="c in characters" :key="c.id" v-panel :class="$style.card">
					<div :class="$style.cardMain">
						<div :class="$style.charAvatarWrap">
							<MkDriveFileThumbnail
								v-if="c.avatar"
								:file="c.avatar"
								fit="cover"
								:class="$style.charThumb"
							/>
							<div v-else :class="$style.charAvatarFallback"><i class="ti ti-user"></i></div>
						</div>
						<div :class="$style.cardBody">
							<div :class="$style.cardTitleRow">
								<span :class="$style.cardTitle">{{ c.name }}</span>
								<div :class="$style.badgeRow">
									<span v-if="c.reviewStatus === 'pending'" class="_acrylicBadge">{{ i18n.ts._agents.pendingReviewBadge }}</span>
									<span v-else-if="c.reviewStatus === 'rejected' && !c.isPublished" class="_acrylicBadge">{{ i18n.ts._agents.rejectedReviewBadge }}</span>
									<span v-else-if="c.isPublished" class="_acrylicBadge">{{ i18n.ts._agents.publishedBadge }}</span>
									<span v-else class="_acrylicBadge">{{ i18n.ts._agents.draftBadge }}</span>
									<span v-if="c.publishedVersion != null" class="_acrylicBadge">V{{ c.publishedVersion }}</span>
								</div>
							</div>
							<p v-if="c.summary" :class="$style.cardSummary">{{ c.summary }}</p>
							<div :class="$style.cardTimes">
								<span :class="$style.timeChip">
									<i class="ti ti-calendar-plus"></i>
									{{ i18n.ts._agents.cardCreated }}
									<MkTime :time="c.createdAt" mode="relative"/>
								</span>
								<span :class="$style.timeChip">
									<i class="ti ti-history"></i>
									{{ i18n.ts._agents.cardUpdated }}
									<MkTime :time="c.updatedAt" mode="relative"/>
								</span>
							</div>
						</div>
					</div>
					<div :class="$style.cardActions">
						<MkButton rounded @click="goEditCharacter(c.id)"><i class="ti ti-pencil"></i> {{ i18n.ts._agents.edit }}</MkButton>
						<MkButton rounded @click="testChar(c.id)">{{ i18n.ts._agents.play }}</MkButton>
						<MkButton v-if="c.reviewStatus !== 'pending'" rounded @click="publishChar(c.id)">{{ c.publishedVersion != null ? i18n.ts._agents.submitUpdateForReview : i18n.ts._agents.submitForReview }}</MkButton>
						<MkButton v-if="c.reviewStatus === 'pending' || c.isPublished" rounded @click="unpublishChar(c.id)">{{ i18n.ts._agents.unpublish }}</MkButton>
					</div>
				</div>
			</div>
		</div>
		<div v-else class="_gaps">
			<MkButton primary rounded @click="newStyle"><i class="ti ti-plus"></i> {{ i18n.ts._agents.newStyle }}</MkButton>
			<MkLoading v-if="loadingSt"/>
			<div v-else :class="$style.grid">
				<div v-for="s in styles" :key="s.id" v-panel :class="$style.card">
					<div :class="$style.cardMain">
						<div :class="$style.styleIconWrap">
							<i class="ti ti-message-cog"></i>
						</div>
						<div :class="$style.cardBody">
							<div :class="$style.cardTitleRow">
								<span :class="$style.cardTitle">{{ s.name }}</span>
								<div :class="$style.badgeRow">
									<template v-if="s.isMine">
										<span v-if="s.reviewStatus === 'pending'" class="_acrylicBadge">{{ i18n.ts._agents.pendingReviewBadge }}</span>
										<span v-else-if="s.reviewStatus === 'rejected' && !s.isPublished" class="_acrylicBadge">{{ i18n.ts._agents.rejectedReviewBadge }}</span>
										<span v-else-if="s.isPublished" class="_acrylicBadge">{{ i18n.ts._agents.publishedBadge }}</span>
										<span v-else class="_acrylicBadge">{{ i18n.ts._agents.draftBadge }}</span>
										<span v-if="s.publishedVersion != null" class="_acrylicBadge">V{{ s.publishedVersion }}</span>
									</template>
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
						</div>
					</div>
					<div :class="$style.cardActions">
						<MkButton v-if="s.isMine" rounded @click="goEditStyle(s.id)"><i class="ti ti-pencil"></i> {{ i18n.ts._agents.edit }}</MkButton>
						<MkButton v-if="s.isMine && s.reviewStatus !== 'pending'" rounded @click="publishStyle(s.id)">{{ s.publishedVersion != null ? i18n.ts._agents.submitUpdateForReview : i18n.ts._agents.submitForReview }}</MkButton>
						<MkButton v-if="s.isMine && (s.reviewStatus === 'pending' || s.isPublished)" rounded @click="unpublishStyle(s.id)">{{ i18n.ts._agents.unpublish }}</MkButton>
					</div>
				</div>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import type { AgentsCharactersListMineResponse, AgentsStylesListMineResponse } from 'misskey-js/entities.js';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkTab from '@/components/MkTab.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import MkTime from '@/components/global/MkTime.vue';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';
import XSquare from './square.vue';

const props = withDefaults(defineProps<{
	view?: string;
	sub?: string;
}>(), {
	view: 'square',
	sub: 'characters',
});

const router = useRouter();

const mainTab = ref<'square' | 'create'>('square');
const createSub = ref<'characters' | 'styles'>('characters');
const characters = ref<AgentsCharactersListMineResponse>([]);
const styles = ref<AgentsStylesListMineResponse>([]);
const loadingCh = ref(true);
const loadingSt = ref(true);

const mainHeaderTabs = computed(() => [
	{ key: 'square', icon: 'ti ti-layout-grid', title: i18n.ts._agents.navSquare },
	{ key: 'create', icon: 'ti ti-pencil-plus', title: i18n.ts._agents.navCreate },
]);

const createTabs = computed(() => [
	{ key: 'characters', label: i18n.ts._agents.charactersTab },
	{ key: 'styles', label: i18n.ts._agents.stylesTab },
]);

definePage(() => ({
	title: i18n.ts._agents.title,
	icon: 'ti ti-robot',
}));

function applyRouteQuery() {
	if (props.view === 'create') mainTab.value = 'create';
	else mainTab.value = 'square';
	if (props.sub === 'styles') createSub.value = 'styles';
	else createSub.value = 'characters';
}

onMounted(() => {
	applyRouteQuery();
	loadCharacters();
	loadStyles();
});

watch(() => props.view, () => {
	applyRouteQuery();
});

watch(() => props.sub, () => {
	applyRouteQuery();
});

watch(mainTab, (t) => {
	void router.replace({
		path: '/agents',
		query: {
			view: t,
			sub: createSub.value,
		},
	} as unknown as Parameters<typeof router.replace>[0]);
	if (t === 'create') {
		if (createSub.value === 'characters') void loadCharacters();
		else void loadStyles();
	}
});

watch(createSub, (s) => {
	if (mainTab.value !== 'create') return;
	void router.replace({
		path: '/agents',
		query: {
			view: 'create',
			sub: s,
		},
	} as unknown as Parameters<typeof router.replace>[0]);
	if (s === 'characters') void loadCharacters();
	else void loadStyles();
});

function goEditCharacter(id: string) {
	router.push(('/agents/character/' + id) as '/agents/character/:characterId');
}

function goEditStyle(id: string) {
	router.push(('/agents/style/' + id) as '/agents/style/:styleId');
}

async function loadCharacters() {
	loadingCh.value = true;
	try {
		characters.value = await misskeyApi('agents/characters/list-mine', {});
	} finally {
		loadingCh.value = false;
	}
}

async function loadStyles() {
	loadingSt.value = true;
	try {
		styles.value = await misskeyApi('agents/styles/list-mine', {});
	} finally {
		loadingSt.value = false;
	}
}

async function newCharacter() {
	const { canceled, result } = await os.form(i18n.ts._agents.newCharacter, {
		name: { type: 'string', label: i18n.ts._agents.fieldName, minLength: 1 },
	});
	if (canceled) return;
	const created = await misskeyApi('agents/characters/create', { name: result.name });
	loadCharacters();
	router.push(('/agents/character/' + created.id) as '/agents/character/:characterId');
}

async function newStyle() {
	const { canceled, result } = await os.form(i18n.ts._agents.newStyle, {
		name: { type: 'string', label: i18n.ts._agents.fieldStyleName, minLength: 1 },
	});
	if (canceled) return;
	const created = await misskeyApi('agents/styles/create', { name: result.name });
	loadStyles();
	router.push(('/agents/style/' + created.id) as '/agents/style/:styleId');
}

async function publishChar(id: string) {
	try {
		await misskeyApi('agents/characters/publish', { characterId: id });
		loadCharacters();
	} catch (e) {
		if (e && typeof e === 'object' && (e as { code?: string }).code === 'AGENT_PUBLISH_NO_CONTENT_CHANGE') {
			os.alert({ type: 'info', text: i18n.ts._agents.publishNoContentChange });
			return;
		}
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}

async function unpublishChar(id: string) {
	await misskeyApi('agents/characters/unpublish', { characterId: id });
	loadCharacters();
}

async function publishStyle(id: string) {
	try {
		await misskeyApi('agents/styles/publish', { styleId: id });
		loadStyles();
	} catch (e) {
		if (e && typeof e === 'object' && (e as { code?: string }).code === 'AGENT_PUBLISH_NO_CONTENT_CHANGE') {
			os.alert({ type: 'info', text: i18n.ts._agents.publishNoContentChange });
			return;
		}
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}

async function unpublishStyle(id: string) {
	await misskeyApi('agents/styles/unpublish', { styleId: id });
	loadStyles();
}

async function testChar(characterId: string) {
	const session = await misskeyApi('agents/sessions/create', {
		characterId,
		sessionKind: 'draft_test',
	});
	router.push(('/chat/agent/' + session.id) as '/chat/agent/:sessionId');
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
		min-width: 148px;
	}
}
</style>
