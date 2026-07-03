<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader showBack narrowMergedRow>
	<div class="_spacer" style="--MI_SPACER-w: 960px;">
		<MkLoading v-if="loading"/>
		<div v-else class="_gaps_m">
			<div v-if="reviewRejected" :class="$style.reviewRejectBox">
				<div :class="$style.reviewRejectTitle"><i class="ti ti-alert-triangle"></i> 未通过审核</div>
				<div v-if="reviewRejectReason" :class="$style.reviewRejectMeta">原因：{{ rejectReasonLabel(reviewRejectReason) }}</div>
				<p v-if="reviewRejectMessage">{{ reviewRejectMessage }}</p>
				<p v-else>管理员没有填写具体说明，请修改后重新提交审核。</p>
			</div>

			<div :class="$style.topBar">
				<div class="_gaps_s">
					<div :class="$style.topTitle">{{ form.state.name.trim() || i18n.ts._agents.editStyle }}</div>
					<div :class="$style.topSubtitle">{{ i18n.ts._agents.editStyleOpenSource }}</div>
				</div>
				<div class="_buttons">
					<MkButton rounded @click="scrollToSection('basic')"><i class="ti ti-message-cog"></i> {{ i18n.ts._agents.editStyle }}</MkButton>
					<MkButton rounded @click="scrollToSection('versions')"><i class="ti ti-history"></i> 版本</MkButton>
				</div>
			</div>

			<div v-if="form.modified.value" :class="$style.stickySave">
				<MkFormFooter :form="form"/>
			</div>

			<div :class="$style.layout">
				<div class="_gaps_m">
					<MkFolder ref="basicSection" :defaultOpen="true">
						<template #icon><i class="ti ti-message-cog"></i></template>
						<template #label>{{ i18n.ts._agents.editStyle }}</template>
						<div class="_gaps">
							<MkInput v-model="form.state.name">
								<template #label>{{ i18n.ts._agents.fieldStyleName }}</template>
							</MkInput>
							<MkTextarea v-model="form.state.summary">
								<template #label>{{ i18n.ts._agents.fieldStyleSummary }}</template>
								<template #caption>{{ i18n.ts._agents.fieldStyleSummaryCaption }}</template>
							</MkTextarea>
							<MkTextarea v-model="form.state.body" tall>
								<template #label>{{ i18n.ts._agents.fieldStyleBody }}</template>
							</MkTextarea>
							<MkInfo>{{ i18n.ts._agents.styleBodyHint }}</MkInfo>
						</div>
					</MkFolder>

					<MkFolder>
						<template #icon><i class="ti ti-license"></i></template>
						<template #label>{{ i18n.ts._agents.editStyleOpenSource }}</template>
						<div class="_gaps">
							<MkSwitch v-model="form.state.promptOpenSourced">
								<template #label>{{ i18n.ts._agents.openSourcePrompt }}</template>
								<template #caption>{{ i18n.ts._agents.openSourcePromptStyleCaption }}</template>
							</MkSwitch>
						</div>
					</MkFolder>

					<MkFolder ref="versionsSection">
						<template #icon><i class="ti ti-history"></i></template>
						<template #label>版本管理</template>
						<div class="_gaps">
							<div :class="$style.placeholderCard">
								<div :class="$style.placeholderTitle">草稿 / 发布 / 回滚</div>
								<div :class="$style.placeholderText">对白风格会展示真实版本记录，并支持回滚到已发布快照。</div>
							</div>
							<div :class="$style.placeholderCard">
								<div :class="$style.placeholderTitle">草稿与发布版差异</div>
								<MkLoading v-if="diffLoading"/>
								<div v-else-if="versionDiffFields.length === 0" :class="$style.placeholderText">当前草稿与发布版没有差异，或尚未发布过版本。</div>
								<div v-else class="_gaps_s">
									<div v-for="item in versionDiffFields" :key="item.key" :class="$style.versionCard">
										<button type="button" :class="$style.diffFieldHeader" @click="toggleDiffField(item.key)">
											<i class="ti" :class="expandedDiffKeys.includes(item.key) ? 'ti-chevron-down' : 'ti-chevron-right'"></i>
											<span :class="$style.versionTitle">{{ diffFieldLabel(item.key) }}</span>
										</button>
										<div v-if="expandedDiffKeys.includes(item.key)" :class="$style.diffLines">
											<div
												v-for="(line, idx) in computeDiffLines(item.publishedPreview, item.draftPreview)"
												:key="idx"
												:class="[$style.diffLine, line.type === 'add' ? $style.diffAdd : line.type === 'del' ? $style.diffDel : $style.diffSame]"
											>
												<span :class="$style.diffSign">{{ line.type === 'add' ? '+' : line.type === 'del' ? '-' : '' }}</span>
												<span :class="$style.diffText">{{ line.text || ' ' }}</span>
											</div>
										</div>
										<template v-else>
											<div :class="$style.versionText">草稿：{{ summarizeDiffText(item.draftPreview) }}</div>
											<div :class="$style.versionText">发布：{{ summarizeDiffText(item.publishedPreview) }}</div>
										</template>
									</div>
								</div>
							</div>
							<MkLoading v-if="versionsLoading"/>
							<div v-else-if="versionItems.length" class="_gaps_s">
								<div v-for="(item, idx) in versionItems" :key="`${item.version}-${item.isCurrentDraft ? 'draft' : item.isHistorical ? 'history' : 'published'}-${idx}`" :class="$style.versionCard">
									<div :class="$style.versionHeader">
										<div>
											<div :class="$style.versionTitle">
												{{ item.isCurrentDraft ? '草稿版本' : item.isHistorical ? '历史版本' : '发布快照' }} v{{ item.version }}
											</div>
											<div :class="$style.versionMeta">
												{{ item.reviewStatus }} · {{ formatIsoTime(item.updatedAt) }}
											</div>
										</div>
										<div class="_buttons">
											<MkButton v-if="item.isHistorical" rounded inline :disabled="rollbackPending" @click="rollbackToVersion(item.version, item.isCurrentPublished)">
												<i class="ti ti-rotate-2"></i> {{ item.isCurrentPublished ? '回滚到此发布版' : '回滚到此历史版' }}
											</MkButton>
											<MkButton v-else-if="item.isPublished && !item.isCurrentDraft" rounded inline :disabled="rollbackPending" @click="rollbackToPublished">
												<i class="ti ti-rotate-2"></i> 回滚到发布版
											</MkButton>
										</div>
									</div>
									<div :class="$style.versionText">
										草稿版本号：{{ item.draftRevision }}
										<template v-if="item.isPublished"> · 已发布版本号：{{ item.version }}</template>
										<template v-if="item.isCurrentDraft"> · 当前草稿</template>
										<template v-if="item.isCurrentPublished"> · 当前发布</template>
									</div>
								</div>
							</div>
							<div v-else :class="$style.placeholderText">当前还没有可显示的版本数据。</div>
						</div>
					</MkFolder>

					<div class="_buttons">
						<MkButton danger rounded @click="remove"><i class="ti ti-trash"></i> {{ i18n.ts._agents.deleteStyle }}</MkButton>
					</div>
				</div>

				<div :class="$style.previewColumn">
					<div :class="$style.previewCard">
						<div :class="$style.previewTitle">实时预览</div>
						<div :class="$style.previewBlock">
							<div :class="$style.previewLabel">名称</div>
							<div :class="$style.previewText">{{ form.state.name || '未填写' }}</div>
						</div>
						<div :class="$style.previewBlock">
							<div :class="$style.previewLabel">正文预览</div>
							<div :class="$style.previewText">{{ form.state.body || '未填写' }}</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import MkInfo from '@/components/MkInfo.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useForm } from '@/composables/use-form.js';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';

const props = defineProps<{
	styleId: string;
}>();

const router = useRouter();
const loading = ref(true);
const versionsLoading = ref(false);
const diffLoading = ref(false);
const basicSection = ref<InstanceType<typeof MkFolder> | null>(null);
const versionsSection = ref<InstanceType<typeof MkFolder> | null>(null);
const reviewStatus = ref<string>('draft');
const reviewRejectReason = ref<string | null>(null);
const reviewRejectMessage = ref<string | null>(null);

type StyleVersionItem = {
	version: number;
	draftRevision: number;
	reviewStatus: string;
	isPublished: boolean;
	createdAt: string;
	updatedAt: string;
	isCurrentDraft: boolean;
	isCurrentPublished: boolean;
	isHistorical: boolean;
};

const versionItems = ref<StyleVersionItem[]>([]);
const rollbackPending = ref(false);
const versionDiffFields = ref<Array<{ key: string; draftPreview: string; publishedPreview: string }>>([]);
const reviewRejected = computed(() => reviewStatus.value === 'rejected' && form.state.publishedVersion == null);

const form = useForm({
	name: '',
	summary: '',
	body: '',
	promptOpenSourced: false,
	publishedVersion: null as number | null,
	draftRevision: 1,
}, async (state) => {
	await misskeyApi('agents/styles/update', {
		styleId: props.styleId,
		name: state.name,
		summary: state.summary.trim() === '' ? null : state.summary,
		body: state.body,
		promptOpenSourced: state.promptOpenSourced,
	});
	// 保存后草稿版本号与差异已变化，刷新版本列表与 diff。
	await Promise.all([loadVersions(), loadStyleDiff()]);
});

async function load() {
	loading.value = true;
	try {
		const [rawRow] = await Promise.all([
			misskeyApi('agents/styles/show', { styleId: props.styleId }),
			loadVersions(),
			loadStyleDiff(),
		]);
		const row = rawRow as any;
		reviewStatus.value = row.reviewStatus ?? 'draft';
		reviewRejectReason.value = row.reviewRejectReason ?? null;
		reviewRejectMessage.value = row.reviewRejectMessage ?? null;
		const next = {
			name: row.name,
			summary: row.summary ?? '',
			body: row.body ?? '',
			promptOpenSourced: row.promptOpenSourced === true,
			publishedVersion: row.publishedVersion ?? null,
			draftRevision: row.draftRevision ?? 1,
		};
		Object.assign(form.state, next);
		Object.assign(form.savedState, JSON.parse(JSON.stringify(next)));
	} catch {
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
		router.push('/agents');
	} finally {
		loading.value = false;
	}
}

async function loadVersions() {
	versionsLoading.value = true;
	try {
		const rows = await misskeyApi('agents/styles/versions', { styleId: props.styleId });
		versionItems.value = Array.isArray(rows) ? rows : [];
		return rows;
	} finally {
		versionsLoading.value = false;
	}
}

async function loadStyleDiff() {
	diffLoading.value = true;
	try {
		const row = await misskeyApi('agents/styles/diff', { styleId: props.styleId });
		versionDiffFields.value = Array.isArray(row?.fields) ? row.fields : [];
	} finally {
		diffLoading.value = false;
	}
}

onMounted(() => {
	void load();
});

definePage(computed(() => ({
	title: form.state.name.trim() || i18n.ts._agents.editStyle,
	icon: 'ti ti-message-cog',
})));

function scrollToSection(section: 'basic' | 'versions') {
	const map = {
		basic: basicSection,
		versions: versionsSection,
	} as const;
	map[section].value?.$el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function remove() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts._agents.deleteStyleConfirm,
	});
	if (canceled) return;
	await misskeyApi('agents/styles/delete', { styleId: props.styleId });
	os.toast(i18n.ts._agents.deleteDone);
	router.push('/agents');
}

async function rollbackToPublished() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: '确定要将当前草稿回滚到已发布版本吗？',
	});
	if (canceled) return;
	rollbackPending.value = true;
	try {
		await misskeyApi('agents/styles/rollback', { styleId: props.styleId });
		os.toast('已回滚到发布版本。');
		await load();
	} finally {
		rollbackPending.value = false;
	}
}

async function rollbackToVersion(version: number, isCurrentPublished: boolean) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: isCurrentPublished
			? `确定要将当前草稿回滚到发布版 v${version} 吗？`
			: `确定要将当前草稿回滚到历史版本 v${version} 吗？该操作会用历史快照覆盖当前编辑内容。`,
	});
	if (canceled) return;
	rollbackPending.value = true;
	try {
		await misskeyApi('agents/styles/rollback', { styleId: props.styleId, version });
		os.toast(`已回滚到版本 v${version}。`);
		await load();
	} finally {
		rollbackPending.value = false;
	}
}

function formatIsoTime(iso: string) {
	try {
		return new Date(iso).toLocaleString();
	} catch {
		return iso;
	}
}

function summarizeDiffText(s: string): string {
	if (!s) return '(empty)';
	return s.length > 120 ? `${s.slice(0, 120)}...` : s;
}

function rejectReasonLabel(reason: string) {
	const labels: Record<string, string> = {
		policy: '违反社区规范',
		sexual: '色情或露骨内容',
		violence: '暴力或危险内容',
		hate: '仇恨或骚扰',
		illegal: '违法或侵权',
		prompt_injection: '提示词注入/越权',
		spam: '广告或低质内容',
		other: '其他',
	};
	return labels[reason] ?? reason;
}

const expandedDiffKeys = ref<string[]>([]);

function toggleDiffField(key: string) {
	const idx = expandedDiffKeys.value.indexOf(key);
	if (idx >= 0) expandedDiffKeys.value.splice(idx, 1);
	else expandedDiffKeys.value.push(key);
}

const diffFieldLabels: Record<string, string> = {
	name: '名称',
	summary: '简介',
	body: '风格正文',
};

function diffFieldLabel(key: string): string {
	return diffFieldLabels[key] ?? key;
}

type DiffLine = { type: 'same' | 'add' | 'del'; text: string };

// 基于 LCS 的逐行 diff：a=已发布(旧)，b=草稿(新)。del=已发布有而草稿无，add=草稿新增。
function computeDiffLines(publishedText: string, draftText: string): DiffLine[] {
	const aLines = publishedText.split('\n');
	const bLines = draftText.split('\n');
	const n = aLines.length;
	const m = bLines.length;
	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i][j] = aLines[i] === bLines[j]
				? dp[i + 1][j + 1] + 1
				: Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (aLines[i] === bLines[j]) {
			out.push({ type: 'same', text: aLines[i] });
			i++; j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			out.push({ type: 'del', text: aLines[i] });
			i++;
		} else {
			out.push({ type: 'add', text: bLines[j] });
			j++;
		}
	}
	while (i < n) { out.push({ type: 'del', text: aLines[i] }); i++; }
	while (j < m) { out.push({ type: 'add', text: bLines[j] }); j++; }
	return out;
}
</script>

<style lang="scss" module>
.layout {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 280px;
	gap: 16px;
	align-items: start;
}
.topBar {
	display: flex;
	justify-content: space-between;
	gap: 16px;
	align-items: flex-start;
	flex-wrap: wrap;
	padding: 12px 0;
}
.topTitle {
	font-weight: 800;
	font-size: 1.2rem;
}
.topSubtitle {
	opacity: 0.75;
	font-size: 0.9rem;
}
.previewColumn {
	position: sticky;
	top: 72px;
}
.previewCard {
	padding: 12px;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	display: grid;
	gap: 12px;
}
.previewTitle {
	font-weight: 700;
}
.previewBlock {
	display: grid;
	gap: 4px;
}
.previewLabel {
	font-size: 0.85rem;
	opacity: 0.7;
}
.previewText {
	white-space: pre-wrap;
	line-height: 1.5;
}
.placeholderCard {
	padding: 12px;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 92%, transparent);
}
.placeholderTitle {
	font-weight: 700;
	margin-bottom: 6px;
}
.placeholderText {
	line-height: 1.55;
	opacity: 0.8;
}
.reviewRejectBox {
	padding: 12px 14px;
	border-radius: var(--MI-radius);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-warn) 40%, var(--MI_THEME-divider));
	background: color-mix(in srgb, var(--MI_THEME-warn) 10%, var(--MI_THEME-panel));
}
.reviewRejectTitle {
	display: flex;
	align-items: center;
	gap: 6px;
	font-weight: 700;
	color: var(--MI_THEME-warn);
}
.reviewRejectMeta {
	margin-top: 5px;
	font-size: 0.86rem;
	color: var(--MI_THEME-fgTransparentWeak);
}
.reviewRejectBox p {
	margin: 7px 0 0;
	white-space: pre-wrap;
	word-break: break-word;
	line-height: 1.55;
}
.versionCard {
	padding: 12px;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 88%, transparent);
}
.versionHeader {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	align-items: flex-start;
	flex-wrap: wrap;
}
.versionTitle {
	font-weight: 700;
}
.versionMeta {
	font-size: 0.85rem;
	opacity: 0.72;
}
.versionText {
	font-size: 0.9rem;
	opacity: 0.8;
}
.diffFieldHeader {
	display: flex;
	align-items: center;
	gap: 6px;
	width: 100%;
	padding: 0;
	border: none;
	background: none;
	color: inherit;
	cursor: pointer;
	text-align: left;
	font: inherit;
}
.diffLines {
	margin-top: 8px;
	border-radius: var(--MI-radius-sm);
	border: solid 1px var(--MI_THEME-divider);
	overflow: hidden;
	font-family: Consolas, Monaco, 'Courier New', monospace;
	font-size: 0.82rem;
	line-height: 1.5;
}
.diffLine {
	display: flex;
	gap: 6px;
	padding: 0 8px;
	white-space: pre-wrap;
	word-break: break-word;
}
.diffSign {
	flex-shrink: 0;
	width: 0.8em;
	text-align: center;
	opacity: 0.7;
}
.diffText {
	flex: 1;
	min-width: 0;
}
.diffAdd {
	background: color-mix(in srgb, #2ecc71 22%, transparent);
}
.diffDel {
	background: color-mix(in srgb, #e74c3c 22%, transparent);
}
.diffSame {
	opacity: 0.7;
}
.stickySave {
	position: sticky;
	top: 0;
	z-index: 1;
	padding-bottom: 8px;
	background: var(--MI_THEME-bg);
}
@media (max-width: 960px) {
	.layout {
		grid-template-columns: minmax(0, 1fr);
	}
	.previewColumn {
		position: static;
	}
}
</style>
