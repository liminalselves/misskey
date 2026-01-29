<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 800px;">
	<!-- 将Tab和刷新按钮放在同一行 -->
	<div :class="$style.header">
		<MkTab
			v-model="tab"
			:tabs="[
				{ key: 'notes', label: i18n.ts.notes },
				{ key: 'polls', label: i18n.ts.poll },
			]"
		>
		</MkTab>
		<MkButton v-tooltip="i18n.ts.reload" iconOnly transparent rounded @click="reload">
			<i class="ti ti-refresh"></i>
		</MkButton>
	</div>
	<!-- 都使用 MkFeaturedTimeline 显示带分数的帖子 -->
	<MkFeaturedTimeline v-if="tab === 'notes'" :key="'notes'" :paginator="paginatorForNotes" :withControl="false"/>
	<MkFeaturedTimeline v-else-if="tab === 'polls'" :key="'polls'" :paginator="paginatorForPolls" :withControl="false"/>
</div>
</template>

<script lang="ts" setup>
import { markRaw, ref, watch } from 'vue';
import MkFeaturedTimeline from '@/components/MkFeaturedTimeline.vue';
import MkTab from '@/components/MkTab.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { Paginator } from '@/utility/paginator.js';

// 存储已展示的帖子 ID
const displayedNoteIds = ref<string[]>([]);
const displayedPollIds = ref<string[]>([]);

// 帖子分页器
const paginatorForNotes = markRaw(new Paginator('notes/featured', {
	limit: 10,
	params: () => ({
		excludeIds: displayedNoteIds.value,
	} as any),
}));

// 投票分页器
const paginatorForPolls = markRaw(new Paginator('notes/polls/recommendation', {
	limit: 10,
	offsetMode: true, // Fix for recommendation endpoint expecting offset
	params: () => ({
		excludeChannels: true,
		excludeIds: displayedPollIds.value,
	} as any),
}));

// Hack: 拦截 reload 方法以在重新加载前重置状态，并防止重复请求
const originalReloadNotes = paginatorForNotes.reload;
paginatorForNotes.reload = async () => {
	if (paginatorForNotes.fetching.value) return;
	displayedNoteIds.value = [];
	return await originalReloadNotes.call(paginatorForNotes);
};

// Hack: 拦截 reload 方法 (投票)
const originalReloadPolls = paginatorForPolls.reload;
paginatorForPolls.reload = async () => {
	if (paginatorForPolls.fetching.value) return;
	displayedPollIds.value = [];
	return await originalReloadPolls.call(paginatorForPolls);
};

// 监听 items 变化实时更新已展示 ID
watch(() => paginatorForNotes.items.value, (items) => {
	if (items.length > 0) {
		displayedNoteIds.value = items.map(note => note.id);
	}
}, { deep: true });

watch(() => paginatorForPolls.items.value, (items) => {
	if (items.length > 0) {
		displayedPollIds.value = items.map(note => note.id);
	}
}, { deep: true });

const tab = ref<'notes' | 'polls'>('notes');

watch(tab, (newTab) => {
	if (newTab === 'notes') {
		displayedNoteIds.value = [];
	} else {
		displayedPollIds.value = [];
	}
});

function reload() {
	if (tab.value === 'notes') {
		paginatorForNotes.reload();
	} else {
		paginatorForPolls.reload();
	}
}
</script>

<style lang="scss" module>
.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: var(--MI-margin);
}
</style>

