<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section :class="$style.bandsCard">
	<header :class="$style.bandsHead">
		<button type="button" class="_button" :class="$style.bandsToggle" :aria-expanded="bandsOpen" @click="bandsOpen = !bandsOpen">
			<i :class="['ti', bandsOpen ? 'ti-chevron-up' : 'ti-chevron-down', $style.bandsChevron]" aria-hidden="true"></i>
			<i class="ti ti-stack-2" :class="$style.bandsHeadIcon" aria-hidden="true"></i>
			<span :class="$style.bandsTitleBlock">
				<span :class="$style.bandsTitle">{{ i18n.ts._agents.compressionMessageBands }}</span>
				<span :class="$style.bandsSubtitle">{{ i18n.ts._agents.compressionMessageBandsSubtitle }}</span>
			</span>
		</button>
		<span v-tooltip="i18n.ts._agents.compressionTokensApproxTooltip" :class="$style.infoIcon"><i class="ti ti-info-circle"></i></span>
		<button type="button" class="_button" :class="$style.refreshBtn" :disabled="loading" :title="i18n.ts.reload" @click="() => { void refresh(); }">
			<i class="ti ti-refresh"></i>
		</button>
	</header>

	<Transition :name="prefer.s.animation ? 'bands-toggle' : ''">
		<div v-show="bandsOpen" :class="$style.bandsBody">
			<div v-if="loading && overview == null" :class="$style.bandsLoading">
				<MkLoading/>
			</div>
			<template v-else-if="overview">
				<template v-if="overview.messages.length > 0">
					<!-- 区带进度条 -->
					<div v-if="bandProgress.length > 0" :class="$style.bandProgress">
						<div
							v-for="seg in bandProgress"
							:key="seg.band"
							:class="$style.bandProgressSeg"
							:data-band="seg.band"
							:style="{ flexGrow: seg.ratio }"
							:title="`${seg.title}: ${seg.count}`"
						></div>
					</div>

					<!-- 刻度说明 -->
					<div v-if="scaleCaption" :class="$style.scaleCaption">{{ scaleCaption }}</div>

					<div :class="$style.bandGroups">
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
				</template>
				<div v-else :class="$style.bandsEmpty">{{ i18n.ts._agents.compressionMessageBandsEmpty }}</div>
			</template>

			<!-- 加载失败 -->
			<div v-else :class="$style.loadFailed">
				<i class="ti ti-cloud-off" :class="$style.loadFailedIcon"></i>
				<p :class="$style.loadFailedText">{{ i18n.ts._agents.compressionOverviewLoadFailed }}</p>
				<MkButton rounded small @click="() => { void refresh(); }">
					<i class="ti ti-refresh"></i> {{ i18n.ts._agents.compressionOverviewRetry }}
				</MkButton>
			</div>
		</div>
	</Transition>

	<!-- 定位上下文边界 -->
	<div :class="$style.locateRow">
		<span :class="$style.locateText">
			<i class="ti ti-scissors" :class="$style.locateIcon"></i>
			<span>{{ i18n.ts._agents.sessionMemoryContextDividerDesc }}</span>
		</span>
		<MkButton
			v-tooltip="locateTooltip"
			rounded
			small
			:disabled="!canLocateDivider"
			@click="emit('locateDivider')"
		>
			<i class="ti ti-focus-2"></i>
			{{ i18n.ts._agents.sessionMemoryLocateContextDivider }}
		</MkButton>
	</div>
</section>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import type { CompressionOverviewPayload } from './agent-session.compression.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkButton from '@/components/MkButton.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	sessionId: string;
	/** true = 便签记忆：四区带（窗口/排队较前/排队较后/窗外）；false = 仅按上下文窗口分「窗口内/窗口外」两组 */
	detailed: boolean;
	canLocateDivider: boolean;
	locateTooltip?: string;
}>();

const emit = defineEmits<{
	(ev: 'jumpToMessage', id: string): void;
	(ev: 'locateDivider'): void;
}>();

// --- State ---
const overview = ref<CompressionOverviewPayload | null>(null);
const loading = ref(false);
// 简单模式下分段是本 tab 的主要内容，默认展开；便签模式下默认折叠避免页面臃肿
const bandsOpen = ref(!props.detailed);

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
type BandRow =
	| { kind: 'msg'; m: CompressionOverviewPayload['messages'][0] }
	| { kind: 'ellipsis'; hidden: number };

const EDGE_COUNT = 4;

function buildBlock(band: string, list: CompressionOverviewPayload['messages'], tokenMode: CompressionOverviewPayload['tokenMode']): { band: string; title: string; count: string; rows: BandRow[] } {
	const totalTokens = list.reduce((s, m) => s + (m.messageTokens ?? 0), 0);
	const approx = tokenMode !== 'exact' ? '≈' : '';
	const count = `${list.length} · ${approx}${totalTokens}`;
	const fullMax = EDGE_COUNT * 2;
	const rows: BandRow[] = [];
	if (list.length <= fullMax) {
		for (const m of list) rows.push({ kind: 'msg', m });
	} else {
		for (const m of list.slice(0, EDGE_COUNT)) rows.push({ kind: 'msg', m });
		rows.push({ kind: 'ellipsis', hidden: list.length - fullMax });
		for (const m of list.slice(list.length - EDGE_COUNT)) rows.push({ kind: 'msg', m });
	}
	return { band, title: bandGroupTitle(band), count, rows };
}

const bandBlocks = computed((): { band: string; title: string; count: string; rows: BandRow[] }[] => {
	const o = overview.value;
	if (o == null) return [];
	if (props.detailed) {
		const order = ['new', 'prep', 'staged', 'out'] as const;
		const by: Record<string, typeof o.messages> = { new: [], prep: [], staged: [], out: [] };
		for (const m of o.messages) {
			if (m.band in by) by[m.band]!.push(m);
		}
		return order
			.filter(band => (by[band]?.length ?? 0) > 0)
			.map(band => buildBlock(band, by[band]!, o.tokenMode));
	}
	// 简单模式：仅按上下文窗口分两组（窗口内 = new+prep+staged，窗口外 = out）
	const inList = o.messages.filter(m => m.band !== 'out');
	const outList = o.messages.filter(m => m.band === 'out');
	const blocks: { band: string; title: string; count: string; rows: BandRow[] }[] = [];
	if (inList.length > 0) blocks.push(buildBlock('in', inList, o.tokenMode));
	if (outList.length > 0) blocks.push(buildBlock('out', outList, o.tokenMode));
	return blocks;
});

const bandProgress = computed((): { band: string; title: string; count: number; ratio: number }[] => {
	const o = overview.value;
	if (o == null || o.messages.length === 0) return [];
	const total = o.messages.length;
	if (props.detailed) {
		const order = ['new', 'prep', 'staged', 'out'] as const;
		const counts: Record<string, number> = { new: 0, prep: 0, staged: 0, out: 0 };
		for (const m of o.messages) {
			if (m.band in counts) counts[m.band]!++;
		}
		return order
			.filter(b => counts[b]! > 0)
			.map(b => ({ band: b, title: bandGroupTitle(b), count: counts[b]!, ratio: counts[b]! / total }));
	}
	const inCount = o.messages.filter(m => m.band !== 'out').length;
	const outCount = total - inCount;
	const segs: { band: string; title: string; count: number; ratio: number }[] = [];
	if (inCount > 0) segs.push({ band: 'in', title: bandGroupTitle('in'), count: inCount, ratio: inCount / total });
	if (outCount > 0) segs.push({ band: 'out', title: bandGroupTitle('out'), count: outCount, ratio: outCount / total });
	return segs;
});

const scaleCaption = computed((): string => {
	const o = overview.value;
	if (o == null || o.historyBudgetTokens === 0) return '';
	const approx = o.tokenMode !== 'exact' ? '≈' : '';
	if (!props.detailed) {
		return i18n.tsx._agents.compressionBandScaleCaptionSimple({
			h: `${approx}${Math.round(o.historyBudgetTokens)}`,
		});
	}
	return i18n.tsx._agents.compressionBandScaleCaption({
		h: `${approx}${Math.round(o.historyBudgetTokens)}`,
		t1: `${approx}${Math.round(o.t1Tokens)}`,
		t2: `${approx}${Math.round(o.t2Tokens)}`,
	});
});

// --- Helpers ---
function bandGroupTitle(band: string): string {
	if (band === 'in') return i18n.ts._agents.compressionBandInWindow;
	if (band === 'new') return i18n.ts._agents.compressionBandNew;
	if (band === 'prep') return i18n.ts._agents.compressionBandPrep;
	if (band === 'staged') return i18n.ts._agents.compressionBandStaged;
	if (band === 'out') return i18n.ts._agents.compressionBandOut;
	return band;
}

function bandTooltip(band: string): string {
	if (band === 'in') return i18n.ts._agents.compressionBandTooltipNew;
	if (band === 'new') return i18n.ts._agents.compressionBandTooltipNew;
	if (band === 'prep') return i18n.ts._agents.compressionBandTooltipPrep;
	if (band === 'staged') return i18n.ts._agents.compressionBandTooltipStaged;
	if (band === 'out') return i18n.ts._agents.compressionBandTooltipOut;
	return '';
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
</script>

<style module lang="scss">
.bandsCard {
	border-radius: 12px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	overflow: hidden;
}

// --- Header ---
.bandsHead {
	display: flex;
	align-items: center;
	gap: 0.45em;
	padding: 0.6em 0.75em;
	background: color-mix(in srgb, var(--MI_THEME-fg) 1.8%, var(--MI_THEME-panel));
	border-bottom: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 55%, transparent);
}
.bandsToggle {
	display: flex;
	align-items: center;
	gap: 0.45em;
	flex: 1;
	min-width: 0;
	font: inherit;
	color: inherit;
	cursor: pointer;
	text-align: start;
	border-radius: 6px;
}
.bandsChevron {
	flex-shrink: 0;
	font-size: 1.05em;
	opacity: 0.72;
}
.bandsHeadIcon {
	flex-shrink: 0;
	font-size: 1.05em;
	color: var(--MI_THEME-accent);
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
.refreshBtn {
	flex-shrink: 0;
	padding: 0.35em;
	border-radius: 6px;
	color: var(--MI_THEME-fgTransparentWeak);
	transition: color 0.12s ease;
	@media (hover: hover) {
		&:hover { color: var(--MI_THEME-accent); }
	}
}

// --- Body ---
.bandsBody {
	display: flex;
	flex-direction: column;
}
.bandsLoading {
	padding: 1.2em 0;
}
.bandsEmpty {
	padding: 1.2em 0.85em;
	font-size: 0.88em;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
}
.bandProgress {
	display: flex;
	height: 6px;
	border-radius: 3px;
	overflow: hidden;
	margin: 0.6em 0.75em 0.35em;
	background: color-mix(in srgb, var(--MI_THEME-fg) 5%, var(--MI_THEME-panel));
}
.bandProgressSeg {
	height: 100%;
	min-width: 3px;
	transition: flex-grow 0.3s ease;
	&[data-band="in"] { background: var(--MI_THEME-accent); }
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
	&[data-band="in"] { color: var(--MI_THEME-accent); }
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
	&[data-band="in"] { border-left-color: color-mix(in srgb, var(--MI_THEME-accent) 55%, transparent); }
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

// --- Locate divider footer ---
.locateRow {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.5em 0.75em;
	padding: 0.65em 0.85em;
	border-top: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 70%, transparent);
}
.locateText {
	display: flex;
	align-items: flex-start;
	gap: 0.5em;
	min-width: 0;
	flex: 1 1 14em;
	font-size: 0.84em;
	line-height: 1.45;
	color: var(--MI_THEME-fgTransparentWeak);
}
.locateIcon {
	flex-shrink: 0;
	margin-top: 0.12em;
	color: var(--MI_THEME-accent);
}

// --- Load failed ---
.loadFailed {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.6em;
	padding: 1.8em 1em;
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

// --- Transition animations ---
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
