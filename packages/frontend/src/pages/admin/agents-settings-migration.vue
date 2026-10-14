<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkFolder :defaultOpen="true">
		<template #icon><i class="ti ti-key"></i></template>
		<template #label>系统授权 Key</template>
		<div class="_gaps">
			<MkInfo>{{ i18n.ts._agents.adminMigrationKeyHint }}</MkInfo>
			<div :class="$style.migrationKeyStatus">
				<span :class="[$style.migrationKeyDot, keyExists ? $style.migrationKeyDotActive : null]"></span>
				<span>{{ keyExists ? i18n.ts._agents.adminMigrationKeyGenerated : i18n.ts._agents.adminMigrationKeyNotGenerated }}</span>
			</div>
			<MkButton primary rounded :disabled="keyGenerating" @click="emit('generateKey')">
				<i class="ti ti-refresh"></i> {{ keyExists ? i18n.ts._agents.adminMigrationKeyRegenerate : i18n.ts._agents.adminMigrationKeyGenerate }}
			</MkButton>
		</div>
	</MkFolder>

	<MkFolder :defaultOpen="true">
		<template #icon><i class="ti ti-history"></i></template>
		<template #label>迁移日志</template>
		<div class="_gaps">
			<div class="_buttons">
				<MkButton rounded :disabled="logsLoading" @click="emit('refreshLogs')"><i class="ti ti-refresh"></i> 刷新</MkButton>
			</div>
			<MkLoading v-if="logsLoading"/>
			<!-- Mirrors the parent's .emptyModels placeholder (shared with other tabs there) -->
			<div v-else-if="logs.length === 0" :class="$style.emptyNote">暂无迁移记录</div>
			<div v-else :class="$style.simpleTable">
				<div :class="[$style.simpleRow, $style.simpleHeadRow]">
					<span>时间</span>
					<span>目标用户</span>
					<span>金额</span>
					<span>状态</span>
					<span>来源</span>
					<span>操作者</span>
				</div>
				<div v-for="row in logs" :key="row.id" :class="$style.simpleRow">
					<span>{{ new Date(row.createdAt).toLocaleString() }}</span>
					<span><MkUserName v-if="row.targetUser" :user="row.targetUser"/><template v-else>—</template></span>
					<span :class="$style.migrationAmount">+{{ row.amount.toFixed(2) }}</span>
					<span>{{ row.status === 'success' ? '成功' : '失败' }}</span>
					<span>{{ row.sourceInfo || '—' }}</span>
					<span><MkUserName v-if="row.operator" :user="row.operator"/><template v-else>—</template></span>
				</div>
			</div>
			<MkButton v-if="logs.length > 0 && logs.length % 30 === 0" rounded @click="emit('loadMore')"><i class="ti ti-chevron-down"></i> 加载更多</MkButton>
		</div>
	</MkFolder>
</div>
</template>

<script lang="ts" setup>
import MkInfo from '@/components/MkInfo.vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import { i18n } from '@/i18n.js';

/** Credit migration log row (admin/agents/migration-logs) */
export type MigrationLogRow = {
	id: string;
	createdAt: string;
	targetUser: any | null;
	amount: number;
	requestId: string | null;
	sourceInfo: string | null;
	operator: any | null;
	status: string;
	failReason: string | null;
};

/**
 * Migration panel (system authorization key + migration logs). Presentational
 * only: key generation and log loading stay in agents-settings.vue.
 */
defineProps<{
	keyExists: boolean;
	keyGenerating: boolean;
	logsLoading: boolean;
	logs: MigrationLogRow[];
}>();

const emit = defineEmits<{
	(ev: 'generateKey'): void;
	(ev: 'refreshLogs'): void;
	(ev: 'loadMore'): void;
}>();
</script>

<style lang="scss" module>
/* Same look as the parent page's shared .emptyModels placeholder */
.emptyNote {
	text-align: center;
	padding: 20px 12px;
	font-size: 0.92em;
	opacity: 0.72;
	border-radius: 12px;
	border: 1px dashed var(--MI_THEME-divider);
}

.simpleTable {
	display: grid;
	gap: 8px;
}

.simpleRow {
	display: grid;
	grid-template-columns: minmax(160px, 1.4fr) repeat(4, minmax(90px, 1fr)) auto;
	gap: 10px;
	align-items: center;
	padding: 10px 12px;
	border-radius: 8px;
	border: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	font-size: 0.9em;

	> * {
		min-width: 0;
		word-break: break-word;
	}
}

.simpleHeadRow {
	font-weight: 700;
	color: var(--MI_THEME-fgTransparentWeak);
	background: color-mix(in srgb, var(--MI_THEME-panel) 86%, var(--MI_THEME-bg));
	border-color: transparent;
	padding-block: 8px;
}

.migrationKeyStatus {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 0.95em;
	color: var(--MI_THEME-fg);
}

.migrationKeyDot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	background: var(--MI_THEME-fgTransparentWeak);
}

.migrationKeyDotActive {
	background: var(--MI_THEME-success);
	box-shadow: 0 0 6px color-mix(in srgb, var(--MI_THEME-success) 50%, transparent);
}

.migrationAmount {
	color: var(--MI_THEME-success);
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

@media (max-width: 800px) {
	.simpleRow {
		grid-template-columns: 1fr;
		gap: 6px;
	}

	.simpleHeadRow {
		display: none;
	}
}
</style>
