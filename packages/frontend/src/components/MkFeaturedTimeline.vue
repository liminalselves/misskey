<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkPagination :paginator="paginator" :direction="direction" :autoLoad="autoLoad" :pullToRefresh="pullToRefresh" :withControl="withControl" :forceDisableInfiniteScroll="forceDisableInfiniteScroll">
	<template #empty><MkResult type="empty" :text="i18n.ts.noNotes"/></template>

	<template #default="{ items: notes }">
		<div :class="[$style.root, '_gaps']">
			<template v-for="note in notes" :key="note.id">
				<MkFeaturedNote :note="note" :class="$style.note" :data-scroll-anchor="note.id"/>
			</template>
		</div>
	</template>
</MkPagination>
</template>

<script lang="ts" setup generic="T extends IPaginator<Misskey.entities.Note & { _featuredScore_?: number }>">
import * as Misskey from 'misskey-js';
import type { MkPaginationOptions } from '@/components/MkPagination.vue';
import type { IPaginator } from '@/utility/paginator.js';
import MkFeaturedNote from '@/components/MkFeaturedNote.vue';
import MkPagination from '@/components/MkPagination.vue';
import { i18n } from '@/i18n.js';
import { useGlobalEvent } from '@/events.js';

const props = withDefaults(defineProps<MkPaginationOptions & {
	paginator: T;
}>(), {
	autoLoad: true,
	direction: 'down',
	pullToRefresh: true,
	withControl: false,
	forceDisableInfiniteScroll: false,
});

useGlobalEvent('noteDeleted', (noteId) => {
	props.paginator.removeItem(noteId);
});

function reload() {
	return props.paginator.reload();
}

defineExpose({
	reload,
});
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
	background: var(--MI_THEME-bg);
}

.note {
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}
</style>
