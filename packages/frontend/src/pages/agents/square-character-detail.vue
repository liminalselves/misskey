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
				<div :class="$style.avatarWrap">
					<MkDriveFileThumbnail
						v-if="avatarFile"
						:file="avatarFile"
						fit="cover"
						:class="$style.avatarThumb"
					/>
					<div v-else :class="$style.avatarFallback"><i class="ti ti-user"></i></div>
				</div>
				<div :class="$style.heroBody">
					<h1 :class="$style.title">{{ character.name }}</h1>
					<p v-if="character.summary" :class="$style.summary">{{ character.summary }}</p>
					<div v-if="character.publishedVersion != null" :class="$style.badgeRow">
						<span class="_acrylicBadge">V{{ character.publishedVersion }}</span>
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
							<MkTime :time="character.createdAt" mode="relative"/>
						</span>
						<span :class="$style.timeChip">
							<i class="ti ti-history"></i>
							{{ i18n.ts._agents.cardUpdated }}
							<MkTime :time="character.updatedAt" mode="relative"/>
						</span>
					</div>
					<div :class="$style.plazaMetrics">
						<div :class="$style.plazaMetric">
							<span :class="$style.plazaMetricLabel"><i class="ti ti-star"></i> {{ i18n.ts._agents.plazaMetricRating }}</span>
							<div :class="$style.plazaMetricBody">
								<template v-if="character.rating.count === 0">
									<span :class="$style.plazaMetricMuted">{{ i18n.ts._agents.plazaRatingNone }}</span>
								</template>
								<template v-else>
									<span :class="$style.plazaMetricStars" aria-hidden="true">{{ ratingStarString }}</span>
									<span :class="$style.plazaMetricValue">{{ ratingAverageText }} · {{ character.rating.count }} {{ i18n.ts._agents.plazaRatingCountSuffix }}</span>
								</template>
							</div>
						</div>
						<div :class="$style.plazaMetric">
							<span :class="$style.plazaMetricLabel"><i class="ti ti-message-cog"></i> {{ i18n.ts._agents.plazaMetricAiReplies }}</span>
							<span :class="$style.plazaMetricValue">{{ character.aiReplyCount }}</span>
						</div>
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
				<MkButton rounded @click="goPlaza"><i class="ti ti-layout-grid"></i> {{ i18n.ts._agents.navSquare }}</MkButton>
				<MkButton v-if="isMine" rounded @click="goEdit"><i class="ti ti-pencil"></i> {{ i18n.ts._agents.edit }}</MkButton>
				<MkButton primary rounded @click="startPlay"><i class="ti ti-message"></i> {{ i18n.ts._agents.play }}</MkButton>
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

.avatarWrap {
	flex-shrink: 0;
	width: 88px;
	height: 88px;
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
	font-size: 2rem;
	color: var(--MI_THEME-fgTransparentWeak);
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
