<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" v-slot="{ type }" :zPriority="'high'" :anchorElement="anchorElement" @click="modal?.close()" @closed="emit('closed')" @esc="modal?.close()">
	<div class="_popup" :class="[$style.root, type === 'drawer' ? $style.asDrawer : null]">
		<div :class="$style.search">
			<i class="ti ti-search"></i>
			<input v-model="query" :class="$style.searchInput" type="search" placeholder="搜索模型名称或 ID" :autofocus="!isTouchUsing"/>
		</div>
		<div :class="$style.bulk">
			<span>{{ selected.size === 0 ? '未选择 = 全部模型' : `已选 ${selected.size} 个` }}</span>
			<button type="button" class="_textButton" :disabled="selected.size === 0" @click="clear">清空</button>
		</div>
		<div :class="$style.list">
			<template v-for="g in groups" :key="g.category">
				<div :class="$style.groupHead">
					<span>{{ CATEGORY_LABELS[g.category] }}</span>
					<button type="button" class="_textButton" @click="toggleGroup(g.items)">{{ g.items.every(m => selected.has(m.id)) ? '取消全选' : '全选' }}</button>
				</div>
				<button
					v-for="m in g.items"
					:key="m.id"
					type="button"
					class="_button"
					:class="[$style.item, selected.has(m.id) ? $style.itemOn : null]"
					@click="toggle(m.id)"
				>
					<i :class="selected.has(m.id) ? 'ti ti-square-check-filled' : 'ti ti-square'"></i>
					<span :class="$style.itemName">{{ m.name }}</span>
					<span v-if="m.state === 'unlisted'" :class="$style.tag">已下架</span>
					<span v-else-if="m.state === 'disabled'" :class="$style.tag">已停用</span>
					<span v-else-if="m.state === 'deleted'" :class="$style.tag">已删除</span>
				</button>
			</template>
			<div v-if="groups.length === 0" :class="$style.empty">没有匹配的模型</div>
		</div>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef } from 'vue';
import { CATEGORY_LABELS } from './report-utils.js';
import type { CatalogEntry, ModelCategory } from './report-utils.js';
import MkModal from '@/components/MkModal.vue';
import { isTouchUsing } from '@/utility/touch.js';

const props = defineProps<{
	catalog: CatalogEntry[];
	modelValue: string[];
	anchorElement?: HTMLElement | null;
}>();

const emit = defineEmits<{
	(ev: 'update:modelValue', v: string[]): void;
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');
const query = ref('');
// Initial copy on purpose: the popup owns the working selection and emits every change.
// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const selected = ref(new Set(props.modelValue));

const CATEGORY_ORDER: ModelCategory[] = ['llm', 'image', 'vision', 'byok', 'unassigned', 'deleted'];

const groups = computed(() => {
	const q = query.value.trim().toLowerCase();
	const match = (m: CatalogEntry) => q === '' || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q);
	return CATEGORY_ORDER
		.map(category => ({ category, items: props.catalog.filter(m => m.category === category && match(m)) }))
		.filter(g => g.items.length > 0);
});

function commit() {
	emit('update:modelValue', [...selected.value]);
}

function toggle(id: string) {
	const next = new Set(selected.value);
	if (next.has(id)) next.delete(id); else next.add(id);
	selected.value = next;
	commit();
}

function toggleGroup(items: CatalogEntry[]) {
	const next = new Set(selected.value);
	const allOn = items.every(m => next.has(m.id));
	for (const m of items) {
		if (allOn) next.delete(m.id); else next.add(m.id);
	}
	selected.value = next;
	commit();
}

function clear() {
	selected.value = new Set();
	commit();
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	box-sizing: border-box;
	width: 340px;
	max-width: calc(100vw - 24px);
	max-height: min(520px, 70vh);
	padding: 8px 0;
}

.asDrawer {
	width: 100%;
	max-width: none;
	max-height: 75vh;
	padding: 12px 0 max(12px, env(safe-area-inset-bottom, 0px));
	border-radius: 24px 24px 0 0;
}

.search {
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 0 10px 6px;
	padding: 0 10px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 6%, transparent);

	> i {
		opacity: 0.56;
	}
}

.searchInput {
	flex: 1;
	min-width: 0;
	height: 34px;
	border: none;
	outline: none;
	background: none;
	color: inherit;
	font: inherit;

	/* iOS Safari zooms the whole page when focusing an input below 16px. */
	@media (pointer: coarse) {
		height: 38px;
		font-size: 16px;
	}
}

.bulk {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 2px 16px 6px;
	font-size: 0.82em;
	opacity: 0.8;
}

.list {
	overflow-y: auto;
	min-height: 0;
}

.groupHead {
	position: sticky;
	top: 0;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 8px 16px 4px;
	font-size: 0.75em;
	font-weight: 700;
	letter-spacing: 0.04em;
	background: var(--MI_THEME-popup);

	> span {
		opacity: 0.6;
	}
}

.item {
	display: flex;
	align-items: center;
	gap: 10px;
	box-sizing: border-box;
	width: 100%;
	padding: 7px 16px;
	text-align: left;
	font-size: 0.9em;

	@media (pointer: coarse) {
		padding: 10px 16px;
	}

	> i {
		flex-shrink: 0;
		opacity: 0.5;
	}

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 8%, transparent);
	}
}

.itemOn > i {
	color: var(--MI_THEME-accent);
	opacity: 1;
}

.itemName {
	flex: 1;
	min-width: 0;
	overflow-wrap: anywhere;
}

.tag {
	flex-shrink: 0;
	padding: 1px 6px;
	border-radius: 999px;
	font-size: 0.75em;
	background: color-mix(in srgb, var(--MI_THEME-fg) 12%, transparent);
}

.empty {
	padding: 16px;
	text-align: center;
	font-size: 0.85em;
	opacity: 0.56;
}
</style>
