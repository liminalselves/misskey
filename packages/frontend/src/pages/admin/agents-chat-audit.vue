<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 920px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker
			path="/admin/agents-chat-audit"
			:label="i18n.ts._agents.adminAgentChatAudit"
			:keywords="['agents', 'agent', 'chat', 'messages', 'audit', 'moderation', 'user', 'session', 'character', '智能体', '聊天']"
			icon="ti ti-messages"
		>
			<div class="_gaps_m">
				<MkInfo>{{ i18n.ts._agents.adminAgentChatAuditDescription }}</MkInfo>

				<section :class="$style.toolbar">
					<div :class="$style.stats">
						<span :class="$style.stat">{{ i18n.ts._agents.adminAgentChatAuditLoadMore }}: <b>{{ items.length }}</b></span>
						<span :class="$style.stat">{{ i18n.ts._agents.exampleTurnRoleUser }}: <b>{{ userCount }}</b></span>
						<span :class="$style.stat">{{ i18n.ts._agents.exampleTurnRoleAssistant }}: <b>{{ assistantCount }}</b></span>
						<span :class="$style.stat">{{ i18n.ts._agents.adminAgentChatAuditRoleSystem }}: <b>{{ systemCount }}</b></span>
					</div>
					<div class="_buttons">
						<MkButton small rounded :disabled="loading" @click="loadRecentOnly"><i class="ti ti-refresh"></i> {{ i18n.ts._agents.adminAgentChatAuditQuickRecent }}</MkButton>
					</div>
				</section>

				<section :class="$style.filterCard" class="_gaps">
					<div :class="$style.filterHead">
						<h2 :class="$style.filterTitle">{{ i18n.ts._agents.adminAgentChatAuditFilters }}</h2>
						<span :class="hasActiveFilters ? $style.filterState : $style.filterStateMuted">{{ hasActiveFilters ? i18n.ts._agents.adminAgentChatAuditSearch : i18n.ts._agents.adminAgentChatAuditQuickRecent }}</span>
					</div>
					<FormSplit :minWidth="260">
						<MkInput v-model="filters.userId" type="text" autocomplete="off">
							<template #label>{{ i18n.ts._agents.adminAgentChatAuditFilterUserId }}</template>
						</MkInput>
						<MkInput v-model="filters.sessionId" type="text" autocomplete="off">
							<template #label>{{ i18n.ts._agents.adminAgentChatAuditFilterSessionId }}</template>
						</MkInput>
					</FormSplit>
					<FormSplit :minWidth="260">
						<MkInput v-model="filters.characterId" type="text" autocomplete="off">
							<template #label>{{ i18n.ts._agents.adminAgentChatAuditFilterCharacterId }}</template>
						</MkInput>
						<MkSelect v-model="filters.role" :items="roleItems">
							<template #label>{{ i18n.ts._agents.adminAgentChatAuditFilterRole }}</template>
						</MkSelect>
					</FormSplit>
					<MkInput v-model="filters.query" type="text" autocomplete="off">
						<template #label>{{ i18n.ts._agents.adminAgentChatAuditFilterQuery }}</template>
					</MkInput>
					<div class="_buttons">
						<MkButton primary rounded :disabled="loading" @click="runSearch(true)"><i class="ti ti-search"></i> {{ i18n.ts._agents.adminAgentChatAuditSearch }}</MkButton>
						<MkButton rounded :disabled="loading" @click="clearFilters"><i class="ti ti-filter-off"></i> {{ i18n.ts._agents.adminAgentChatAuditClearFilters }}</MkButton>
					</div>
				</section>

				<MkLoading v-if="loading && items.length === 0"/>
				<MkInfo v-else-if="!loading && searched && items.length === 0">{{ noResultsText }}</MkInfo>

				<div v-if="items.length > 0" :class="$style.list" class="_gaps">
					<article v-for="row in items" :key="row.id" :class="$style.card">
						<div :class="$style.cardHead">
							<div :class="$style.cardHeadLeft">
								<span :class="[$style.roleBadge, row.role === 'user' ? $style.roleUser : row.role === 'assistant' ? $style.roleAssistant : $style.roleSystem]">{{ roleLabel(row.role) }}</span>
								<span :class="$style.kindTag">{{ sessionKindLabel(row.sessionKind) }}</span>
							</div>
							<time :class="$style.time" :datetime="row.createdAt"><i class="ti ti-clock"></i> {{ formatTime(row.createdAt) }}</time>
						</div>

						<div :class="$style.indexGrid">
							<div :class="$style.indexCard">
								<span :class="$style.indexKey">{{ i18n.ts._agents.adminAgentChatAuditIndexUser }}</span>
								<template v-if="row.user">
									<MkA :to="`/admin/user/${row.userId}`" class="_link"><MkUserName :user="row.user" class="_noSelect"/></MkA>
									<MkAcct :user="row.user" :class="$style.acct"/>
								</template>
								<code v-else :class="$style.mono">{{ row.userId }}</code>
								<button type="button" class="_button" :class="[$style.miniCopy, $style.indexCopy]" :title="i18n.ts._agents.adminAgentChatAuditCopy" @click="copyId(row.userId)"><i class="ti ti-copy"></i></button>
							</div>
							<div :class="$style.indexCard">
								<span :class="$style.indexKey">{{ i18n.ts._agents.adminAgentChatAuditIndexSession }}</span>
								<span :class="$style.indexVal">{{ row.sessionName }}</span>
								<code :class="$style.mono">{{ row.sessionId }}</code>
								<button type="button" class="_button" :class="[$style.miniCopy, $style.indexCopy]" :title="i18n.ts._agents.adminAgentChatAuditCopy" @click="copyId(row.sessionId)"><i class="ti ti-copy"></i></button>
							</div>
							<div :class="$style.indexCard">
								<span :class="$style.indexKey">{{ i18n.ts._agents.adminAgentChatAuditIndexCharacter }}</span>
								<span :class="$style.indexVal">{{ row.characterName || '—' }}</span>
								<code :class="$style.mono">{{ row.characterId }}</code>
								<button type="button" class="_button" :class="[$style.miniCopy, $style.indexCopy]" :title="i18n.ts._agents.adminAgentChatAuditCopy" @click="copyId(row.characterId)"><i class="ti ti-copy"></i></button>
							</div>
							<div :class="$style.indexCard">
								<span :class="$style.indexKey">{{ i18n.ts._agents.adminAgentChatAuditIndexStyle }}</span>
								<code :class="$style.mono">{{ row.dialogueStyleId }}</code>
								<button type="button" class="_button" :class="[$style.miniCopy, $style.indexCopy]" :title="i18n.ts._agents.adminAgentChatAuditCopy" :disabled="row.dialogueStyleId == null" @click="row.dialogueStyleId != null && copyId(row.dialogueStyleId)"><i class="ti ti-copy"></i></button>
							</div>
						</div>
						<div :class="$style.metaRow">
							<span :class="$style.msgIdWrap">
								<span :class="$style.indexKey">{{ i18n.ts._agents.adminAgentChatAuditIndexMessage }}</span>
								<code :class="$style.mono">{{ row.id }}</code>
								<button type="button" class="_button" :class="$style.miniCopy" :title="i18n.ts._agents.adminAgentChatAuditCopy" @click="copyId(row.id)"><i class="ti ti-copy"></i></button>
							</span>
						</div>

						<div :class="$style.modActions" class="_buttons">
							<span v-if="row.sessionModerationBanned === true" :class="$style.bannedTag">{{ i18n.ts._agents.adminAgentChatAuditSessionBannedBadge }}</span>
							<span v-if="row.characterModerationBanned === true" :class="$style.bannedTag">{{ i18n.ts._agents.adminAgentChatAuditCharacterBannedBadge }}</span>
							<MkButton small rounded :disabled="banBusy" @click="toggleSessionBan(row)">
								{{ row.sessionModerationBanned === true ? i18n.ts._agents.adminAgentChatAuditUnbanSession : i18n.ts._agents.adminAgentChatAuditBanSession }}
							</MkButton>
							<MkButton small rounded :disabled="banBusy" @click="toggleCharacterBan(row)">
								{{ row.characterModerationBanned === true ? i18n.ts._agents.adminAgentChatAuditUnbanCharacter : i18n.ts._agents.adminAgentChatAuditBanCharacter }}
							</MkButton>
						</div>

						<div :class="$style.contentBox">
							<div :class="$style.contentLabel">{{ i18n.ts._agents.adminAgentChatAuditFilterQuery }}</div>
							<pre :class="$style.pre">{{ row.content }}</pre>
						</div>
					</article>

					<div v-if="canLoadMore" class="_buttonsCenter">
						<MkButton rounded :disabled="loading" @click="loadMore"><i class="ti ti-chevron-down"></i> {{ i18n.ts._agents.adminAgentChatAuditLoadMore }}</MkButton>
					</div>
				</div>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';
import type { AdminAgentsMessagesListResponse } from 'misskey-js/entities.js';
import type { MkSelectItem } from '@/components/MkSelect.vue';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkA from '@/components/global/MkA.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import MkAcct from '@/components/global/MkAcct.vue';
import FormSplit from '@/components/form/split.vue';
import SearchMarker from '@/components/global/SearchMarker.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { formatDateTimeString } from '@/utility/format-time-string.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';

type Row = AdminAgentsMessagesListResponse[number] & {
	sessionModerationBanned?: boolean;
	characterModerationBanned?: boolean;
};

const LIMIT = 40;

const loading = ref(false);
const banBusy = ref(false);
const searched = ref(false);
/** 未使用任何筛选条件时的「全站最近消息」视图 */
const items = ref<Row[]>([]);
const untilId = ref<string | null>(null);
const lastBatchSize = ref(0);
const filters = reactive({
	userId: '',
	sessionId: '',
	characterId: '',
	role: null as null | 'user' | 'assistant' | 'system',
	query: '',
});

const roleItems = computed((): MkSelectItem[] => [
	{ value: null, label: i18n.ts._agents.adminAgentChatAuditRoleAll },
	{ value: 'user', label: i18n.ts._agents.exampleTurnRoleUser },
	{ value: 'assistant', label: i18n.ts._agents.exampleTurnRoleAssistant },
	{ value: 'system', label: i18n.ts._agents.adminAgentChatAuditRoleSystem },
]);

const canLoadMore = computed(() => lastBatchSize.value === LIMIT);
const userCount = computed(() => items.value.filter(x => x.role === 'user').length);
const assistantCount = computed(() => items.value.filter(x => x.role === 'assistant').length);
const systemCount = computed(() => items.value.filter(x => x.role === 'system').length);

const hasActiveFilters = computed(() =>
	filters.userId.trim() !== '' ||
	filters.sessionId.trim() !== '' ||
	filters.characterId.trim() !== '' ||
	filters.role != null ||
	filters.query.trim() !== '',
);

const noResultsText = computed(() =>
	hasActiveFilters.value
		? i18n.ts._agents.adminAgentChatAuditNoResults
		: i18n.ts._agents.adminAgentChatAuditNoMessagesYet,
);

definePage({
	title: i18n.ts._agents.adminAgentChatAudit,
	icon: 'ti ti-messages',
});

function buildParams(older: boolean): Record<string, unknown> {
	const p: Record<string, unknown> = { limit: LIMIT };
	const u = filters.userId.trim();
	const s = filters.sessionId.trim();
	const c = filters.characterId.trim();
	const q = filters.query.trim();
	if (u) p['userId'] = u;
	if (s) p['sessionId'] = s;
	if (c) p['characterId'] = c;
	if (filters.role != null) p['role'] = filters.role;
	if (q) p['query'] = q;
	if (older && untilId.value) p['untilId'] = untilId.value;
	return p;
}

function formatTime(iso: string): string {
	return formatDateTimeString(new Date(iso), 'yyyy-MM-dd HH:mm');
}

function roleLabel(role: Row['role']): string {
	if (role === 'user') return i18n.ts._agents.exampleTurnRoleUser;
	if (role === 'assistant') return i18n.ts._agents.exampleTurnRoleAssistant;
	return i18n.ts._agents.adminAgentChatAuditRoleSystem;
}

function sessionKindLabel(kind: Row['sessionKind']): string {
	return kind === 'community'
		? i18n.ts._agents.adminAgentChatAuditSessionKindCommunity
		: i18n.ts._agents.adminAgentChatAuditSessionKindDraft;
}

function copyId(id: string): void {
	copyToClipboard(id);
	os.toast(i18n.ts.copiedToClipboard);
}

function patchRowsSessionBan(sessionId: string, banned: boolean): void {
	patchRowsBan('session', sessionId, banned);
}

function patchRowsCharacterBan(characterId: string, banned: boolean): void {
	patchRowsBan('character', characterId, banned);
}

function patchRowsBan(kind: 'session' | 'character', id: string, banned: boolean): void {
	items.value = items.value.map(it => {
		if (kind === 'session' && it.sessionId === id) {
			return { ...it, sessionModerationBanned: banned };
		}
		if (kind === 'character' && it.characterId === id) {
			return { ...it, characterModerationBanned: banned };
		}
		return it;
	});
}

async function toggleBan(kind: 'session' | 'character', row: Row): Promise<void> {
	const isSession = kind === 'session';
	const current = isSession ? row.sessionModerationBanned === true : row.characterModerationBanned === true;
	const next = !current;
	const { canceled } = await os.confirm({
		type: 'warning',
		text: isSession
			? (next ? i18n.ts._agents.adminAgentChatAuditBanSessionConfirm : i18n.ts._agents.adminAgentChatAuditUnbanSessionConfirm)
			: (next ? i18n.ts._agents.adminAgentChatAuditBanCharacterConfirm : i18n.ts._agents.adminAgentChatAuditUnbanCharacterConfirm),
	});
	if (canceled) return;
	banBusy.value = true;
	try {
		if (isSession) {
			await misskeyApi('admin/agents/sessions/set-moderation-banned', { sessionId: row.sessionId, banned: next });
			patchRowsSessionBan(row.sessionId, next);
		} else {
			await misskeyApi('admin/agents/characters/set-moderation-banned', { characterId: row.characterId, banned: next });
			patchRowsCharacterBan(row.characterId, next);
		}
		os.toast(i18n.ts._agents.adminAgentChatAuditBanUpdated);
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		banBusy.value = false;
	}
}

async function toggleSessionBan(row: Row): Promise<void> {
	await toggleBan('session', row);
}

async function toggleCharacterBan(row: Row): Promise<void> {
	await toggleBan('character', row);
}

async function runSearch(reset: boolean): Promise<void> {
	if (reset) {
		untilId.value = null;
		items.value = [];
	}
	loading.value = true;
	try {
		const list = await misskeyApi('admin/agents/messages/list', buildParams(false)) as AdminAgentsMessagesListResponse;
		items.value = list;
		lastBatchSize.value = list.length;
		const last = list.at(-1);
		untilId.value = last ? last.id : null;
		searched.value = true;
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		loading.value = false;
	}
}

async function loadRecentOnly(): Promise<void> {
	filters.userId = '';
	filters.sessionId = '';
	filters.characterId = '';
	filters.role = null;
	filters.query = '';
	await runSearch(true);
}

async function loadMore(): Promise<void> {
	if (!untilId.value || loading.value) return;
	loading.value = true;
	try {
		const list = await misskeyApi('admin/agents/messages/list', buildParams(true)) as AdminAgentsMessagesListResponse;
		lastBatchSize.value = list.length;
		const next = [...items.value];
		for (const m of list) {
			if (!next.some(x => x.id === m.id)) next.push(m);
		}
		items.value = next;
		const last = list.at(-1);
		if (last) untilId.value = last.id;
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		loading.value = false;
	}
}

function clearFilters(): void {
	void loadRecentOnly();
}

onMounted(() => {
	void loadRecentOnly();
});
</script>

<style lang="scss" module>
.toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	flex-wrap: wrap;
	padding: 10px 12px;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}
.stats {
	display: flex;
	align-items: center;
	gap: 10px 14px;
	flex-wrap: wrap;
}
.stat {
	font-size: 0.84em;
	color: var(--MI_THEME-fgTransparentWeak);
	> b {
		color: var(--MI_THEME-fg);
		font-variant-numeric: tabular-nums;
	}
}
.filterCard {
	padding: 16px 18px;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}
.filterHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}
.filterTitle {
	margin: 0 0 4px;
	font-size: 1em;
	font-weight: 600;
}
.filterState,
.filterStateMuted {
	font-size: 0.8em;
	padding: 2px 8px;
	border-radius: 999px;
}
.filterState {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 13%, transparent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 24%, var(--MI_THEME-divider));
}
.filterStateMuted {
	opacity: 0.7;
	background: var(--MI_THEME-bg);
	border: solid 1px var(--MI_THEME-divider);
}
.list {
	margin-top: 4px;
}
.card {
	padding: 14px 16px;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	background: linear-gradient(160deg, color-mix(in srgb, var(--MI_THEME-panel) 86%, transparent), var(--MI_THEME-bg));
}
.cardHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 10px;
	flex-wrap: wrap;
}
.cardHeadLeft {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}
.roleBadge {
	display: inline-block;
	padding: 2px 10px;
	border-radius: 999px;
	font-size: 0.8em;
	font-weight: 700;
}
.roleUser {
	background: color-mix(in srgb, var(--MI_THEME-accent), transparent 82%);
	color: var(--MI_THEME-accent);
}
.roleAssistant {
	background: color-mix(in srgb, var(--MI_THEME-fg), transparent 88%);
	color: var(--MI_THEME-fg);
}
.roleSystem {
	background: color-mix(in srgb, var(--MI_THEME-warn), transparent 80%);
	color: var(--MI_THEME-warn);
}
.time {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
	font-variant-numeric: tabular-nums;
	display: inline-flex;
	align-items: center;
	gap: 6px;
}
.indexGrid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px 10px;
	margin-bottom: 6px;
	@media (max-width: 700px) {
		grid-template-columns: 1fr;
	}
}
.indexCard {
	position: relative;
	display: flex;
	flex-direction: column;
	flex-wrap: wrap;
	gap: 4px;
	padding: 8px 10px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 12%, transparent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 72%, transparent);
	font-size: 0.83em;
	line-height: 1.28;
}
.indexKey {
	font-weight: 600;
	color: var(--MI_THEME-fgTransparentWeak);
	margin-right: 2px;
	padding-right: 26px;
}
.indexVal {
	font-weight: 500;
}
.mono {
	font-size: 0.82em;
	word-break: break-all;
	padding: 1px 5px;
	border-radius: 4px;
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
}
.acct {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}
.miniCopy {
	padding: 2px 6px;
	border-radius: 4px;
	color: var(--MI_THEME-fgTransparentWeak);
	&:hover {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-panel);
	}
}
.indexCopy {
	position: absolute;
	top: 5px;
	right: 5px;
}
.metaRow {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px 14px;
	margin-bottom: 10px;
	font-size: 0.85em;
}
.kindTag {
	padding: 2px 8px;
	border-radius: 6px;
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
	color: var(--MI_THEME-fgTransparentWeak);
	font-weight: 600;
}
.msgIdWrap {
	display: inline-flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 6px;
}
.modActions {
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-bottom: 10px;
}
.contentBox {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.contentLabel {
	font-size: 0.8em;
	font-weight: 700;
	opacity: 0.68;
}
.bannedTag {
	display: inline-block;
	padding: 2px 8px;
	border-radius: 6px;
	font-size: 0.8em;
	font-weight: 700;
	background: color-mix(in srgb, var(--MI_THEME-error), transparent 82%);
	color: var(--MI_THEME-error);
}
.pre {
	margin: 0;
	padding: 12px 14px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
	white-space: pre-wrap;
	word-break: break-word;
	font-size: 0.95em;
	line-height: 1.45;
	max-height: min(50vh, 420px);
	overflow: auto;
}
</style>
