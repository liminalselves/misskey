<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 1400px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker
			path="/admin/agents-chat-audit"
			:label="i18n.ts._agents.adminChatManage"
			:keywords="['agents', 'agent', 'chat', 'messages', 'audit', 'moderation', 'session', '智能体', '聊天', '管理']"
			icon="ti ti-messages"
		>
			<div class="_gaps_m">
				<MkInfo>{{ i18n.ts._agents.adminChatManageDescription }}</MkInfo>

				<!-- Tab 切换 -->
				<div :class="$style.tabBar">
					<button :class="[$style.tab, activeTab === 'sessions' && $style.tabActive]" @click="activeTab = 'sessions'">
						<i class="ti ti-list"></i> {{ i18n.ts._agents.adminChatManageTabSessions }}
					</button>
					<button :class="[$style.tab, activeTab === 'messages' && $style.tabActive]" @click="activeTab = 'messages'">
						<i class="ti ti-search"></i> {{ i18n.ts._agents.adminChatManageTabMessages }}
					</button>
				</div>

				<!-- ===== 会话管理面板 ===== -->
				<template v-if="activeTab === 'sessions'">
					<div :class="$style.splitViewRoot">
						<div :class="$style.splitView">
							<!-- 左：会话列表 -->
							<div :class="[$style.leftPanel, selectedSession && $style.leftPanelHideMobile]">
								<div :class="$style.panelHeader">
									<h3 :class="$style.panelTitle">{{ i18n.ts._agents.adminChatManageTabSessions }}</h3>
									<MkButton small rounded :disabled="sessionsLoading" @click="loadSessions(true)"><i class="ti ti-refresh"></i></MkButton>
								</div>

								<div :class="$style.sessionFilters" class="_gaps_s">
									<MkInput v-model="sessionFilterUserId" type="text" autocomplete="off" small>
										<template #label>{{ i18n.ts._agents.adminChatManageFilterUser }}</template>
									</MkInput>
									<div class="_buttons">
										<MkButton small rounded primary :disabled="sessionsLoading" @click="loadSessions(true)"><i class="ti ti-search"></i></MkButton>
										<MkButton small rounded :disabled="sessionsLoading" @click="clearSessionFilters"><i class="ti ti-filter-off"></i></MkButton>
									</div>
								</div>

								<MkLoading v-if="sessionsLoading && sessions.length === 0"/>
								<div v-else-if="sessions.length === 0" :class="$style.emptyMsg">{{ i18n.ts._agents.adminChatManageSessionListEmpty }}</div>

								<div v-if="sessions.length > 0" :class="$style.sessionList">
									<button
										v-for="s in sessions" :key="s.id"
										:class="[$style.sessionItem, selectedSession?.id === s.id && $style.sessionItemActive]"
										@click="selectSession(s)"
									>
										<div :class="$style.sessionItemHead">
											<span :class="$style.sessionItemName">{{ s.name }}</span>
											<span :class="$style.sessionItemKind">{{ sessionKindLabel(s.sessionKind) }}</span>
										</div>
										<div :class="$style.sessionItemMeta">
											<template v-if="s.user">
												<MkUserName :user="s.user" :class="$style.sessionItemUser"/>
											</template>
											<span v-else :class="$style.sessionItemUserId">{{ s.userId }}</span>
											<span :class="$style.sessionItemDot">·</span>
											<span :class="$style.sessionItemCharName">{{ s.characterName || '—' }}</span>
										</div>
										<div :class="$style.sessionItemFooter">
											<time :class="$style.sessionItemTime">{{ formatTime(s.lastMessageAt || s.updatedAt) }}</time>
											<span v-if="s.moderationBanned" :class="$style.bannedBadge">{{ i18n.ts._agents.adminChatManageSessionBanned }}</span>
										</div>
									</button>

									<div v-if="sessionsCanLoadMore" :class="$style.loadMoreWrap">
										<MkButton small rounded :disabled="sessionsLoading" @click="loadMoreSessions"><i class="ti ti-chevron-down"></i> {{ i18n.ts._agents.adminChatManageTimelineLoadMore }}</MkButton>
									</div>
								</div>
							</div>

							<!-- 右：对话时间线 -->
							<div :class="[$style.rightPanel, !selectedSession && $style.rightPanelHideMobile]">
								<template v-if="selectedSession">
									<div :class="$style.panelHeader">
										<button :class="$style.backBtn" @click="selectedSession = null"><i class="ti ti-arrow-left"></i> {{ i18n.ts._agents.adminChatManageBackToList }}</button>
										<h3 :class="$style.panelTitle">{{ selectedSession.name }}</h3>
									</div>

									<div :class="$style.sessionDetailBar">
										<div :class="$style.detailItem">
											<span :class="$style.detailKey">{{ i18n.ts._agents.adminChatManageSessionUser }}</span>
											<template v-if="selectedSession.user">
												<MkA :to="`/admin/user/${selectedSession.userId}`" class="_link"><MkUserName :user="selectedSession.user"/></MkA>
											</template>
											<code v-else>{{ selectedSession.userId }}</code>
										</div>
										<div :class="$style.detailItem">
											<span :class="$style.detailKey">{{ i18n.ts._agents.adminChatManageSessionCharacter }}</span>
											<span>{{ selectedSession.characterName || '—' }}</span>
											<code :class="$style.detailMono">{{ selectedSession.characterId }}</code>
										</div>
										<div :class="$style.detailItem">
											<span :class="$style.detailKey">{{ i18n.ts._agents.adminChatManageSessionKind }}</span>
											<span>{{ sessionKindLabel(selectedSession.sessionKind) }}</span>
										</div>
										<div :class="$style.detailItem">
											<span :class="$style.detailKey">ID</span>
											<code :class="$style.detailMono">{{ selectedSession.id }}</code>
											<button type="button" class="_button" :class="$style.miniCopy" @click="copyId(selectedSession.id)"><i class="ti ti-copy"></i></button>
										</div>
									</div>

									<div :class="$style.modActionsBar" class="_buttons">
										<span v-if="selectedSession.moderationBanned" :class="$style.bannedBadge">{{ i18n.ts._agents.adminAgentChatAuditSessionBannedBadge }}</span>
										<MkButton small rounded :disabled="banBusy" @click="toggleSessionBanFromDetail">
											{{ selectedSession.moderationBanned ? i18n.ts._agents.adminAgentChatAuditUnbanSession : i18n.ts._agents.adminAgentChatAuditBanSession }}
										</MkButton>
									</div>

									<MkLoading v-if="timelineLoading && timeline.length === 0"/>
									<div v-else-if="timeline.length === 0" :class="$style.emptyMsg">{{ i18n.ts._agents.adminChatManageTimelineEmpty }}</div>

									<div v-if="timeline.length > 0" :class="$style.timeline">
										<div v-if="timelineCanLoadMore" :class="$style.loadMoreWrap">
											<MkButton small rounded :disabled="timelineLoading" @click="loadMoreTimeline"><i class="ti ti-chevron-up"></i> {{ i18n.ts._agents.adminChatManageTimelineLoadMore }}</MkButton>
										</div>
										<div
											v-for="msg in timelineReversed" :key="msg.id"
											:class="[$style.msgBubble, msg.role === 'user' ? $style.msgUser : msg.role === 'assistant' ? $style.msgAssistant : $style.msgSystem]"
										>
											<div :class="$style.msgHead">
												<span :class="$style.msgRole">{{ roleLabel(msg.role) }}</span>
												<time :class="$style.msgTime">{{ formatTime(msg.createdAt) }}</time>
											</div>
											<pre :class="$style.msgContent">{{ msg.content }}</pre>
											<div :class="$style.renderPreview" v-html="renderAuditContent(msg.content)"></div>
										</div>
									</div>
								</template>
								<div v-else :class="$style.selectHint">
									<i class="ti ti-messages" :class="$style.selectHintIcon"></i>
									<p>{{ i18n.ts._agents.adminChatManageSelectSession }}</p>
								</div>
							</div>
						</div>
					</div>
				</template>

				<!-- ===== 消息检索面板（原有功能保留） ===== -->
				<template v-if="activeTab === 'messages'">
					<section :class="$style.toolbar">
						<div :class="$style.stats">
							<span :class="$style.stat">{{ i18n.ts._agents.adminAgentChatAuditLoadMore }}: <b>{{ msgItems.length }}</b></span>
						</div>
						<div class="_buttons">
							<MkButton small rounded :disabled="msgLoading" @click="msgLoadRecent"><i class="ti ti-refresh"></i> {{ i18n.ts._agents.adminAgentChatAuditQuickRecent }}</MkButton>
						</div>
					</section>

					<section :class="$style.filterCard" class="_gaps">
						<div :class="$style.filterHead">
							<h2 :class="$style.filterTitle">{{ i18n.ts._agents.adminAgentChatAuditFilters }}</h2>
						</div>
						<FormSplit :minWidth="260">
							<MkInput v-model="msgFilters.userId" type="text" autocomplete="off">
								<template #label>{{ i18n.ts._agents.adminAgentChatAuditFilterUserId }}</template>
							</MkInput>
							<MkInput v-model="msgFilters.sessionId" type="text" autocomplete="off">
								<template #label>{{ i18n.ts._agents.adminAgentChatAuditFilterSessionId }}</template>
							</MkInput>
						</FormSplit>
						<FormSplit :minWidth="260">
							<MkInput v-model="msgFilters.characterId" type="text" autocomplete="off">
								<template #label>{{ i18n.ts._agents.adminAgentChatAuditFilterCharacterId }}</template>
							</MkInput>
							<MkSelect v-model="msgFilters.role" :items="roleItems">
								<template #label>{{ i18n.ts._agents.adminAgentChatAuditFilterRole }}</template>
							</MkSelect>
						</FormSplit>
						<MkInput v-model="msgFilters.query" type="text" autocomplete="off">
							<template #label>{{ i18n.ts._agents.adminAgentChatAuditFilterQuery }}</template>
						</MkInput>
						<div class="_buttons">
							<MkButton primary rounded :disabled="msgLoading" @click="msgSearch(true)"><i class="ti ti-search"></i> {{ i18n.ts._agents.adminAgentChatAuditSearch }}</MkButton>
							<MkButton rounded :disabled="msgLoading" @click="msgLoadRecent"><i class="ti ti-filter-off"></i> {{ i18n.ts._agents.adminAgentChatAuditClearFilters }}</MkButton>
						</div>
					</section>

					<MkLoading v-if="msgLoading && msgItems.length === 0"/>
					<MkInfo v-else-if="!msgLoading && msgSearched && msgItems.length === 0">{{ i18n.ts._agents.adminAgentChatAuditNoResults }}</MkInfo>

					<div v-if="msgItems.length > 0" :class="$style.list" class="_gaps">
						<article v-for="row in msgItems" :key="row.id" :class="$style.card">
							<div :class="$style.cardHead">
								<div :class="$style.cardHeadLeft">
									<span :class="[$style.roleBadge, row.role === 'user' ? $style.roleUser : row.role === 'assistant' ? $style.roleAssistant : $style.roleSystem]">{{ roleLabel(row.role) }}</span>
									<span :class="$style.kindTag">{{ sessionKindLabel(row.sessionKind) }}</span>
								</div>
								<time :class="$style.time" :datetime="row.createdAt"><i class="ti ti-clock"></i> {{ formatTime(row.createdAt) }}</time>
							</div>
							<div :class="$style.indexRow">
								<div :class="$style.indexCompactItem">
									<span :class="$style.indexKey">{{ i18n.ts._agents.adminAgentChatAuditIndexUser }}</span>
									<template v-if="row.user">
										<MkA :to="`/admin/user/${row.userId}`" class="_link"><MkUserName :user="row.user" class="_noSelect"/></MkA>
									</template>
									<code v-else :class="$style.mono">{{ row.userId }}</code>
								</div>
								<div :class="$style.indexCompactItem">
									<span :class="$style.indexKey">{{ i18n.ts._agents.adminAgentChatAuditIndexSession }}</span>
									<span :class="$style.indexVal">{{ row.sessionName }}</span>
									<code :class="$style.mono">{{ row.sessionId }}</code>
									<button type="button" class="_button" :class="$style.miniCopy" @click="jumpToSession(row.sessionId)"><i class="ti ti-arrow-right"></i></button>
								</div>
								<div :class="$style.indexCompactItem">
									<span :class="$style.indexKey">{{ i18n.ts._agents.adminAgentChatAuditIndexCharacter }}</span>
									<span :class="$style.indexVal">{{ row.characterName || '—' }}</span>
									<code :class="$style.mono">{{ row.characterId }}</code>
								</div>
							</div>
							<div :class="$style.contentBox">
								<pre :class="$style.pre">{{ row.content }}</pre>
								<div :class="$style.renderPreview" v-html="renderAuditContent(row.content)"></div>
							</div>
						</article>

						<div v-if="msgCanLoadMore" class="_buttonsCenter">
							<MkButton rounded :disabled="msgLoading" @click="msgLoadMore"><i class="ti ti-chevron-down"></i> {{ i18n.ts._agents.adminAgentChatAuditLoadMore }}</MkButton>
						</div>
					</div>
				</template>
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
import FormSplit from '@/components/form/split.vue';
import SearchMarker from '@/components/global/SearchMarker.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { formatDateTimeString } from '@/utility/format-time-string.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { renderAgentChatMarkdown } from '@/utility/agent-chat-markdown.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';

definePage({
	title: i18n.ts._agents.adminChatManage,
	icon: 'ti ti-messages',
});

const activeTab = ref<'sessions' | 'messages'>('sessions');

function renderAuditContent(content: string): string {
	return renderAgentChatMarkdown(content);
}

// ──── 会话列表 ────
type SessionRow = {
	id: string;
	createdAt: string;
	updatedAt: string;
	userId: string;
	name: string;
	characterId: string;
	dialogueStyleId: string | null;
	sessionKind: 'draft_test' | 'community';
	lastMessageAt: string | null;
	agentReplyPending: boolean;
	characterName: string;
	user: any;
	moderationBanned?: boolean;
};

const SESSION_LIMIT = 30;
const sessionsLoading = ref(false);
const sessions = ref<SessionRow[]>([]);
const sessionsUntilId = ref<string | null>(null);
const sessionsLastBatch = ref(0);
const sessionsCanLoadMore = computed(() => sessionsLastBatch.value === SESSION_LIMIT);
const sessionFilterUserId = ref('');

const selectedSession = ref<SessionRow | null>(null);

async function loadSessions(reset: boolean) {
	if (reset) {
		sessionsUntilId.value = null;
		sessions.value = [];
	}
	sessionsLoading.value = true;
	try {
		const params: Record<string, unknown> = { limit: SESSION_LIMIT };
		const uid = sessionFilterUserId.value.trim();
		if (uid) params['userId'] = uid;
		if (sessionsUntilId.value) params['untilId'] = sessionsUntilId.value;
		const list = await misskeyApi('admin/agents/sessions/list', params) as SessionRow[];
		if (reset) {
			sessions.value = list;
		} else {
			const next = [...sessions.value];
			for (const s of list) {
				if (!next.some(x => x.id === s.id)) next.push(s);
			}
			sessions.value = next;
		}
		sessionsLastBatch.value = list.length;
		const last = list.at(-1);
		if (last) sessionsUntilId.value = last.id;
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		sessionsLoading.value = false;
	}
}

async function loadMoreSessions() {
	if (!sessionsUntilId.value || sessionsLoading.value) return;
	await loadSessions(false);
}

function clearSessionFilters() {
	sessionFilterUserId.value = '';
	loadSessions(true);
}

function selectSession(s: SessionRow) {
	selectedSession.value = s;
	loadTimeline(true);
}

// ──── 对话时间线 ────
type TimelineMsg = {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	createdAt: string;
};

const TL_LIMIT = 50;
const timelineLoading = ref(false);
const timeline = ref<TimelineMsg[]>([]);
const timelineUntilId = ref<string | null>(null);
const timelineLastBatch = ref(0);
const timelineCanLoadMore = computed(() => timelineLastBatch.value === TL_LIMIT);
const timelineReversed = computed(() => [...timeline.value].reverse());

async function loadTimeline(reset: boolean) {
	if (!selectedSession.value) return;
	if (reset) {
		timelineUntilId.value = null;
		timeline.value = [];
	}
	timelineLoading.value = true;
	try {
		const list = await misskeyApi('admin/agents/messages/timeline', {
			sessionId: selectedSession.value.id,
			limit: TL_LIMIT,
			...(timelineUntilId.value ? { untilId: timelineUntilId.value } : {}),
		}) as TimelineMsg[];
		if (reset) {
			timeline.value = list;
		} else {
			const next = [...timeline.value];
			for (const m of list) {
				if (!next.some(x => x.id === m.id)) next.push(m);
			}
			timeline.value = next;
		}
		timelineLastBatch.value = list.length;
		const last = list.at(-1);
		if (last) timelineUntilId.value = last.id;
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		timelineLoading.value = false;
	}
}

async function loadMoreTimeline() {
	if (!timelineUntilId.value || timelineLoading.value) return;
	await loadTimeline(false);
}

const banBusy = ref(false);

async function toggleSessionBanFromDetail() {
	if (!selectedSession.value) return;
	const current = selectedSession.value.moderationBanned === true;
	const next = !current;
	const { canceled } = await os.confirm({
		type: 'warning',
		text: next
			? i18n.ts._agents.adminAgentChatAuditBanSessionConfirm
			: i18n.ts._agents.adminAgentChatAuditUnbanSessionConfirm,
	});
	if (canceled) return;
	banBusy.value = true;
	try {
		await misskeyApi('admin/agents/sessions/set-moderation-banned', {
			sessionId: selectedSession.value.id,
			banned: next,
		});
		selectedSession.value = { ...selectedSession.value, moderationBanned: next };
		sessions.value = sessions.value.map(s =>
			s.id === selectedSession.value!.id ? { ...s, moderationBanned: next } : s,
		);
		os.toast(i18n.ts._agents.adminAgentChatAuditBanUpdated);
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		banBusy.value = false;
	}
}

// ──── 消息检索 ────
type MsgRow = AdminAgentsMessagesListResponse[number];
const MSG_LIMIT = 40;
const msgLoading = ref(false);
const msgSearched = ref(false);
const msgItems = ref<MsgRow[]>([]);
const msgUntilId = ref<string | null>(null);
const msgLastBatch = ref(0);
const msgCanLoadMore = computed(() => msgLastBatch.value === MSG_LIMIT);

const msgFilters = reactive({
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

function buildMsgParams(older: boolean): Record<string, unknown> {
	const p: Record<string, unknown> = { limit: MSG_LIMIT };
	const u = msgFilters.userId.trim();
	const s = msgFilters.sessionId.trim();
	const c = msgFilters.characterId.trim();
	const q = msgFilters.query.trim();
	if (u) p['userId'] = u;
	if (s) p['sessionId'] = s;
	if (c) p['characterId'] = c;
	if (msgFilters.role != null) p['role'] = msgFilters.role;
	if (q) p['query'] = q;
	if (older && msgUntilId.value) p['untilId'] = msgUntilId.value;
	return p;
}

async function msgSearch(reset: boolean) {
	if (reset) {
		msgUntilId.value = null;
		msgItems.value = [];
	}
	msgLoading.value = true;
	try {
		const list = await misskeyApi('admin/agents/messages/list', buildMsgParams(false)) as MsgRow[];
		msgItems.value = list;
		msgLastBatch.value = list.length;
		const last = list.at(-1);
		msgUntilId.value = last ? last.id : null;
		msgSearched.value = true;
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		msgLoading.value = false;
	}
}

async function msgLoadMore() {
	if (!msgUntilId.value || msgLoading.value) return;
	msgLoading.value = true;
	try {
		const list = await misskeyApi('admin/agents/messages/list', buildMsgParams(true)) as MsgRow[];
		msgLastBatch.value = list.length;
		const next = [...msgItems.value];
		for (const m of list) {
			if (!next.some(x => x.id === m.id)) next.push(m);
		}
		msgItems.value = next;
		const last = list.at(-1);
		if (last) msgUntilId.value = last.id;
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		msgLoading.value = false;
	}
}

function msgLoadRecent() {
	msgFilters.userId = '';
	msgFilters.sessionId = '';
	msgFilters.characterId = '';
	msgFilters.role = null;
	msgFilters.query = '';
	msgSearch(true);
}

function jumpToSession(sessionId: string) {
	activeTab.value = 'sessions';
	sessionFilterUserId.value = '';
	loadSessionById(sessionId);
}

async function loadSessionById(sessionId: string) {
	sessionsLoading.value = true;
	try {
		const list = await misskeyApi('admin/agents/sessions/list', { sessionId }) as SessionRow[];
		if (list.length > 0) {
			sessions.value = list;
			selectSession(list[0]);
		}
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		sessionsLoading.value = false;
	}
}

// ──── 共用工具函数 ────
function formatTime(iso: string): string {
	return formatDateTimeString(new Date(iso), 'yyyy-MM-dd HH:mm');
}

function roleLabel(role: string): string {
	if (role === 'user') return i18n.ts._agents.exampleTurnRoleUser;
	if (role === 'assistant') return i18n.ts._agents.exampleTurnRoleAssistant;
	return i18n.ts._agents.adminAgentChatAuditRoleSystem;
}

function sessionKindLabel(kind: string): string {
	return kind === 'community'
		? i18n.ts._agents.adminAgentChatAuditSessionKindCommunity
		: i18n.ts._agents.adminAgentChatAuditSessionKindDraft;
}

function copyId(id: string): void {
	copyToClipboard(id);
}

onMounted(() => {
	loadSessions(true);
});
</script>

<style lang="scss" module>
/* Tab Bar */
.tabBar {
	display: flex;
	gap: 0;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	overflow: hidden;
	background: var(--MI_THEME-panel);
}
.tab {
	flex: 1;
	padding: 10px 16px;
	font-size: 0.9em;
	font-weight: 600;
	cursor: pointer;
	background: transparent;
	border: none;
	color: var(--MI_THEME-fgTransparentWeak);
	transition: background 0.15s, color 0.15s;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 6%, transparent);
	}
}
.tabActive {
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
	color: var(--MI_THEME-accent);
}

/* 嵌在 PageWithHeader / _gaps 内时，缺 min-width: 0 会导致 flex 子项无法收束，主栏看起来「宽屏也挤」 */
.splitViewRoot {
	width: 100%;
	min-width: 0;
	box-sizing: border-box;
}
/* Split View：主内容区常比视口窄（管理侧栏 + 右栏挂件），禁用 minmax(520px) 式硬下限，避免右栏被挤成细条 */
.splitView {
	display: flex;
	flex-direction: row;
	align-items: stretch;
	gap: 12px;
	min-height: 66vh;
	width: 100%;
	min-width: 0;
	box-sizing: border-box;
}
.leftPanel {
	flex: 0 0 auto;
	width: clamp(220px, 30%, 320px);
	max-width: 320px;
	min-width: 200px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 94%, var(--MI_THEME-bg));
	padding: 12px;
	overflow-x: hidden;
	overflow-y: auto;
	max-height: calc(100vh - 220px);
}
.rightPanel {
	flex: 1 1 0%;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 10px;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 95%, var(--MI_THEME-bg));
	padding: 12px;
	overflow-x: hidden;
	overflow-y: auto;
	max-height: calc(100vh - 220px);
}

@media (max-width: 720px) {
	.splitView {
		flex-direction: column;
	}
	.leftPanel {
		width: 100%;
		max-width: none;
		min-width: 0;
		max-height: 44vh;
	}
	.leftPanelHideMobile {
		display: none;
	}
	.rightPanel {
		flex: 1 1 auto;
		min-width: 0;
		max-height: none;
	}
	.rightPanelHideMobile {
		display: none;
	}
}

.panelHeader {
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
}
.panelTitle {
	margin: 0;
	font-size: 1em;
	font-weight: 700;
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sessionFilters {
	padding: 8px 0;
}

/* Session List */
.sessionList {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-height: 220px;
}
.sessionItem {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border-radius: 8px;
	border: solid 1px transparent;
	background: transparent;
	cursor: pointer;
	text-align: left;
	transition: background 0.12s, border-color 0.12s;
	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 6%, transparent);
		border-color: color-mix(in srgb, var(--MI_THEME-accent) 18%, transparent);
	}
}
.sessionItemActive {
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
	border-color: var(--MI_THEME-accent);
}
.sessionItemHead {
	display: flex;
	align-items: center;
	gap: 8px;
}
.sessionItemName {
	font-weight: 600;
	font-size: 0.9em;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	flex: 1;
	min-width: 0;
}
.sessionItemKind {
	font-size: 0.75em;
	padding: 1px 6px;
	border-radius: 4px;
	background: var(--MI_THEME-bg);
	border: solid 1px var(--MI_THEME-divider);
	color: var(--MI_THEME-fgTransparentWeak);
	flex-shrink: 0;
}
.sessionItemMeta {
	display: flex;
	align-items: center;
	gap: 4px;
	font-size: 0.82em;
	color: var(--MI_THEME-fgTransparentWeak);
	overflow: hidden;
	flex-wrap: nowrap;
}
.sessionItemUser {
	font-weight: 500;
}
.sessionItemUserId {
	font-family: monospace;
	font-size: 0.9em;
}
.sessionItemDot {
	opacity: 0.5;
}
.sessionItemCharName {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.sessionItemFooter {
	display: flex;
	align-items: center;
	gap: 8px;
}
.sessionItemTime {
	font-size: 0.78em;
	color: var(--MI_THEME-fgTransparentWeak);
	font-variant-numeric: tabular-nums;
}

/* Detail Bar */
.sessionDetailBar {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	padding: 10px 0;
	@media (max-width: 600px) {
		grid-template-columns: 1fr;
	}
}
.detailItem {
	display: flex;
	flex-direction: column;
	gap: 3px;
	font-size: 0.84em;
	padding: 6px 8px;
	border-radius: 6px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 14%, transparent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 60%, transparent);
}
.detailKey {
	font-weight: 600;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
}
.detailMono {
	font-size: 0.82em;
	word-break: break-all;
	padding: 1px 4px;
	border-radius: 3px;
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
}

.modActionsBar {
	flex-wrap: wrap;
	gap: 8px;
	padding-bottom: 8px;
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.backBtn {
	display: none;
	cursor: pointer;
	background: transparent;
	border: none;
	color: var(--MI_THEME-accent);
	font-size: 0.85em;
	font-weight: 600;
	padding: 4px 8px;
	border-radius: 6px;
	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	}
	@media (max-width: 720px) {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
}

/* Select Hint */
.selectHint {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 12px;
	height: 100%;
	min-height: 360px;
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: center;
}
.selectHintIcon {
	font-size: 3em;
	opacity: 0.3;
}

/* Timeline */
.timeline {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 6px 2px;
}
.msgBubble {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 14px;
	border-radius: 12px;
	max-width: min(92%, 760px);
}
.msgUser {
	align-self: flex-end;
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, transparent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 24%, transparent);
}
.msgAssistant {
	align-self: flex-start;
	background: color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-fg) 14%, transparent);
}
.msgSystem {
	align-self: center;
	background: color-mix(in srgb, var(--MI_THEME-warn) 10%, transparent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-warn) 18%, transparent);
	font-size: 0.88em;
	max-width: 95%;
}
.msgHead {
	display: flex;
	align-items: center;
	gap: 8px;
}
.msgRole {
	font-size: 0.78em;
	font-weight: 700;
	opacity: 0.7;
}
.msgTime {
	font-size: 0.75em;
	color: var(--MI_THEME-fgTransparentWeak);
	font-variant-numeric: tabular-nums;
	margin-left: auto;
}
.msgContent {
	margin: 0;
	white-space: pre-wrap;
	word-break: break-word;
	font-size: 0.92em;
	line-height: 1.45;
	max-height: min(46vh, 420px);
	overflow: auto;
}

.renderPreview {
	margin-top: 8px;
	padding: 10px 12px;
	border-radius: 8px;
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 88%, var(--MI_THEME-bg));
	line-height: 1.5;
	word-break: break-word;

	&:deep(img) {
		max-width: 100%;
		max-height: 360px;
		object-fit: contain;
		border-radius: 6px;
	}

	&:deep(p) {
		margin: 0.35em 0;
	}
}

.emptyMsg {
	text-align: center;
	padding: 24px 12px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
}
.loadMoreWrap {
	text-align: center;
	padding: 8px 0;
}

.bannedBadge {
	display: inline-block;
	padding: 2px 8px;
	border-radius: 6px;
	font-size: 0.78em;
	font-weight: 700;
	background: color-mix(in srgb, var(--MI_THEME-error), transparent 82%);
	color: var(--MI_THEME-error);
}

/* ─── 消息检索 Tab 样式（保留原有） ─── */
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
.indexRow {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 8px;
	margin-bottom: 6px;
	@media (max-width: 880px) {
		grid-template-columns: 1fr;
	}
}
.indexCompactItem {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	align-items: center;
	column-gap: 8px;
	row-gap: 2px;
	padding: 6px 8px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 10%, transparent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 68%, transparent);
	font-size: 0.8em;
	line-height: 1.2;
	> .mono {
		grid-column: 1 / -1;
	}
	> .miniCopy {
		justify-self: end;
	}
}
.indexKey {
	font-weight: 600;
	color: var(--MI_THEME-fgTransparentWeak);
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
.miniCopy {
	padding: 2px 6px;
	border-radius: 4px;
	color: var(--MI_THEME-fgTransparentWeak);
	&:hover {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-panel);
	}
}
.kindTag {
	padding: 2px 8px;
	border-radius: 6px;
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
	color: var(--MI_THEME-fgTransparentWeak);
	font-weight: 600;
}
.contentBox {
	display: flex;
	flex-direction: column;
	gap: 6px;
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
