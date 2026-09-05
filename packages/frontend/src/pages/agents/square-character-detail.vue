<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader showBack narrowMergedRow>
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<MkLoading v-if="loading"/>
		<MkInfo v-else-if="character == null">{{ i18n.ts.somethingHappened }}</MkInfo>
		<div v-else class="_gaps_m">
			<div v-panel :class="$style.hero">
				<div :class="$style.heroTop">
					<div :class="$style.avatarWrap">
						<MkDriveFileThumbnail
							v-if="avatarFile"
							:file="avatarFile"
							fit="cover"
							:class="$style.avatarThumb"
						/>
						<div v-else :class="$style.avatarFallback"><i class="ti ti-user"></i></div>
					</div>
					<div :class="$style.heroHead">
						<div :class="$style.titleRow">
							<h1 :class="$style.title">{{ character.name }}</h1>
							<span v-if="character.publishedVersion != null" class="_acrylicBadge">V{{ character.publishedVersion }}</span>
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
								<MkTime :time="character.createdAt" mode="relative"/>
							</span>
							<span :class="$style.timeChip">
								<i class="ti ti-history"></i>
								{{ i18n.ts._agents.cardUpdated }}
								<MkTime :time="character.updatedAt" mode="relative"/>
							</span>
						</div>
					</div>
				</div>

				<p v-if="character.summary" :class="$style.summary">{{ character.summary }}</p>

				<div :class="$style.metricsGrid">
					<div :class="$style.metricCard">
						<span :class="$style.metricLabel"><i class="ti ti-star"></i> {{ i18n.ts._agents.plazaMetricRating }}</span>
						<div :class="$style.metricBody">
							<template v-if="character.rating.count === 0">
								<span :class="$style.metricMuted">{{ i18n.ts._agents.plazaRatingNone }}</span>
							</template>
							<template v-else>
								<span :class="$style.metricStars" aria-hidden="true">{{ ratingStarString }}</span>
								<span :class="$style.metricSub">{{ ratingAverageText }} · {{ character.rating.count }} {{ i18n.ts._agents.plazaRatingCountSuffix }}</span>
							</template>
						</div>
					</div>
					<div :class="$style.metricCard">
						<span :class="$style.metricLabel"><i class="ti ti-message-cog"></i> {{ i18n.ts._agents.plazaMetricAiReplies }}</span>
						<span :class="$style.metricValue">{{ character.aiReplyCount }}</span>
					</div>
				</div>
			</div>

			<MkFolder :defaultOpen="true" :class="$style.folderCard">
				<template #icon><i class="ti ti-ruler"></i></template>
				<template #label>{{ i18n.ts._agents.plazaPromptStatsTitle }}</template>
				<dl :class="$style.statGrid">
					<dt>{{ i18n.ts._agents.fieldPersonality }}</dt>
					<dd>{{ character.promptStats.personalityChars }}</dd>
					<dt>{{ i18n.ts._agents.fieldBackground }}</dt>
					<dd>{{ character.promptStats.backgroundChars }}</dd>
					<dt>{{ i18n.ts._agents.fieldSpeakingStyle }}</dt>
					<dd>{{ character.promptStats.speakingStyleChars }}</dd>
					<dt>{{ i18n.ts._agents.fieldGreeting }}</dt>
					<dd>{{ character.promptStats.greetingChars }}</dd>
					<dt>{{ i18n.ts._agents.fieldExampleDialogue }}</dt>
					<dd>{{ character.promptStats.exampleTurnCount }} {{ i18n.ts._agents.plazaStatExampleTurns }} · {{ character.promptStats.exampleDialogueChars }} {{ i18n.ts._agents.plazaStatChars }}</dd>
					<dt>{{ i18n.ts._agents.fieldForbidden }}</dt>
					<dd>{{ character.promptStats.forbiddenChars }}</dd>
					<dt>{{ i18n.ts._agents.plazaStatTotal }}</dt>
					<dd>{{ character.promptStats.totalChars }}</dd>
				</dl>
			</MkFolder>

			<MkFolder v-if="character.promptOpenSourced && character.openSourcePrompt" :defaultOpen="false" :class="$style.folderCard">
				<template #icon><i class="ti ti-license"></i></template>
				<template #label>{{ i18n.ts._agents.openSourcePromptDetail }}</template>
				<div class="_gaps">
					<MkInfo>{{ i18n.ts._agents.openSourcePromptNotice }}</MkInfo>
					<section v-if="character.openSourcePrompt.personality.trim() !== ''" :class="$style.promptSection">
						<h3 :class="$style.promptHeading">{{ i18n.ts._agents.fieldPersonality }}</h3>
						<p :class="$style.promptBody">{{ character.openSourcePrompt.personality }}</p>
					</section>
					<section v-if="character.openSourcePrompt.background.trim() !== ''" :class="$style.promptSection">
						<h3 :class="$style.promptHeading">{{ i18n.ts._agents.fieldBackground }}</h3>
						<p :class="$style.promptBody">{{ character.openSourcePrompt.background }}</p>
					</section>
					<section v-if="character.openSourcePrompt.speakingStyle.trim() !== ''" :class="$style.promptSection">
						<h3 :class="$style.promptHeading">{{ i18n.ts._agents.fieldSpeakingStyle }}</h3>
						<p :class="$style.promptBody">{{ character.openSourcePrompt.speakingStyle }}</p>
					</section>
					<section v-if="character.openSourcePrompt.greeting.trim() !== ''" :class="$style.promptSection">
						<h3 :class="$style.promptHeading">{{ i18n.ts._agents.fieldGreeting }}</h3>
						<p :class="$style.promptBody">{{ character.openSourcePrompt.greeting }}</p>
					</section>
					<section v-if="character.openSourcePrompt.exampleTurns.length > 0" :class="$style.promptSection">
						<h3 :class="$style.promptHeading">{{ i18n.ts._agents.fieldExampleDialogue }}</h3>
						<div v-for="(t, i) in character.openSourcePrompt.exampleTurns" :key="i" :class="$style.exampleTurn">
							<span :class="[$style.exampleTurnRole, t.role === 'user' ? $style.roleUser : $style.roleAssistant]">
								{{ t.role === 'user' ? i18n.ts._agents.exampleTurnRoleUser : i18n.ts._agents.exampleTurnRoleAssistant }}
							</span>
							<p :class="$style.promptBody">{{ t.content }}</p>
						</div>
					</section>
					<section v-if="character.openSourcePrompt.forbiddenBehavior.trim() !== ''" :class="$style.promptSection">
						<h3 :class="$style.promptHeading">{{ i18n.ts._agents.fieldForbidden }}</h3>
						<p :class="$style.promptBody">{{ character.openSourcePrompt.forbiddenBehavior }}</p>
					</section>
					<section v-if="character.openSourcePrompt.worldbook.length > 0" :class="$style.promptSection">
						<h3 :class="$style.promptHeading">世界书</h3>
						<div class="_gaps_s">
							<div v-for="entry in character.openSourcePrompt.worldbook" :key="entry.id" :class="$style.worldbookEntry">
								<div :class="$style.worldbookEntryHeader">
									<strong>{{ entry.title }}</strong>
									<span v-if="!entry.enabled" class="_acrylicBadge">已停用</span>
								</div>
								<p :class="$style.promptBody">{{ entry.content }}</p>
								<div :class="$style.worldbookMeta">
									<span>触发方式：{{ worldbookTriggerLabel(entry.triggerMode) }}</span>
									<span>优先级：{{ entry.priority }}</span>
									<span v-if="entry.keywords.length > 0">关键词：{{ entry.keywords.join('、') }}</span>
								</div>
							</div>
						</div>
					</section>
				</div>
			</MkFolder>

			<div v-panel :class="$style.reviewsCard">
				<XSquarePlazaReviews
					:characterId="character.id"
					:rating="character.rating"
					:showRatingSummary="false"
					@updated="load"
				/>
			</div>

			<div v-panel :class="$style.footerActions">
				<MkButton rounded :class="$style.footerBtn" @click="goPlaza"><i class="ti ti-layout-grid"></i> {{ i18n.ts._agents.navSquare }}</MkButton>
				<MkButton v-if="isMine" rounded :class="$style.footerBtn" @click="goEdit"><i class="ti ti-pencil"></i> {{ i18n.ts._agents.edit }}</MkButton>
				<MkButton primary rounded :class="$style.footerBtn" @click="startPlay"><i class="ti ti-message"></i> {{ i18n.ts._agents.play }}</MkButton>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import XSquarePlazaReviews from './square-plaza-reviews.vue';
import type * as Misskey from 'misskey-js';
import type { DriveFile, UserDetailed } from 'misskey-js/entities.js';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import MkTime from '@/components/global/MkTime.vue';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import { userPage } from '@/filters/user.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { confirmStartAgentSession } from '@/utility/confirm-start-agent-session.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';
import { $i } from '@/i.js';

const props = defineProps<{
	characterId: string;
}>();

const router = useRouter();

type CharacterPlazaDetail = {
	id: string;
	userId: string;
	name: string;
	summary: string | null;
	publishedVersion?: number | null;
	avatarFileId: string | null;
	createdAt: string;
	updatedAt: string;
	promptStats: {
		personalityChars: number;
		backgroundChars: number;
		speakingStyleChars: number;
		greetingChars: number;
		exampleTurnCount: number;
		exampleDialogueChars: number;
		forbiddenChars: number;
		totalChars: number;
	};
	rating: { average: number | null; count: number };
	conversationCount: number;
	aiReplyCount: number;
	myReview?: { noteId: string; stars: number };
	promptOpenSourced: boolean;
	openSourcePrompt?: {
		personality: string;
		background: string;
		speakingStyle: string;
		greeting: string;
		forbiddenBehavior: string;
		exampleTurns: { role: 'user' | 'assistant'; content: string }[];
		worldbook: {
			id: string;
			title: string;
			content: string;
			keywords: string[];
			triggerMode: string;
			priority: number;
			enabled: boolean;
			revision: number;
		}[];
	};
};

const loading = ref(true);
const character = ref<CharacterPlazaDetail | null>(null);
const creator = ref<UserDetailed | null>(null);
const avatarFile = ref<DriveFile | null>(null);

const isMine = computed(() => $i != null && character.value != null && character.value.userId === $i.id);

function starStringFromAverage(n: number | null) {
	if (n == null || !Number.isFinite(n)) return '—';
	const full = Math.round(n);
	return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
}

const ratingStarString = computed(() => {
	const c = character.value;
	if (c == null) return '—';
	return starStringFromAverage(c.rating.average);
});

const ratingAverageText = computed(() => {
	const c = character.value;
	if (c == null) return '—';
	const a = c.rating.average;
	if (a == null || !Number.isFinite(a)) return '—';
	return a.toFixed(2);
});

function worldbookTriggerLabel(triggerMode: string): string {
	if (triggerMode === 'always') return '常驻';
	if (triggerMode === 'manual') return '手动';
	return '关键词';
}

definePage(computed(() => ({
	title: character.value?.name ?? i18n.ts._agents.publicAgents,
	icon: 'ti ti-user',
})));

async function load() {
	loading.value = true;
	character.value = null;
	creator.value = null;
	avatarFile.value = null;
	try {
		const row = await misskeyApi(
			'agents/characters/plaza-detail' as keyof Misskey.Endpoints,
			{ characterId: props.characterId } as Misskey.Endpoints[keyof Misskey.Endpoints]['req'],
		) as CharacterPlazaDetail;
		character.value = row;
		const [u, file] = await Promise.all([
			misskeyApi('users/show', { userId: row.userId }) as Promise<UserDetailed>,
			row.avatarFileId
				? misskeyApi('drive/files/show', { fileId: row.avatarFileId }) as Promise<DriveFile>
				: Promise.resolve(null),
		]);
		creator.value = u;
		avatarFile.value = file;
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
	router.push(('/agents/character/' + props.characterId) as '/agents/character/:characterId');
}

async function startPlay() {
	if (!await confirmStartAgentSession()) return;

	try {
		const session = await misskeyApi('agents/sessions/create', {
			characterId: props.characterId,
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

onMounted(() => { void load(); });
watch(() => props.characterId, () => { void load(); });
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

.avatarWrap {
	flex-shrink: 0;
	width: 96px;
	height: 96px;
	border-radius: 999px;
	overflow: hidden;
	background: var(--MI_THEME-panel);
	border: solid 2px color-mix(in srgb, var(--MI_THEME-accent) 35%, var(--MI_THEME-divider));
	box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
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
	font-size: 2rem;
	color: var(--MI_THEME-fgTransparentWeak);
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

	dt:last-of-type,
	dd:last-of-type {
		border-top: solid 1px var(--MI_THEME-divider);
		font-weight: 800;
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

	.avatarWrap {
		width: 72px;
		height: 72px;
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

.promptSection {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.promptHeading {
	margin: 0;
	font-size: 0.9em;
	font-weight: 700;
	color: var(--MI_THEME-accent);
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

.worldbookEntry {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 12px;
	border-radius: 10px;
	border: solid 1px var(--MI_THEME-divider);
}

.worldbookEntryHeader,
.worldbookMeta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.worldbookMeta {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.8em;
}

.exampleTurn {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.exampleTurnRole {
	align-self: flex-start;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 0.75em;
	font-weight: 700;
	letter-spacing: 0.04em;
}

.roleUser {
	background: color-mix(in srgb, var(--MI_THEME-accent) 15%, var(--MI_THEME-panel));
	color: var(--MI_THEME-accent);
}

.roleAssistant {
	background: color-mix(in srgb, var(--MI_THEME-success) 18%, var(--MI_THEME-panel));
	color: var(--MI_THEME-success);
}
</style>
