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
import { markRaw, ref, onUnmounted, watch } from 'vue';
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

// 监听 items 变化更新已展示 ID（通过定期同步）
const intervalId = window.setInterval(() => {
	// 使用 non-reactive 的方式获取 items，避免触发不必要的依赖更新（虽然这里是在 setInterval 里，本身没问题）
	if (paginatorForNotes.items.value.length > 0) {
		displayedNoteIds.value = paginatorForNotes.items.value.map(note => note.id);
	}
	if (paginatorForPolls.items.value.length > 0) {
		displayedPollIds.value = paginatorForPolls.items.value.map(note => note.id);
	}
}, 100);

onUnmounted(() => {
	window.clearInterval(intervalId);
});

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
		displayedNoteIds.value = [];
		paginatorForNotes.reload();
	} else {
		displayedPollIds.value = [];
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

