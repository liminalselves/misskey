<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInput
		v-model="searchQuery"
		:placeholder="i18n.ts._chat.searchMessages"
		type="search"
	>
		<template #prefix><i class="ti ti-search"></i></template>
	</MkInput>

	<MkButton v-if="searchQuery.length > 0" primary rounded @click="runSearch">{{ i18n.ts.search }}</MkButton>

	<MkFoldableSection v-if="searched">
		<template #header>{{ i18n.ts.searchResult }}</template>

		<MkLoading v-if="loading"/>
		<div v-else-if="filteredSessions.length > 0" class="_gaps_s">
			<MkA
				v-for="s in filteredSessions"
				:key="'f:' + s.id"
				:class="[$style.message, { [$style.isRead]: !s.hasUnread }]"
				class="_panel"
				:to="`/chat/agent/${s.id}`"
			>
				<XRow :session="s"/>
			</MkA>
		</div>
		<MkResult v-else type="notFound"/>
	</MkFoldableSection>

	<MkFoldableSection>
		<template #header>{{ i18n.ts._chat.history }}</template>

		<MkLoading v-if="loading"/>
		<MkInfo v-else-if="sessions.length === 0">{{ i18n.ts._agents.noSessionsYet }}</MkInfo>
		<div v-else class="_gaps_s">
			<MkA
				v-for="s in sessions"
				:key="s.id"
				:class="[$style.message, { [$style.isRead]: !s.hasUnread }]"
				class="_panel"
				:to="`/chat/agent/${s.id}`"
			>
				<XRow :session="s"/>
			</MkA>
			<div v-if="hasMoreSessions">
				<MkButton v-appear="prefer.s.enableInfiniteScroll && !loadingMore ? loadMoreSessions : null" small rounded :disabled="loadingMore" @click="loadMoreSessions">
					<i class="ti ti-chevron-down"></i> {{ loadingMore ? i18n.ts.loading : i18n.ts.loadMore }}
				</MkButton>
			</div>
		</div>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { useStream } from '@/stream.js';
import XRow from './home.agents.row.vue';
import type { AgentsSessionsListMineResponse } from 'misskey-js/entities.js';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkA from '@/components/global/MkA.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { appendCursorPage, mergeCursorTopPage, takeCursorFirstPage } from '@/utility/cursor-page.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

type SessionRow = AgentsSessionsListMineResponse[number];

// list-mine 新增可选 limit/untilId 页面游标（(updatedAt,id) 复合游标的裸数组）：
// 首页 limit+1 探测 hasMore，翻页带 untilId，按需加载避免 take-100 截断，也不串行全量拉取
const SESSIONS_PAGE_SIZE = 30;
// 端点新增参数未进 misskey-js 类型，按惯例页面内强转
const fetchSessions = misskeyApi as unknown as (endpoint: 'agents/sessions/list-mine', data: { limit?: number; untilId?: string | null }) => Promise<SessionRow[]>;

const sessions = ref<SessionRow[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const hasMoreSessions = ref(false);
const searchQuery = ref('');
const searched = ref(false);

const filteredSessions = computed(() => {
	const q = searchQuery.value.trim().toLowerCase();
	if (!q) return [];
	return sessions.value.filter((s) => {
		const hay = [
			s.name,
			s.characterName,
			s.characterSummary ?? '',
			s.lastMessagePreview,
			sessionKindLabel(s.sessionKind),
		].join('\n').toLowerCase();
		return hay.includes(q);
	});
});

function sessionKindLabel(kind: string) {
	return kind === 'draft_test' ? i18n.ts._agents.sessionKindDraft : i18n.ts._agents.sessionKindCommunity;
}

function runSearch() {
	searched.value = true;
}

watch(searchQuery, (q) => {
	if (!q.trim()) searched.value = false;
});

async function loadSessions() {
	if (loading.value) return;
	loading.value = true;
	try {
		const rows = await fetchSessions('agents/sessions/list-mine', { limit: SESSIONS_PAGE_SIZE + 1 });
		const page = takeCursorFirstPage(rows, SESSIONS_PAGE_SIZE);
		hasMoreSessions.value = page.hasMore;
		sessions.value = page.items;
	} catch {
		sessions.value = [];
		hasMoreSessions.value = false;
	} finally {
		loading.value = false;
	}
}

async function loadMoreSessions() {
	if (loading.value || loadingMore.value || !hasMoreSessions.value) return;
	const untilId = sessions.value.at(-1)?.id;
	if (untilId == null) return;
	loadingMore.value = true;
	try {
		const rows = await fetchSessions('agents/sessions/list-mine', { limit: SESSIONS_PAGE_SIZE + 1, untilId });
		const page = appendCursorPage(sessions.value, rows, SESSIONS_PAGE_SIZE);
		hasMoreSessions.value = page.hasMore;
		sessions.value = page.items;
	} catch {
		// 翻页失败保留现有列表，用户可手动重试
	} finally {
		loadingMore.value = false;
	}
}

/**
 * 实时事件刷新：只重拉首页并按 id 合并（新会话置顶、已有会话就地更新未读/预览），
 * 不整页重置——已翻开的深页保留，也不为刷新串行重拉全部页。
 */
async function refreshSessionsTop() {
	if (loading.value || loadingMore.value) return;
	try {
		const rows = await fetchSessions('agents/sessions/list-mine', { limit: SESSIONS_PAGE_SIZE + 1 });
		const page = mergeCursorTopPage(sessions.value, rows, SESSIONS_PAGE_SIZE, hasMoreSessions.value);
		hasMoreSessions.value = page.hasMore;
		sessions.value = page.items;
	} catch {
		// 刷新失败保持现有数据
	}
}

onMounted(() => {
	void loadSessions();
});

onActivated(() => {
	void refreshSessionsTop();
});

// 实时响应智能体消息到达/已读事件，刷新各会话未读标记
const agentStreamConnection = useStream().useChannel('main');
agentStreamConnection.on('newAgentMessage', () => void refreshSessionsTop());
agentStreamConnection.on('agentRead', () => void refreshSessionsTop());

onUnmounted(() => {
	agentStreamConnection.dispose();
});
</script>

<style lang="scss" module>
.message {
	position: relative;
	display: flex;
	padding: 16px 24px;
	text-align: start;
	color: inherit;
	text-decoration: none;

	&.isRead {
		opacity: 0.8;
	}

	&:not(.isRead)::before {
		content: '';
		position: absolute;
		top: 8px;
		right: 8px;
		width: 8px;
		height: 8px;
		border-radius: 100%;
		background-color: var(--MI_THEME-accent);
	}
}

@container (max-width: 500px) {
	.message {
		font-size: 90%;
		padding: 14px 20px;
	}
}

@container (max-width: 450px) {
	.message {
		font-size: 80%;
		padding: 12px 16px;
	}
}
</style>
