<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- 管理员审查：对象存储里已不存在、但网盘数据库仍有记录的文件（由访问上报并经服务端核实） -->
<template>
<div class="_gaps_m">
	<MkInfo>
		这里列出被用户访问时发现对象存储中已不存在的网盘文件，服务端已用带凭证的请求核实过。确认无误后可批量删除记录：引用处会显示「已被清理」占位，属主会收到通知。删除前会再次核实每个文件。
	</MkInfo>

	<div :class="$style.toolbar">
		<div :class="$style.scopeFilter">
			<button
				v-for="opt in scopeOptions"
				:key="opt.key"
				type="button"
				class="_button"
				:class="[$style.chip, scope === opt.key ? $style.chipActive : null]"
				@click="setScope(opt.key)"
			>{{ opt.label }}</button>
		</div>
		<div :class="$style.actions">
			<MkButton :disabled="busy || selectedIds.length === 0" @click="recheckSelected"><i class="ti ti-refresh"></i> 重新核实选中</MkButton>
			<MkButton danger :disabled="busy || selectedIds.length === 0" @click="deleteSelected"><i class="ti ti-trash"></i> 删除选中（{{ selectedIds.length }}）</MkButton>
		</div>
	</div>

	<MkLoading v-if="loading && items.length === 0"/>
	<MkResult v-else-if="loadFailed && items.length === 0" type="error" text="加载失败">
		<MkButton rounded @click="load(page)">重试</MkButton>
	</MkResult>
	<MkInfo v-else-if="items.length === 0">没有待审查的文件。</MkInfo>
	<template v-else>
		<div :class="$style.table">
			<div :class="[$style.row, $style.headRow]">
				<span :class="$style.check"><input type="checkbox" :checked="allSelected" :disabled="busy" @change="toggleAll"/></span>
				<span>文件</span>
				<span>属主</span>
				<span>位置</span>
				<span :class="$style.num">上报次数</span>
				<span>最后上报</span>
				<span>最后核实</span>
			</div>
			<div v-for="item in items" :key="item.id" :class="[$style.row, selected.has(item.id) ? $style.rowSelected : null]">
				<span :class="$style.check"><input type="checkbox" :checked="selected.has(item.id)" :disabled="busy" @change="toggle(item.id)"/></span>
				<span :class="$style.fileCell">
					<span :class="$style.fileName">{{ item.name }}</span>
					<span :class="$style.fileMeta">{{ item.type }} · {{ formatFileSize(item.size) }}</span>
				</span>
				<span><MkUserAcctInline :user="item.user" fallback="-"/></span>
				<span :class="$style.locationCell">
					<span :class="[$style.badge, item.scope === 'legacy' ? $style.badgeLegacy : $style.badgeCurrent]">{{ scopeLabel(item.scope) }}</span>
					<code :class="$style.objectKey">{{ item.bucket }}/{{ item.objectKey }}</code>
				</span>
				<span :class="$style.num">{{ item.reportCount }}</span>
				<span><MkTime :time="item.lastReportedAt" mode="detail"/></span>
				<span><MkTime :time="item.verifiedAt" mode="detail"/></span>
			</div>
		</div>

		<div :class="$style.pagerBar">
			<div :class="$style.pageSizes">
				<button
					v-for="size in pageSizeOptions"
					:key="size"
					type="button"
					class="_button"
					:class="[$style.pagerSizeBtn, pageSize === size ? $style.pagerSizeBtnActive : null]"
					:disabled="busy"
					@click="setPageSize(size)"
				>{{ size }}</button>
			</div>
			<button type="button" class="_button" :class="$style.pagerNavBtn" :disabled="page <= 1 || loading || busy" @click="load(page - 1)">
				<i class="ti ti-chevron-left"></i>
			</button>
			<span :class="$style.pagerText">{{ page }} / {{ totalPages }}</span>
			<button type="button" class="_button" :class="$style.pagerNavBtn" :disabled="page >= totalPages || loading || busy" @click="load(page + 1)">
				<i class="ti ti-chevron-right"></i>
			</button>
		</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkResult from '@/components/global/MkResult.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkUserAcctInline from '@/components/MkUserAcctInline.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import {
	buildDeleteConfirmText,
	formatFileSize,
	pageAfterRemoval,
	resolvedIds,
	scopeLabel,
	summarizeBatch,
} from '@/utility/drive-missing-reports.js';
import type { MissingBatchResponse } from '@/utility/drive-missing-reports.js';

type ReportItem = {
	id: string;
	fileId: string;
	name: string;
	type: string;
	size: number;
	user: Misskey.entities.UserLite | null;
	bucket: string;
	objectKey: string;
	scope: 'current' | 'legacy';
	reportCount: number;
	firstReportedAt: string;
	lastReportedAt: string;
	verifiedAt: string;
};
type ListResponse = { items: ReportItem[]; total: number; page: number; pageSize: number };
type ScopeKey = 'all' | 'current' | 'legacy';

// 新端点按项目惯例强转，不重新生成 misskey-js
const api = misskeyApi as unknown as <T>(endpoint: string, data: Record<string, unknown>) => Promise<T>;

const pageSizeOptions = [10, 20, 50] as const;
const scopeOptions: { key: ScopeKey; label: string }[] = [
	{ key: 'all', label: '全部' },
	{ key: 'current', label: '当前桶' },
	{ key: 'legacy', label: '旧桶' },
];

const items = ref<ReportItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref<number>(20);
const scope = ref<ScopeKey>('all');
const loading = ref(false);
const loadFailed = ref(false);
const busy = ref(false);
const selected = ref(new Set<string>());
let loadSeq = 0;

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const selectedIds = computed(() => [...selected.value]);
const allSelected = computed(() => items.value.length > 0 && items.value.every(i => selected.value.has(i.id)));

async function load(targetPage = page.value): Promise<void> {
	const seq = ++loadSeq;
	loading.value = true;
	loadFailed.value = false;
	try {
		const res = await api<ListResponse>('admin/drive/missing-reports/list', {
			page: targetPage,
			pageSize: pageSize.value,
			...(scope.value !== 'all' ? { scope: scope.value } : {}),
		});
		if (seq !== loadSeq) return; // 丢弃迟到的响应
		// 总数缩小后请求页越界：回到最后一页重取
		if (res.items.length === 0 && res.total > 0 && targetPage > 1) {
			await load(Math.max(1, Math.ceil(res.total / pageSize.value)));
			return;
		}
		items.value = res.items;
		total.value = res.total;
		page.value = res.page;
		// 只保留仍在当前页的选中项
		selected.value = new Set([...selected.value].filter(id => res.items.some(i => i.id === id)));
	} catch {
		if (seq !== loadSeq) return;
		loadFailed.value = true;
	} finally {
		if (seq === loadSeq) loading.value = false;
	}
}

function setScope(key: ScopeKey): void {
	if (scope.value === key) return;
	scope.value = key;
	selected.value = new Set();
	void load(1);
}

function setPageSize(size: number): void {
	if (pageSize.value === size) return;
	pageSize.value = size;
	selected.value = new Set();
	void load(1);
}

function toggle(id: string): void {
	const next = new Set(selected.value);
	if (next.has(id)) next.delete(id);
	else next.add(id);
	selected.value = next;
}

function toggleAll(): void {
	selected.value = allSelected.value ? new Set() : new Set(items.value.map(i => i.id));
}

/** 就地移除已处理的行，不整表重载；当前页空了则回退一页。 */
function removeRows(ids: string[]): void {
	if (ids.length === 0) return;
	const gone = new Set(ids);
	items.value = items.value.filter(i => !gone.has(i.id));
	total.value = Math.max(0, total.value - ids.length);
	selected.value = new Set([...selected.value].filter(id => !gone.has(id)));
	const nextPage = pageAfterRemoval(page.value, items.value.length);
	if (nextPage !== page.value || items.value.length === 0) void load(nextPage);
}

async function recheckSelected(): Promise<void> {
	if (busy.value || selectedIds.value.length === 0) return;
	busy.value = true;
	try {
		const res = await api<MissingBatchResponse>('admin/drive/missing-reports/recheck', { ids: selectedIds.value });
		// recheck 会更新仍缺失行的核实时间，重新加载当前页以保证显示准确（只刷新当前页，不重置到第一页）
		await load(page.value);
		await os.alert({ type: res.aborted ? 'warning' : 'info', text: summarizeBatch(res, 'recheck') });
	} catch (err) {
		await os.alert({ type: 'error', text: err instanceof Error ? err.message : '核实失败' });
	} finally {
		busy.value = false;
	}
}

async function deleteSelected(): Promise<void> {
	if (busy.value || selectedIds.value.length === 0) return;
	const { canceled } = await os.confirm({
		type: 'warning',
		title: '删除丢失的文件记录',
		text: buildDeleteConfirmText(selectedIds.value.length),
	});
	if (canceled) return;

	busy.value = true;
	try {
		const res = await api<MissingBatchResponse>('admin/drive/missing-reports/delete', { ids: selectedIds.value });
		removeRows(resolvedIds(res));
		await os.alert({ type: res.aborted ? 'warning' : 'success', text: summarizeBatch(res, 'delete') });
	} catch (err) {
		await os.alert({ type: 'error', text: err instanceof Error ? err.message : '删除失败' });
	} finally {
		busy.value = false;
	}
}

onMounted(() => {
	void load(1);
});

defineExpose({ reload: () => load(page.value) });
</script>

<style lang="scss" module>
.toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}
.scopeFilter {
	display: inline-flex;
	gap: 6px;
}
.chip {
	padding: 4px 12px;
	border-radius: 999px;
	border: solid 1px var(--MI_THEME-divider);
	font-size: 0.85em;
}
.chipActive {
	color: var(--MI_THEME-accent);
	border-color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
}
.actions {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 8px;
}

/* 表级单一 grid + 行 display:contents：列宽跨行对齐，超宽时整表横向滚动，不截断 */
.table {
	display: grid;
	grid-template-columns: max-content minmax(max-content, 1.6fr) minmax(max-content, 1fr) minmax(max-content, 2fr) max-content minmax(max-content, 1fr) minmax(max-content, 1fr);
	border-radius: 12px;
	overflow-x: auto;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}
.row {
	display: contents;
	font-size: 0.9em;
}
.row > * {
	display: flex;
	align-items: center;
	padding: 10px 4px;
	border-bottom: solid 1px var(--MI_THEME-divider);
	white-space: nowrap;
}
.row > *:first-child {
	padding-left: 14px;
}
.row > *:last-child {
	padding-right: 14px;
}
.row:last-child > * {
	border-bottom: none;
}
.rowSelected > * {
	background: color-mix(in srgb, var(--MI_THEME-accent) 8%, transparent);
}
.headRow {
	font-size: 0.76em;
}
.headRow > * {
	padding-top: 8px;
	padding-bottom: 8px;
	font-weight: 600;
	opacity: 0.56;
	letter-spacing: 0.04em;
	background: color-mix(in srgb, var(--MI_THEME-panel) 70%, var(--MI_THEME-divider));
}
.check {
	justify-content: center;
}
.num {
	justify-content: flex-end;
	font-variant-numeric: tabular-nums;
}
.fileCell {
	flex-direction: column;
	align-items: flex-start !important;
	gap: 2px;
}
.fileName {
	font-weight: 500;
}
.fileMeta {
	font-size: 0.8em;
	opacity: 0.6;
}
.locationCell {
	gap: 8px;
}
.objectKey {
	font-size: 0.85em;
}
.badge {
	padding: 1px 8px;
	border-radius: 999px;
	font-size: 0.78em;
	font-weight: 600;
}
.badgeCurrent {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, transparent);
}
.badgeLegacy {
	color: var(--MI_THEME-warn);
	background: color-mix(in srgb, var(--MI_THEME-warn) 16%, transparent);
}

.pagerBar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 10px 0 4px;
}
.pageSizes {
	display: inline-flex;
	overflow: hidden;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
}
.pagerSizeBtn {
	min-width: 36px;
	height: 28px;
	padding: 0 8px;
	border-right: solid 1px var(--MI_THEME-divider);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.82em;
	font-weight: 600;
}
.pagerSizeBtn:last-child {
	border-right: none;
}
.pagerSizeBtnActive {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
}
.pagerNavBtn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 6px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
}
.pagerNavBtn:disabled {
	opacity: 0.4;
}
.pagerText {
	font-size: 0.85em;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	min-width: 4em;
	text-align: center;
}
</style>
