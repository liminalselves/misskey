<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkLoading v-if="pagination.loading.value && sessions.length === 0"/>
	<MkInfo v-else-if="pagination.error.value != null && sessions.length === 0">
		{{ formatApiError(pagination.error.value) }}
		<MkButton rounded @click="pagination.load(true)"><i class="ti ti-refresh"></i> 重试</MkButton>
	</MkInfo>
	<MkInfo v-else-if="sessions.length === 0">该用户还没有智能体会话。</MkInfo>
	<div v-else :class="$style.list">
		<button
			v-for="row in sessions"
			:key="row.id"
			type="button"
			class="_button"
			:class="$style.sessionRow"
			:title="'打开会话审查'"
			@click="openSessionReview(row.id)"
		>
			<span :class="$style.rowHead">
				<b :class="$style.sessionName">{{ row.name }}</b>
				<span :class="$style.rowBadges">
					<span :class="$style.typeBadge">{{ row.sessionKind === 'draft_test' ? '测试会话' : '社区会话' }}</span>
					<span v-if="row.moderationBanned" :class="$style.warnBadge">已封禁</span>
				</span>
			</span>
			<span :class="$style.rowMeta">
				<span :class="$style.metaItem" title="角色"><i class="ti ti-robot"></i>{{ row.characterName || '—' }}</span>
				<span v-if="row.messageCount != null" :class="$style.metaItem" :title="`共 ${row.messageCount} 条消息`"><i class="ti ti-messages"></i>{{ row.messageCount.toLocaleString() }}</span>
				<time :class="$style.metaItem" :title="formatTime(row.lastMessageAt || row.updatedAt)"><i class="ti ti-clock"></i>{{ formatTime(row.lastMessageAt || row.updatedAt) }}</time>
				<i class="ti ti-chevron-right" :class="$style.goIcon"></i>
			</span>
		</button>
		<div v-if="pagination.hasMore.value" :class="$style.loadMore">
			<MkButton small rounded :disabled="pagination.loading.value" @click="pagination.load(false)"><i class="ti ti-chevron-down"></i> {{ pagination.loading.value ? '载入中…' : '继续载入' }}</MkButton>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { watch } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { useGovernancePagination } from '@/composables/use-governance-pagination.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { formatDateTimeString } from '@/utility/format-time-string.js';
import { preferMobileNavigation } from '@/utility/prefer-mobile-navigation.js';
import { useRouter } from '@/router.js';

const props = defineProps<{
	userId: string;
}>();

const router = useRouter();
const PAGE_SIZE = 20;

type SessionRow = { id: string; name: string; sessionKind: 'draft_test' | 'community'; moderationBanned: boolean; characterName: string; messageCount: number | null; lastMessageAt: string | null; updatedAt: string };

const pagination = useGovernancePagination<SessionRow>(async (untilId) => {
	return await (misskeyApi as unknown as (ep: string, data: Record<string, unknown>) => Promise<SessionRow[]>)('admin/agents/governance/sessions/list', {
		userId: props.userId,
		limit: PAGE_SIZE + 1,
		untilId,
	});
}, { pageSize: PAGE_SIZE });
const sessions = pagination.items;

function formatTime(v: string | null | undefined): string {
	return v ? formatDateTimeString(new Date(v), 'yyyy-MM-dd HH:mm') : '—';
}

// 与会话治理页一致：电脑新标签页，手机/App 站内跳转
function openSessionReview(sessionId: string) {
	const path = `/admin/agent-session/${encodeURIComponent(sessionId)}`;
	if (preferMobileNavigation()) {
		router.pushByPath(path, 'forcePage');
	} else {
		window.open(path, '_blank', 'noopener');
	}
}

watch(() => props.userId, () => {
	pagination.reset();
	void pagination.load(true);
}, { immediate: true });
</script>

<style lang="scss" module>
.list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.sessionRow {
	display: block;
	width: 100%;
	box-sizing: border-box;
	text-align: left;
	padding: 12px 16px;
	border-radius: 10px;
	border: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	transition: border-color 0.15s;

	&:hover {
		border-color: var(--MI_THEME-accent);
	}
}

.rowHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-width: 0;
}

.sessionName {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.rowBadges {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	flex-shrink: 0;
}

.typeBadge {
	padding: 2px 8px;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 0.78em;
}

.warnBadge {
	padding: 2px 8px;
	border-radius: 999px;
	background: var(--MI_THEME-errorBg);
	color: var(--MI_THEME-error);
	font-size: 0.78em;
}

.rowMeta {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 4px 14px;
	margin-top: 6px;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.metaItem {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	font-variant-numeric: tabular-nums;

	> i {
		font-size: 0.95em;
		opacity: 0.7;
	}
}

.goIcon {
	margin-left: auto;
	opacity: 0.5;
}

.loadMore {
	display: flex;
	justify-content: center;
}
</style>
