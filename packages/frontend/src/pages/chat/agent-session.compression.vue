<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<!-- 加载状态 -->
	<div v-if="loading" class="_gaps">
		<MkLoading/>
	</div>

	<template v-else-if="overview">
		<!-- 压缩进行中提示 -->
		<div v-if="hasProcessingSticky" :class="$style.processingHint" role="status">
			<i class="ti ti-loader-2" :class="$style.processingIcon"></i>
			<span>{{ i18n.ts._agents.compressionStickyProcessingHint }}</span>
		</div>

		<!-- 便签区（可折叠） -->
		<section :class="$style.stickySection">
			<header :class="$style.sectionHeader">
				<button type="button" class="_button" :class="$style.sectionTitleToggle" :aria-expanded="stickiesOpen" @click="stickiesOpen = !stickiesOpen">
					<i :class="['ti', stickiesOpen ? 'ti-chevron-up' : 'ti-chevron-down', $style.sectionChevron]" aria-hidden="true"></i>
					<i class="ti ti-bookmarks" :class="$style.sectionIcon"></i>
					<span :class="$style.sectionTitle">{{ i18n.ts._agents.compressionStickyTitle }}</span>
					<span v-if="overview" :class="$style.countBadge">{{ overview.stickies.length }}</span>
				</button>
				<button type="button" class="_button" :class="$style.refreshBtn" :disabled="loading" :title="i18n.ts.reload" @click="() => { void refresh(); }">
					<i class="ti ti-refresh"></i>
				</button>
			</header>

			<Transition :name="prefer.s.animation ? 'bands-toggle' : ''">
				<div v-show="stickiesOpen" :class="$style.stickyBody">
					<p :class="$style.sectionCaption">{{ i18n.ts._agents.compressionStickyFolderCaption }}</p>

					<!-- 空状态引导 -->
					<div v-if="overview.stickies.length === 0" :class="$style.emptyState">
						<i class="ti ti-notebook" :class="$style.emptyIcon"></i>
						<p :class="$style.emptyText">{{ i18n.ts._agents.compressionStickyEmptyGuide }}</p>
					</div>

					<!-- 便签列表 -->
					<TransitionGroup v-else name="sticky-list" tag="div" :class="$style.stickyList">
				<div
					v-for="(st, stIdx) in overview.stickies"
					:key="st.id"
					:class="$style.stickyCard"
				>
					<!-- 头部：状态 + 手改标记 + 排序 -->
					<div :class="$style.stickyHead">
						<div :class="$style.stickyHeadLeft">
							<span :class="$style.statePill" :data-state="st.state">{{ compressionStateLabel(st.state) }}</span>
							<span v-if="st.userOverridden" :class="$style.userTag">{{ i18n.ts._agents.compressionStickyUserEdited }}</span>
						</div>
						<div :class="$style.stickyHeadRight">
							<button type="button" class="_button" :class="$style.sortBtn" :disabled="mutating || moderationLocked || stIdx === 0" :title="i18n.ts._agents.compressionStickyMoveUp" @click="moveSticky(st.id, -1)">
								<i class="ti ti-chevron-up"></i>
							</button>
							<button type="button" class="_button" :class="$style.sortBtn" :disabled="mutating || moderationLocked || stIdx >= overview.stickies.length - 1" :title="i18n.ts._agents.compressionStickyMoveDown" @click="moveSticky(st.id, 1)">
								<i class="ti ti-chevron-down"></i>
							</button>
						</div>
					</div>

					<!-- 摘要主体（失败便签 summaryText 为空时不渲染空块，由下方错误区提示） -->
					<div v-if="editingId !== st.id && st.summaryText" :class="$style.stickySummary">{{ st.summaryText }}</div>

					<!-- 编辑模式 -->
					<div v-else class="_gaps">
						<MkTextarea v-model="editingText" :disabled="mutating || moderationLocked" tall pre/>
						<div :class="$style.editActions">
							<MkButton rounded small :disabled="mutating || moderationLocked" @click="cancelEdit">{{ i18n.ts.cancel }}</MkButton>
							<MkButton primary rounded small :disabled="mutating || moderationLocked" @click="submitEdit(st.id)">
								<template v-if="mutating"><MkLoading :em="true"/></template>
								<template v-else>{{ i18n.ts.save }}</template>
							</MkButton>
						</div>
					</div>

					<!-- 范围芯片（折叠式） -->
					<div v-if="editingId !== st.id" :class="$style.rangeRow">
						<button
							v-if="expandedRangeId !== st.id"
							type="button"
							:class="$style.rangeToggle"
							@click="expandedRangeId = st.id"
						>
							<i class="ti ti-arrows-horizontal" :class="$style.rangeToggleIcon"></i>
							<span>{{ i18n.ts._agents.compressionStickyRangeToggle }}</span>
							<i class="ti ti-chevron-down" :class="$style.rangeToggleChevron"></i>
						</button>
						<div v-else :class="$style.rangeExpanded">
							<div :class="$style.rangeChips">
								<button type="button" :class="$style.rangeChip" @click="emit('jumpToMessage', st.fromMessageId)">
									<span :class="$style.rangeLabel">{{ i18n.ts._agents.compressionStickyFrom }}</span>
									<span :class="$style.rangeText">{{ plainPreview(st.fromMessagePreview ?? '') }}</span>
								</button>
								<span :class="$style.rangeArrow" aria-hidden="true"><i class="ti ti-arrow-right"></i></span>
								<button type="button" :class="$style.rangeChip" @click="emit('jumpToMessage', st.toMessageId)">
									<span :class="$style.rangeLabel">{{ i18n.ts._agents.compressionStickyTo }}</span>
									<span :class="$style.rangeText">{{ plainPreview(st.toMessagePreview ?? '') }}</span>
								</button>
							</div>
							<button type="button" :class="$style.rangeCollapseBtn" @click="expandedRangeId = null">
								<i class="ti ti-chevron-up"></i>
								<span>{{ i18n.ts._agents.compressionStickyRangeCollapse }}</span>
							</button>
						</div>
					</div>

					<!-- 错误区 -->
					<div v-if="errorText(st.errorMessage)" :class="$style.errorBlock">
						<span :class="$style.errorText">{{ errorText(st.errorMessage) }}</span>
					</div>

					<!-- 操作栏（hover 显现） -->
					<div v-if="editingId !== st.id" :class="$style.stickyActions">
						<MkButton rounded small :disabled="mutating || moderationLocked" @click="startEdit(st)">
							<i class="ti ti-pencil"></i> {{ i18n.ts.edit }}
						</MkButton>
						<MkButton rounded small danger :disabled="mutating || moderationLocked" @click="confirmDelete(st.id)">
							<i class="ti ti-trash"></i> {{ i18n.ts.delete }}
						</MkButton>
					</div>
				</div>
			</TransitionGroup>
				</div>
			</Transition>
		</section>

		<!-- 消息分段区带 -->
		<section v-if="overview.messages.length" :class="$style.bandsSection">
			<button
				type="button"
				:class="$style.bandsHeader"
				:aria-expanded="bandsOpen"
				@click="bandsOpen = !bandsOpen"
			>
				<i :class="['ti', bandsOpen ? 'ti-chevron-up' : 'ti-chevron-down', $style.bandsChevron]" aria-hidden="true"></i>
				<span :class="$style.bandsTitleBlock">
					<span :class="$style.bandsTitle">{{ i18n.ts._agents.compressionMessageBands }}</span>
					<span :class="$style.bandsSubtitle">{{ i18n.ts._agents.compressionMessageBandsSubtitle }}</span>
				</span>
				<span v-tooltip="i18n.ts._agents.compressionTokensApproxTooltip" :class="$style.infoIcon"><i class="ti ti-info-circle"></i></span>
			</button>

			<!-- 区带进度条 -->
			<div v-if="bandsOpen && bandProgress.length > 0" :class="$style.bandProgress">
				<div
					v-for="seg in bandProgress"
					:key="seg.band"
					:class="$style.bandProgressSeg"
					:data-band="seg.band"
					:style="{ flexGrow: seg.ratio }"
					:title="`${seg.title}: ${seg.count}`"
				></div>
			</div>

			<!-- 刻度说明（tooltip 式） -->
			<div v-if="bandsOpen && scaleCaption" :class="$style.scaleCaption">{{ scaleCaption }}</div>

			<Transition :name="prefer.s.animation ? 'bands-toggle' : ''">
				<div v-show="bandsOpen" :class="$style.bandGroups">
					<div
						v-for="block in bandBlocks"
						:key="block.band"
						:class="$style.bandGroup"
					>
						<div :class="$style.bandGroupTitle">
							<span :class="$style.bandGroupLabel" :data-band="block.band">{{ block.title }}</span>
							<span :class="$style.bandGroupCount">{{ block.count }}</span>
							<span v-tooltip="bandTooltip(block.band)" :class="$style.bandHelpIcon"><i class="ti ti-help-circle"></i></span>
						</div>
						<div :class="$style.msgTable">
							<template v-for="(row, ridx) in block.rows" :key="row.kind === 'msg' ? row.m.id : `omit-${block.band}-${ridx}`">
								<div
									v-if="row.kind === 'msg'"
									:class="$style.msgRow"
									:data-band="block.band"
									role="button"
									tabindex="0"
									@click="emit('jumpToMessage', row.m.id)"
									@keydown.enter.prevent="emit('jumpToMessage', row.m.id)"
									@keydown.space.prevent="emit('jumpToMessage', row.m.id)"
								>
									<div :class="$style.msgRowTop">
										<span :class="[$style.msgRolePill, row.m.role === 'user' ? $style.msgRoleUser : $style.msgRoleAsst]">{{ roleLabel(row.m.role) }}</span>
										<span v-if="row.m.compressed" :class="$style.msgBadgeCompressed">{{ i18n.ts._agents.compressionMessageCompressed }}</span>
									</div>
									<div :class="$style.msgPreview">{{ plainPreview(row.m.contentPreview) }}</div>
									<div :class="$style.msgTokenMeta">{{ tokensLabel(row.m) }}</div>
								</div>
								<div v-else :class="$style.msgOmitRow">
									<span :class="$style.omitDots">···</span>
									<span :class="$style.omitHint">{{ i18n.tsx._agents.compressionBandOmitted({ n: String(row.hidden) }) }}</span>
								</div>
							</template>
						</div>
					</div>
				</div>
			</Transition>
		</section>
	</template>

	<!-- 加载失败 -->
	<div v-else-if="!loading" :class="$style.loadFailed">
		<i class="ti ti-cloud-off" :class="$style.loadFailedIcon"></i>
		<p :class="$style.loadFailedText">{{ i18n.ts._agents.compressionOverviewLoadFailed }}</p>
		<MkButton rounded small @click="() => { void refresh(); }">
			<i class="ti ti-refresh"></i> {{ i18n.ts._agents.compressionOverviewRetry }}
		</MkButton>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkButton from '@/components/MkButton.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { prefer } from '@/preferences.js';

export type CompressionOverviewPayload = {
	historyBudgetTokens: number;
	t1Tokens: number;
	t2Tokens: number;
	t1Ratio: number;
	t2Ratio: number;
	tokenMode?: 'exact' | 'approx' | 'estimate';
	messages: { id: string; role: string; messageTokens?: number; dFromNewTokens: number; band: string; contentPreview: string; tokensEstimated?: boolean; compressed: boolean }[];
	stickies: {
		id: string;
		createdAt: string;
		updatedAt: string;
		fromMessageId: string;
		toMessageId: string;
		fromMessagePreview?: string;
		toMessagePreview?: string;
		summaryText: string;
		state: string;
		userOverridden: boolean;
		sourceFingerprint: string | null;
		errorMessage: string | null;
		lastModelId: string | null;
		sortIndex: number;
	}[];
	/** 最近一次压缩侧车失败时间（ISO）；失败便签不在 stickies 列表，轮询据此弹失败提示 */
	compressionSidecarFailedAt?: string | null;
};

const props = defineProps<{
	sessionId: string;
	memProviderDirty: boolean;
	moderationLocked: boolean;
}>();

const emit = defineEmits<{
	(ev: 'jumpToMessage', id: string): void;
}>();

// --- State ---
const overview = ref<CompressionOverviewPayload | null>(null);
const loading = ref(false);
const bandsOpen = ref(false);
const editingId = ref<string | null>(null);
const editingText = ref('');
const mutating = ref(false);
const expandedRangeId = ref<string | null>(null);
/** 便签区默认折叠（与旧版 MkFolder defaultOpen=false 一致），避免长摘要使页面臃肿 */
const stickiesOpen = ref(false);

// 挂载时自行加载（父组件 watch 为 pre-flush，触发时本组件可能尚未挂载，ref 为 null）
onMounted(() => {
	void refresh();
});

// --- Data loading ---
async function refresh() {
	loading.value = true;
	try {
		overview.value = await misskeyApi(
			'agents/sessions/compression-overview' as Parameters<typeof misskeyApi>[0],
			{ sessionId: props.sessionId } as any,
		) as CompressionOverviewPayload;
	} catch {
		overview.value = null;
	} finally {
		loading.value = false;
	}
}

/** 供父组件推送轮询结果 */
function setOverview(ov: CompressionOverviewPayload) {
	overview.value = ov;
}

defineExpose({ refresh, setOverview, overview });

// --- Computed ---
const hasProcessingSticky = computed(() => {
	if (!overview.value) return false;
	// failed 为终态（压缩失败），不属于「处理中」，避免误显示旋转提示
	return overview.value.stickies.some(s => s.state !== 'active' && s.state !== 'dormant' && s.state !== 'failed');
});

type BandRow =
	| { kind: 'msg'; m: CompressionOverviewPayload['messages'][0] }
	| { kind: 'ellipsis'; hidden: number };

const EDGE_COUNT = 4;

const bandBlocks = computed((): { band: string; title: string; count: string; rows: BandRow[] }[] => {
	const o = overview.value;
	if (o == null) return [];
	const order = ['new', 'prep', 'staged', 'out'] as const;
	const by: Record<string, typeof o.messages> = { new: [], prep: [], staged: [], out: [] };
	for (const m of o.messages) {
		if (m.band in by) by[m.band]!.push(m);
	}
	const fullMax = EDGE_COUNT * 2;
	const blocks: { band: string; title: string; count: string; rows: BandRow[] }[] = [];
	for (const band of order) {
		const list = by[band] ?? [];
		if (list.length === 0) continue;
		const title = bandGroupTitle(band);
		const totalTokens = list.reduce((s, m) => s + (m.messageTokens ?? 0), 0);
		const approx = o.tokenMode !== 'exact' ? '≈' : '';
		const count = `${list.length} · ${approx}${totalTokens}`;
		const rows: BandRow[] = [];
		if (list.length <= fullMax) {
			for (const m of list) rows.push({ kind: 'msg', m });
		} else {
			for (const m of list.slice(0, EDGE_COUNT)) rows.push({ kind: 'msg', m });
			rows.push({ kind: 'ellipsis', hidden: list.length - fullMax });
			for (const m of list.slice(list.length - EDGE_COUNT)) rows.push({ kind: 'msg', m });
		}
		blocks.push({ band, title, count, rows });
	}
	return blocks;
});

const bandProgress = computed((): { band: string; title: string; count: number; ratio: number }[] => {
	const o = overview.value;
	if (o == null || o.messages.length === 0) return [];
	const order = ['new', 'prep', 'staged', 'out'] as const;
	const counts: Record<string, number> = { new: 0, prep: 0, staged: 0, out: 0 };
	for (const m of o.messages) {
		if (m.band in counts) counts[m.band]!++;
	}
	const total = o.messages.length;
	if (total === 0) return [];
	return order
		.filter(b => counts[b]! > 0)
		.map(b => ({ band: b, title: bandGroupTitle(b), count: counts[b]!, ratio: counts[b]! / total }));
});

const scaleCaption = computed((): string => {
	const o = overview.value;
	if (o == null || o.historyBudgetTokens === 0) return '';
	const approx = o.tokenMode !== 'exact' ? '≈' : '';
	return i18n.tsx._agents.compressionBandScaleCaption({
		h: `${approx}${Math.round(o.historyBudgetTokens)}`,
		t1: `${approx}${Math.round(o.t1Tokens)}`,
		t2: `${approx}${Math.round(o.t2Tokens)}`,
	});
});

// --- Helpers ---
function bandGroupTitle(band: string): string {
	if (band === 'new') return i18n.ts._agents.compressionBandNew;
	if (band === 'prep') return i18n.ts._agents.compressionBandPrep;
	if (band === 'staged') return i18n.ts._agents.compressionBandStaged;
	if (band === 'out') return i18n.ts._agents.compressionBandOut;
	return band;
}

function bandTooltip(band: string): string {
	if (band === 'new') return i18n.ts._agents.compressionBandTooltipNew;
	if (band === 'prep') return i18n.ts._agents.compressionBandTooltipPrep;
	if (band === 'staged') return i18n.ts._agents.compressionBandTooltipStaged;
	if (band === 'out') return i18n.ts._agents.compressionBandTooltipOut;
	return '';
}

function compressionStateLabel(state: string): string {
	if (state === 'active') return i18n.ts._agents.compressionStateActive;
	if (state === 'dormant') return i18n.ts._agents.compressionStateDormant;
	if (state === 'failed') return i18n.ts._agents.compressionStateFailed;
	return i18n.ts._agents.compressionStateOther;
}

function roleLabel(role: string): string {
	if (role === 'user') return i18n.ts._agents.compressionMessageRoleUser;
	if (role === 'assistant' || role === 'model') return i18n.ts._agents.compressionMessageRoleAssistant;
	return role;
}

/** 后端 contentPreview 已经 agentPreviewText 过滤 MD/MFM/XML，前端仅做安全截断 */
function plainPreview(raw: string | null | undefined): string {
	if (raw == null || raw === '') return '…';
	const t = raw.replace(/\s+/g, ' ').trim();
	if (t.length === 0) return '…';
	return t.length <= 168 ? t : `${t.slice(0, 168)}…`;
}

function tokensLabel(m: CompressionOverviewPayload['messages'][0]): string {
	const cum = m.dFromNewTokens;
	const raw = m.messageTokens;
	const msg = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : null;
	// approx（兼容近似）与 estimate（字符估算）均标注 ≈；exact 下仅对计数器回退估算的条目标注
	const estimated = overview.value?.tokenMode !== 'exact' || (m.tokensEstimated ?? false);
	const approx = estimated ? '≈' : '';
	if (msg != null) {
		return `${approx}${msg} / ${approx}${Math.max(0, Math.round(cum))}`;
	}
	return `${approx}${Math.max(0, Math.round(cum))}`;
}

function errorText(raw: string | null | undefined): string {
	if (raw == null || raw === '') return '';
	if (raw === 'COMPRESSION_LLM_FAILED') return i18n.ts._agents.compressionStickyLlmFailedStored;
	return raw;
}

// --- Sticky operations ---
function startEdit(st: { id: string; summaryText: string }) {
	editingId.value = st.id;
	editingText.value = st.summaryText;
}

function cancelEdit() {
	editingId.value = null;
	editingText.value = '';
}

async function submitEdit(stickyId: string) {
	if (mutating.value || props.moderationLocked) return;
	const t = editingText.value.trim();
	if (t.length === 0) return;
	mutating.value = true;
	try {
		await misskeyApi(
			'agents/compression-sticky/update' as Parameters<typeof misskeyApi>[0],
			{ sessionId: props.sessionId, stickyId, summaryText: t } as any,
		);
		os.toast(i18n.ts._agents.compressionStickyUpdated);
		cancelEdit();
		await refresh();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		mutating.value = false;
	}
}

async function confirmDelete(stickyId: string) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts._agents.compressionStickyDeleteConfirm,
	});
	if (canceled) return;
	if (mutating.value || props.moderationLocked) return;
	mutating.value = true;
	try {
		await misskeyApi(
			'agents/compression-sticky/delete' as Parameters<typeof misskeyApi>[0],
			{ sessionId: props.sessionId, stickyId } as any,
		);
		os.toast(i18n.ts._agents.compressionStickyDeleted);
		if (editingId.value === stickyId) cancelEdit();
		await refresh();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		mutating.value = false;
	}
}

async function moveSticky(stickyId: string, delta: -1 | 1) {
	if (!overview.value || mutating.value || props.moderationLocked) return;
	const list = overview.value.stickies;
	const i = list.findIndex(s => s.id === stickyId);
	if (i < 0) return;
	const j = i + delta;
	if (j < 0 || j >= list.length) return;
	const next = [...list];
	const t = next[i]!;
	next[i] = next[j]!;
	next[j] = t;
	const stickyIds = next.map(s => s.id);
	mutating.value = true;
	try {
		await misskeyApi(
			'agents/compression-sticky/reorder' as Parameters<typeof misskeyApi>[0],
			{ sessionId: props.sessionId, stickyIds } as any,
		);
		await refresh();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		mutating.value = false;
	}
}
</script>

<style module lang="scss">
.root {
	display: flex;
	flex-direction: column;
	gap: 1em;
}

// --- Processing hint ---
.processingHint {
	display: flex;
	align-items: center;
	gap: 0.5em;
	padding: 0.55em 0.85em;
	font-size: 0.88em;
	border-radius: 8px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 22%, var(--MI_THEME-divider));
	background: color-mix(in srgb, var(--MI_THEME-accent) 8%, var(--MI_THEME-panel));
	color: var(--MI_THEME-accent);
}
.processingIcon {
	flex-shrink: 0;
	animation: spin 0.85s linear infinite;
}
@keyframes spin {
	to { transform: rotate(360deg); }
}

// --- Section header ---
.stickySection {
	display: flex;
	flex-direction: column;
	gap: 0.4em;
}
.sectionHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75em;
}
.sectionTitleToggle {
	display: flex;
	align-items: center;
	gap: 0.45em;
	min-width: 0;
	font: inherit;
	color: inherit;
	cursor: pointer;
	text-align: start;
}
.sectionChevron {
	flex-shrink: 0;
	font-size: 1em;
	opacity: 0.72;
}
.stickyBody {
	display: flex;
	flex-direction: column;
	gap: 0.4em;
}
.sectionIcon {
	font-size: 1.1em;
	color: var(--MI_THEME-accent);
}
.sectionTitle {
	font-weight: 700;
	font-size: 1em;
}
.countBadge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 1.5em;
	height: 1.5em;
	padding: 0 0.4em;
	border-radius: 999px;
	font-size: 0.78em;
	font-weight: 700;
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, var(--MI_THEME-panel));
	color: var(--MI_THEME-accent);
}
.refreshBtn {
	padding: 0.35em;
	border-radius: 6px;
	color: var(--MI_THEME-fgTransparentWeak);
	transition: color 0.12s ease;
	@media (hover: hover) {
		&:hover { color: var(--MI_THEME-accent); }
	}
}
.sectionCaption {
	margin: 0;
	font-size: 0.82em;
	line-height: 1.45;
	color: var(--MI_THEME-fgTransparentWeak);
}

// --- Empty state ---
.emptyState {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.6em;
	padding: 1.8em 1em;
	border-radius: 12px;
	border: dashed 1px color-mix(in srgb, var(--MI_THEME-divider) 80%, transparent);
	background: color-mix(in srgb, var(--MI_THEME-fg) 1.5%, var(--MI_THEME-panel));
}
.emptyIcon {
	font-size: 2em;
	color: color-mix(in srgb, var(--MI_THEME-fg) 25%, var(--MI_THEME-panel));
}
.emptyText {
	margin: 0;
	font-size: 0.88em;
	line-height: 1.5;
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: center;
	max-width: 28em;
}

// --- Sticky list ---
.stickyList {
	display: flex;
	flex-direction: column;
	gap: 0.5em;
}
.stickyCard {
	padding: 0.7em 0.8em 0.65em;
	border-radius: 12px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	box-shadow: 0 1px 2px color-mix(in srgb, var(--MI_THEME-fg) 2.5%, transparent);
	transition: border-color 0.12s ease, box-shadow 0.12s ease;
	@media (hover: hover) {
		&:hover {
			border-color: color-mix(in srgb, var(--MI_THEME-accent) 20%, var(--MI_THEME-divider));
			box-shadow: 0 2px 6px color-mix(in srgb, var(--MI_THEME-fg) 4%, transparent);
			.stickyActions { opacity: 1; }
		}
	}
	&:focus-within {
		.stickyActions { opacity: 1; }
	}
}
.stickyHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5em;
	margin-bottom: 0.4em;
}
.stickyHeadLeft {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 0.35em 0.5em;
}
.stickyHeadRight {
	display: flex;
	align-items: center;
	gap: 0.15em;
	flex-shrink: 0;
}
.sortBtn {
	padding: 0.2em 0.35em;
	border-radius: 5px;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
	transition: color 0.1s ease;
	&:disabled { opacity: 0.3; cursor: default; }
	@media (hover: hover) {
		&:hover:not(:disabled) { color: var(--MI_THEME-accent); }
	}
}
.statePill {
	display: inline-flex;
	align-items: center;
	font-size: 0.75em;
	font-weight: 700;
	padding: 0.25em 0.55em;
	border-radius: 999px;
	letter-spacing: 0.02em;
	background: color-mix(in srgb, var(--MI_THEME-fg) 6%, var(--MI_THEME-buttonBg));
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 55%, transparent);
	&[data-state="dormant"] {
		color: var(--MI_THEME-fg);
		background: color-mix(in srgb, var(--MI_THEME-fg) 5%, var(--MI_THEME-panel));
		border-color: color-mix(in srgb, var(--MI_THEME-divider) 70%, transparent);
	}
	&[data-state="active"] {
		color: var(--MI_THEME-success, #16a34a);
		background: color-mix(in srgb, var(--MI_THEME-success) 18%, var(--MI_THEME-panel));
		border-color: color-mix(in srgb, var(--MI_THEME-success) 32%, var(--MI_THEME-divider));
	}
	&[data-state="failed"] {
		color: var(--MI_THEME-error);
		background: color-mix(in srgb, var(--MI_THEME-error) 14%, var(--MI_THEME-panel));
		border-color: color-mix(in srgb, var(--MI_THEME-error) 32%, var(--MI_THEME-divider));
	}
	&:not([data-state="active"]):not([data-state="dormant"]):not([data-state="failed"]) {
		color: var(--MI_THEME-accent);
		background: color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-panel));
		border-color: color-mix(in srgb, var(--MI_THEME-accent) 28%, var(--MI_THEME-divider));
		animation: pulse 1.6s ease-in-out infinite;
	}
}
@keyframes pulse {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.6; }
}
.userTag {
	font-size: 0.72em;
	font-weight: 600;
	opacity: 0.82;
	padding: 0.2em 0.45em;
	border-radius: 6px;
	background: color-mix(in srgb, var(--MI_THEME-accent) 10%, var(--MI_THEME-panel));
}
.stickySummary {
	white-space: pre-wrap;
	word-break: break-word;
	font-size: 0.95em;
	line-height: 1.5;
	margin: 0.1em 0 0.4em;
}
.rangeRow {
	margin-bottom: 0.4em;
}
.rangeToggle {
	display: inline-flex;
	align-items: center;
	gap: 0.45em;
	padding: 0.32em 0.8em;
	border-radius: 999px;
	font: inherit;
	font-size: 0.82em;
	font-weight: 600;
	color: var(--MI_THEME-fgTransparentWeak);
	cursor: pointer;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 70%, transparent);
	background: color-mix(in srgb, var(--MI_THEME-fg) 2.5%, var(--MI_THEME-panel));
	transition: color 0.12s ease, border-color 0.12s ease, background 0.12s ease;
	@media (hover: hover) {
		&:hover {
			color: var(--MI_THEME-accent);
			border-color: color-mix(in srgb, var(--MI_THEME-accent) 35%, var(--MI_THEME-divider));
			background: color-mix(in srgb, var(--MI_THEME-accent) 6%, var(--MI_THEME-panel));
		}
	}
}
.rangeToggleIcon {
	color: var(--MI_THEME-accent);
	opacity: 0.85;
}
.rangeToggleChevron {
	font-size: 0.85em;
	opacity: 0.6;
}
.rangeExpanded {
	display: flex;
	flex-direction: column;
	gap: 0.45em;
	padding: 0.5em 0.55em;
	border-radius: 10px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 65%, transparent);
	background: color-mix(in srgb, var(--MI_THEME-fg) 2%, var(--MI_THEME-panel));
}
.rangeChips {
	display: flex;
	flex-wrap: wrap;
	align-items: stretch;
	gap: 0.4em 0.5em;
}
.rangeCollapseBtn {
	display: inline-flex;
	align-items: center;
	gap: 0.3em;
	align-self: flex-end;
	padding: 0.22em 0.65em;
	border-radius: 999px;
	font: inherit;
	font-size: 0.78em;
	font-weight: 600;
	color: var(--MI_THEME-fgTransparentWeak);
	cursor: pointer;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 60%, transparent);
	background: transparent;
	transition: color 0.12s ease, border-color 0.12s ease;
	@media (hover: hover) {
		&:hover {
			color: var(--MI_THEME-accent);
			border-color: color-mix(in srgb, var(--MI_THEME-accent) 35%, var(--MI_THEME-divider));
		}
	}
}
.rangeChip {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 0.12em;
	flex: 1 1 0;
	min-width: min(100%, 9rem);
	padding: 0.35em 0.5em;
	border-radius: 8px;
	text-align: start;
	font: inherit;
	font-size: 0.88em;
	color: inherit;
	cursor: pointer;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 78%, transparent);
	background: var(--MI_THEME-panel);
	transition: background 0.12s ease, border-color 0.12s ease;
	@media (hover: hover) {
		&:hover {
			background: color-mix(in srgb, var(--MI_THEME-accent) 8%, var(--MI_THEME-panel));
			border-color: color-mix(in srgb, var(--MI_THEME-accent) 30%, var(--MI_THEME-divider));
		}
	}
}
.rangeLabel {
	font-size: 0.65em;
	font-weight: 700;
	opacity: 0.68;
	letter-spacing: 0.02em;
}
.rangeText {
	font-size: 0.88em;
	line-height: 1.38;
	width: 100%;
	overflow: hidden;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	word-break: break-word;
}
.rangeArrow {
	align-self: center;
	color: var(--MI_THEME-fgTransparentWeak);
	opacity: 0.7;
	font-size: 0.9em;
	user-select: none;
}
.errorBlock {
	display: flex;
	align-items: flex-start;
	gap: 0.4em;
	padding: 0.4em 0.6em;
	margin-bottom: 0.35em;
	border-radius: 8px;
	border-left: solid 3px var(--MI_THEME-error);
	background: color-mix(in srgb, var(--MI_THEME-error) 6%, var(--MI_THEME-panel));
}
.errorText {
	font-size: 0.85em;
	line-height: 1.4;
	color: var(--MI_THEME-error);
}
.stickyActions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.35em;
	justify-content: flex-end;
	margin-top: 0.35em;
	opacity: 0;
	transition: opacity 0.15s ease;
	// 触屏设备始终显示
	@media (hover: none) {
		opacity: 1;
	}
}
.editActions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.35em;
	justify-content: flex-end;
	margin-top: 0.35em;
}

// --- Bands section ---
.bandsSection {
	border-radius: 12px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 88%, transparent);
	background: var(--MI_THEME-panel);
	overflow: hidden;
}
.bandsHeader {
	display: flex;
	align-items: center;
	gap: 0.45em;
	width: 100%;
	padding: 0.6em 0.75em;
	margin: 0;
	border: none;
	background: color-mix(in srgb, var(--MI_THEME-fg) 1.8%, var(--MI_THEME-panel));
	font: inherit;
	color: inherit;
	cursor: pointer;
	text-align: start;
	@media (hover: hover) {
		&:hover { background: color-mix(in srgb, var(--MI_THEME-fg) 2.8%, var(--MI_THEME-panel)); }
	}
}
.bandsChevron {
	flex-shrink: 0;
	font-size: 1.05em;
	opacity: 0.72;
}
.bandsTitleBlock {
	display: flex;
	flex-direction: column;
	gap: 0.1em;
	min-width: 0;
	flex: 1;
}
.bandsTitle {
	font-weight: 700;
	font-size: 0.95em;
	line-height: 1.25;
}
.bandsSubtitle {
	font-size: 0.76em;
	font-weight: 500;
	line-height: 1.35;
	color: var(--MI_THEME-fgTransparentWeak);
}
.infoIcon {
	flex-shrink: 0;
	font-size: 0.95em;
	color: var(--MI_THEME-fgTransparentWeak);
	cursor: help;
}
.bandProgress {
	display: flex;
	height: 6px;
	border-radius: 3px;
	overflow: hidden;
	margin: 0.5em 0.75em 0.35em;
	background: color-mix(in srgb, var(--MI_THEME-fg) 5%, var(--MI_THEME-panel));
}
.bandProgressSeg {
	height: 100%;
	min-width: 3px;
	transition: flex-grow 0.3s ease;
	&[data-band="new"] { background: var(--MI_THEME-accent); }
	&[data-band="prep"] { background: color-mix(in srgb, var(--MI_THEME-accent) 60%, var(--MI_THEME-panel)); }
	&[data-band="staged"] { background: var(--MI_THEME-warn, #c27803); }
	&[data-band="out"] { background: color-mix(in srgb, var(--MI_THEME-fg) 20%, var(--MI_THEME-panel)); }
}
.scaleCaption {
	padding: 0.3em 0.75em 0.4em;
	font-size: 0.78em;
	line-height: 1.42;
	color: var(--MI_THEME-fgTransparentWeak);
}
.bandGroups {
	padding: 0.4em 0.5em 0.55em;
	display: flex;
	flex-direction: column;
	gap: 0.65em;
}
.bandGroup {
	display: flex;
	flex-direction: column;
	gap: 0.28em;
}
.bandGroupTitle {
	display: flex;
	align-items: center;
	gap: 0.4em;
	padding: 0.15em 0.1em 0.2em;
}
.bandGroupLabel {
	font-size: 0.78em;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--MI_THEME-fgTransparentWeak);
	&[data-band="new"] { color: var(--MI_THEME-accent); }
	&[data-band="staged"] { color: var(--MI_THEME-warn, #c27803); }
}
.bandGroupCount {
	font-size: 0.72em;
	font-weight: 600;
	color: var(--MI_THEME-fgTransparentWeak);
	opacity: 0.8;
	font-variant-numeric: tabular-nums;
}
.bandHelpIcon {
	font-size: 0.8em;
	color: var(--MI_THEME-fgTransparentWeak);
	cursor: help;
	opacity: 0.7;
}
.msgTable {
	display: flex;
	flex-direction: column;
	border-radius: 8px;
	overflow: hidden;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 50%, transparent);
}
.msgRow {
	padding: 0.6em 0.7em;
	min-height: 2.9em;
	cursor: pointer;
	text-align: start;
	color: inherit;
	background: color-mix(in srgb, var(--MI_THEME-fg) 1.2%, var(--MI_THEME-bg));
	border-left: solid 3px transparent;
	border-bottom: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 45%, transparent);
	transition: background 0.1s ease, border-color 0.1s ease;
	&:last-child { border-bottom: none; }
	&[data-band="new"] { border-left-color: color-mix(in srgb, var(--MI_THEME-accent) 55%, transparent); }
	&[data-band="prep"] { border-left-color: color-mix(in srgb, var(--MI_THEME-accent) 30%, transparent); }
	&[data-band="staged"] { border-left-color: color-mix(in srgb, var(--MI_THEME-warn, #c27803) 45%, transparent); }
	&[data-band="out"] { border-left-color: color-mix(in srgb, var(--MI_THEME-fg) 15%, transparent); }
	@media (hover: hover) {
		&:hover {
			background: color-mix(in srgb, var(--MI_THEME-fg) 3.5%, var(--MI_THEME-panel));
		}
	}
	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus, var(--MI_THEME-accent));
		outline-offset: -1px;
	}
}
.msgRowTop {
	display: flex;
	align-items: center;
	gap: 0.45em 0.6em;
	flex-wrap: wrap;
	margin-bottom: 0.28em;
}
.msgRolePill {
	font-size: 0.8em;
	font-weight: 800;
	padding: 0.15em 0.5em;
	border-radius: 999px;
}
.msgRoleUser {
	background: color-mix(in srgb, var(--MI_THEME-accent) 20%, var(--MI_THEME-panel));
	color: var(--MI_THEME-accent);
}
.msgRoleAsst {
	background: color-mix(in srgb, var(--MI_THEME-fg) 9%, var(--MI_THEME-panel));
}
.msgBadgeCompressed {
	font-size: 0.78em;
	font-weight: 700;
	color: var(--MI_THEME-warn, #c27803);
}
.msgPreview {
	font-size: 0.95em;
	line-height: 1.5;
	color: var(--MI_THEME-fg);
	opacity: 0.95;
}
.msgTokenMeta {
	display: block;
	font-size: 0.8em;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fgTransparentWeak);
	margin-top: 0.35em;
	letter-spacing: 0.01em;
}
.msgOmitRow {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.5em;
	padding: 0.5em;
	font-size: 0.85em;
	color: var(--MI_THEME-fg);
	opacity: 0.6;
	font-weight: 600;
	border-bottom: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 40%, transparent);
}
.omitDots {
	letter-spacing: 0.12em;
	font-weight: 700;
}
.omitHint {
	font-size: 0.9em;
}

// --- Load failed ---
.loadFailed {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.6em;
	padding: 1.8em 1em;
	border-radius: 12px;
	border: dashed 1px color-mix(in srgb, var(--MI_THEME-error) 35%, var(--MI_THEME-divider));
	background: color-mix(in srgb, var(--MI_THEME-error) 4%, var(--MI_THEME-panel));
}
.loadFailedIcon {
	font-size: 2em;
	color: color-mix(in srgb, var(--MI_THEME-error) 55%, var(--MI_THEME-panel));
}
.loadFailedText {
	margin: 0;
	font-size: 0.88em;
	line-height: 1.5;
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: center;
}

// --- TransitionGroup animations ---
:global(.sticky-list-enter-active) {
	transition: all 0.2s ease-out;
}
:global(.sticky-list-leave-active) {
	transition: all 0.15s ease-in;
}
:global(.sticky-list-enter-from) {
	opacity: 0;
	transform: translateY(-8px);
}
:global(.sticky-list-leave-to) {
	opacity: 0;
	transform: translateY(8px);
}
:global(.sticky-list-move) {
	transition: transform 0.2s ease;
}
:global(.bands-toggle-enter-active) {
	transition: all 0.2s ease-out;
}
:global(.bands-toggle-leave-active) {
	transition: all 0.15s ease-in;
}
:global(.bands-toggle-enter-from),
:global(.bands-toggle-leave-to) {
	opacity: 0;
	transform: translateY(-4px);
}
</style>
