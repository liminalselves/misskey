<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!--
内容库审查独立页：展示角色/风格提示词的完整内容、与线上版本的差异，并提供审核/封禁操作。
路由 /admin/agent-library/:kind/:id（moderator 守卫在 router.definition.ts），
入口在智能体治理页的待处理/内容库列表（桌面新标签页，移动端站内跳转）。
-->
<template>
<div class="_spacer" style="--MI_SPACER-w: 900px; --MI_SPACER-min: 14px; --MI_SPACER-max: 28px;">
	<div class="_gaps_m">
		<div>
			<MkButton small rounded @click="goBack"><i class="ti ti-arrow-left"></i> 返回列表</MkButton>
		</div>
		<MkLoading v-if="loading && detail == null"/>
		<MkInfo v-else-if="loadError != null">{{ loadError }}</MkInfo>
		<template v-else-if="detail != null">
			<section :class="$style.headCard">
				<div :class="$style.headMain">
					<MkDriveFileThumbnail v-if="detail.avatar" :file="detail.avatar" fit="cover" :class="$style.avatar"/>
					<div :class="$style.headText">
						<div :class="$style.titleRow">
							<span :class="$style.typeBadge">{{ kindLabel(detail.kind) }}</span>
							<h1 :class="$style.title">{{ detail.name }}</h1>
						</div>
						<p :class="$style.summary">{{ detail.summary || '—' }}</p>
					</div>
				</div>
				<div :class="$style.badges">
					<span :class="$style[statusBadgeStyle(detail.reviewStatus)]">{{ statusLabel(detail.reviewStatus) }}</span>
					<span>{{ detail.publishedVersion == null ? '首次提交' : `V${detail.publishedVersion} 更新` }}</span>
					<span v-if="detail.moderationBanned" :class="$style.warnBadge">已封禁</span>
					<span v-for="tag in detail.riskTags" :key="tag">{{ tag }}</span>
				</div>
				<div :class="$style.metaRow">
					<span :class="$style.metaItem"><i class="ti ti-user"></i><MkUserAcctInline :user="detail.user" :fallback="detail.userId"/></span>
					<span :class="$style.metaItem"><i class="ti ti-clock"></i>更新于 {{ formatTime(detail.updatedAt) }}</span>
					<span :class="$style.metaItem"><i class="ti ti-plus"></i>创建于 {{ formatTime(detail.createdAt) }}</span>
				</div>
			</section>

			<section v-if="detail.reviewRejectReason || detail.reviewRejectMessage" :class="$style.noteCard">
				<b>最近拒绝/备注</b>
				<p :class="$style.noteLine">原因：{{ detail.reviewRejectReason ?? '—' }}</p>
				<pre :class="$style.pre">{{ detail.reviewRejectMessage ?? '—' }}</pre>
			</section>

			<section :class="$style.block">
				<h2 :class="$style.blockTitle">版本差异</h2>
				<p v-if="!detail.diff.hasChanges" :class="$style.blockHint">首次提交或当前内容与线上版本无差异。</p>
				<div v-for="field in detail.diff.fields" :key="field.key" :class="$style.diffRow">
					<b>{{ reviewFieldLabel(field.key) }}</b>
					<pre :class="$style.pre">当前：{{ diffPreviewText(field.key, field.draftPreview) }}

线上：{{ diffPreviewText(field.key, field.publishedPreview) }}</pre>
				</div>
			</section>

			<template v-if="detail.kind === 'character'">
				<section :class="$style.block">
					<h2 :class="$style.blockTitle">角色内容</h2>
					<pre :class="$style.pre">{{ characterContentText }}</pre>
				</section>
				<section :class="$style.block">
					<h2 :class="$style.blockTitle">世界书</h2>
					<pre :class="$style.pre">{{ worldbookText(detail.worldbook) }}</pre>
				</section>
				<section :class="$style.block">
					<h2 :class="$style.blockTitle">规则</h2>
					<pre :class="$style.pre">{{ rulesText(detail.rules) }}</pre>
				</section>
				<section v-if="(detail.stickers?.length ?? 0) > 0" :class="$style.block">
					<h2 :class="$style.blockTitle">表情包</h2>
					<div :class="$style.stickerGrid">
						<div v-for="sticker in detail.stickers" :key="sticker.key" :class="$style.stickerItem" :title="sticker.description">
							<img v-if="stickerUrl(sticker) != null" :src="stickerUrl(sticker)!" :alt="sticker.key" loading="lazy"/>
							<div v-else :class="$style.stickerFallback">{{ sticker.key }}</div>
							<div :class="$style.stickerMeta">
								<b>{{ sticker.key }}</b>
								<span>{{ sticker.description }}</span>
							</div>
						</div>
					</div>
				</section>
			</template>
			<section v-else :class="$style.block">
				<h2 :class="$style.blockTitle">风格提示词正文</h2>
				<pre :class="$style.pre">{{ detail.body || '—' }}</pre>
			</section>

			<div :class="$style.actions">
				<MkButton v-if="iAmModerator && detail.reviewStatus === 'pending'" primary rounded :disabled="acting" @click="approve"><i class="ti ti-check"></i> 通过</MkButton>
				<MkButton v-if="iAmModerator && detail.reviewStatus === 'pending'" danger rounded :disabled="acting" @click="reject"><i class="ti ti-x"></i> 拒绝</MkButton>
				<MkButton v-if="iAmModerator && detail.kind === 'character'" rounded :danger="!detail.moderationBanned" :disabled="acting" @click="toggleBan"><i class="ti ti-ban"></i> {{ detail.moderationBanned ? '解封角色' : '封禁角色' }}</MkButton>
				<MkButton rounded @click="copyText(detail.id)"><i class="ti ti-copy"></i> 复制 ID</MkButton>
			</div>
		</template>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import MkUserAcctInline from '@/components/MkUserAcctInline.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { definePage } from '@/page.js';
import { formatDateTimeString } from '@/utility/format-time-string.js';
import * as os from '@/os.js';
import { iAmModerator } from '@/i.js';
import { useRouter } from '@/router.js';
import { goBackInApp } from '@/utility/router-history.js';

type Kind = 'character' | 'style';
type WorldbookEntry = { id: string; title: string; content: string; keywords: string[]; triggerMode: 'keyword' | 'manual' | 'always'; priority: number; enabled: boolean; revision: number };
type CharacterRuleEntry = { id: string; name: string; content: string; description: string; type: 'persistent' | 'toggleable'; defaultEnabled: boolean };
type StickerEntry = { key: string; fileId: string; description: string; file?: { url: string; thumbnailUrl?: string | null; type?: string | null } | null };
type ReviewDetailRow = {
	kind: Kind;
	id: string;
	userId: string;
	name: string;
	summary: string | null;
	reviewStatus: string;
	publishedVersion: number | null;
	moderationBanned: boolean;
	riskTags: string[];
	reviewRejectReason: string | null;
	reviewRejectMessage: string | null;
	createdAt: string;
	updatedAt: string;
	user: any | null;
	avatar: any | null;
	personality?: string;
	background?: string;
	speakingStyle?: string;
	greeting?: string;
	exampleTurns?: { role: 'user' | 'assistant'; content: string }[];
	forbiddenBehavior?: string;
	worldbook?: WorldbookEntry[];
	rules?: CharacterRuleEntry[];
	stickers?: StickerEntry[];
	body?: string;
	publishedSnapshot: Record<string, unknown> | null;
	diff: { hasChanges: boolean; fields: { key: string; draftPreview: string; publishedPreview: string }[] };
};

const api = misskeyApi as unknown as <T>(endpoint: string, data?: Record<string, unknown>) => Promise<T>;
const props = defineProps<{ kind: string; id: string }>();
const router = useRouter();

const detail = ref<ReviewDetailRow | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const acting = ref(false);

// 有站内历史原路返回（移动端跳转），否则回内容库列表（桌面新标签页无历史）
function goBack() {
	goBackInApp(router, '/admin/agents-review?view=library');
}

async function load() {
	if (props.kind !== 'character' && props.kind !== 'style') {
		loadError.value = '无效的内容类型。';
		return;
	}
	loading.value = true;
	loadError.value = null;
	try {
		detail.value = await api<ReviewDetailRow>('admin/agents/governance/review/detail', { kind: props.kind, id: props.id });
	} catch (err) {
		loadError.value = formatApiError(err);
	} finally {
		loading.value = false;
	}
}

async function approve() {
	if (detail.value == null) return;
	const { canceled } = await os.confirm({ type: 'info', text: `通过「${detail.value.name}」？` });
	if (canceled) return;
	await resolveReview('approve', {});
}

async function reject() {
	if (detail.value == null) return;
	const { canceled, result } = await os.form('拒绝审核', {
		rejectReason: {
			type: 'enum',
			label: '标准原因',
			required: true,
			default: 'policy',
			enum: [
				{ label: '违反社区规范', value: 'policy' },
				{ label: '色情或露骨内容', value: 'sexual' },
				{ label: '暴力或危险内容', value: 'violence' },
				{ label: '仇恨或骚扰', value: 'hate' },
				{ label: '违法或侵权', value: 'illegal' },
				{ label: '提示词注入/越权', value: 'prompt_injection' },
				{ label: '广告或低质内容', value: 'spam' },
				{ label: '其他', value: 'other' },
			],
		},
		rejectMessage: { type: 'string', label: '给作者的说明', required: true, multiline: true },
		internalNote: { type: 'string', label: '内部备注', required: false, multiline: true },
	});
	if (canceled) return;
	await resolveReview('reject', result);
}

async function resolveReview(decision: 'approve' | 'reject', extra: Record<string, unknown>) {
	if (detail.value == null) return;
	acting.value = true;
	try {
		await api('admin/agents/governance/review/resolve', { kind: detail.value.kind, id: detail.value.id, decision, ...extra });
		os.toast('已处理');
		await load();
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		acting.value = false;
	}
}

async function toggleBan() {
	const row = detail.value;
	if (row == null || row.kind !== 'character') return;
	const next = !row.moderationBanned;
	const { canceled, result } = await os.form(next ? '封禁角色' : '解封角色', {
		reason: { type: 'string', label: '处理原因', required: next, multiline: true },
	});
	if (canceled) return;
	acting.value = true;
	try {
		await api('admin/agents/governance/review/set-character-banned', { characterId: row.id, banned: next, reason: result.reason || null });
		os.toast('已处理');
		await load();
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		acting.value = false;
	}
}

function copyText(text: string) {
	copyToClipboard(text);
	os.toast('已复制');
}

const characterContentText = computed(() => {
	const d = detail.value;
	if (d == null) return '';
	return [
		`人设：${d.personality || '—'}`,
		`背景：${d.background || '—'}`,
		`说话风格：${d.speakingStyle || '—'}`,
		`开场白：${d.greeting || '—'}`,
		`示例对话：${d.exampleTurns?.map(turn => `${turn.role}: ${turn.content}`).join('\n') || '—'}`,
		`禁止行为：${d.forbiddenBehavior || '—'}`,
	].join('\n\n');
});

function stickerUrl(sticker: StickerEntry): string | null {
	if (!sticker.file) return null;
	return sticker.file.type === 'image/gif' ? sticker.file.url : sticker.file.thumbnailUrl ?? sticker.file.url;
}

function formatTime(v: string | null | undefined) {
	return v ? formatDateTimeString(new Date(v), 'yyyy-MM-dd HH:mm') : '—';
}

function kindLabel(kind: string) {
	return kind === 'character' ? '角色' : '风格提示词';
}

function statusLabel(status: string) {
	if (status === 'pending') return '待审';
	if (status === 'published') return '已发布';
	if (status === 'rejected') return '已拒绝';
	if (status === 'draft') return '草稿';
	return status;
}

function statusBadgeStyle(status: string): 'statusPending' | 'statusPublished' | 'statusRejected' | 'statusDraft' {
	if (status === 'pending') return 'statusPending';
	if (status === 'rejected') return 'statusRejected';
	if (status === 'draft') return 'statusDraft';
	return 'statusPublished';
}

function reviewFieldLabel(key: string) {
	const labels: Record<string, string> = {
		name: '名称',
		summary: '简介',
		personality: '人设',
		background: '背景',
		speakingStyle: '说话风格',
		greeting: '开场白',
		exampleDialogue: '示例对话',
		forbiddenBehavior: '禁止行为',
		worldbook: '世界书',
		rules: '规则',
		stickers: '表情包',
		body: '风格提示词正文',
		avatarFileId: '头像',
	};
	return labels[key] ?? key;
}

function worldbookToText(entries: WorldbookEntry[] | null | undefined): string {
	if (!entries?.length) return '—';
	return entries.map((entry, index) => [
		`${index + 1}. ${entry.title || '未命名'}（${entry.enabled ? '启用' : '停用'} · ${entry.triggerMode} · 优先级 ${entry.priority}）`,
		`关键词：${entry.keywords.join('、') || '—'}`,
		`正文：${entry.content || '—'}`,
	].join('\n')).join('\n\n');
}

function rulesToText(entries: CharacterRuleEntry[] | null | undefined): string {
	if (!entries?.length) return '—';
	return entries.map((rule, index) => [
		`${index + 1}. ${rule.name || '未命名'}（${rule.type === 'persistent' ? '常驻' : `可切换 · 默认${rule.defaultEnabled ? '开启' : '关闭'}`}）`,
		`简介：${rule.description || '—'}`,
		`正文：${rule.content || '—'}`,
	].join('\n')).join('\n\n');
}

function worldbookText(entries: WorldbookEntry[] | undefined) {
	return worldbookToText(entries);
}

function rulesText(entries: CharacterRuleEntry[] | undefined) {
	return rulesToText(entries);
}

// diff 字段预览：rules/worldbook 为 JSON 字符串时转为可读文本，其余字段原样展示
function diffPreviewText(key: string, text: string): string {
	if (!text) return '—';
	try {
		const parsed = JSON.parse(text);
		if (key === 'rules' && Array.isArray(parsed)) return rulesToText(parsed);
		if (key === 'worldbook' && Array.isArray(parsed)) return worldbookToText(parsed);
	} catch {
		// 非 JSON，原样展示
	}
	return text;
}

definePage(() => ({
	title: detail.value ? `${kindLabel(detail.value.kind)}审查：${detail.value.name}` : '内容审查',
	icon: 'ti ti-shield-check',
}));

onMounted(load);
</script>

<style lang="scss" module>
.headCard,
.noteCard,
.block {
	padding: 14px 16px;
	border-radius: 10px;
	background: var(--MI_THEME-panel);
	border: 1px solid var(--MI_THEME-divider);
}
.headMain {
	display: flex;
	align-items: flex-start;
	gap: 12px;
}
.avatar {
	width: 56px;
	height: 56px;
	border-radius: 8px;
	overflow: hidden;
	flex: 0 0 auto;
}
.headText {
	min-width: 0;
}
.titleRow {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
	min-width: 0;
}
.title {
	margin: 0;
	font-size: 1.2em;
	overflow-wrap: anywhere;
}
.summary {
	margin: 6px 0 0;
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.5;
	overflow-wrap: anywhere;
}
.badges {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
	margin-top: 10px;
}
.badges span,
.typeBadge,
.statusPending,
.statusPublished,
.statusRejected,
.statusDraft {
	display: inline-flex;
	align-items: center;
	min-height: 22px;
	padding: 1px 8px;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 0.82em;
	flex-shrink: 0;
}
.statusPending {
	background: var(--MI_THEME-infoWarnBg);
	color: var(--MI_THEME-infoWarnFg);
}
.statusRejected,
.warnBadge {
	background: var(--MI_THEME-errorBg);
	color: var(--MI_THEME-error);
}
.statusDraft {
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-fgTransparentWeak);
}
.metaRow {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px 16px;
	margin-top: 10px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.88em;
}
.metaItem {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	min-width: 0;
	font-variant-numeric: tabular-nums;
}
.metaItem i {
	font-size: 0.95em;
	opacity: 0.7;
}
.noteCard b,
.blockTitle {
	display: block;
	margin: 0 0 8px;
	font-size: 0.95em;
	color: var(--MI_THEME-fgTransparentWeak);
}
.noteLine {
	margin: 4px 0;
	line-height: 1.45;
}
.blockHint {
	margin: 0;
	line-height: 1.5;
}
.pre {
	margin: 0;
	padding: 10px 12px;
	border-radius: 8px;
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
	white-space: pre-wrap;
	word-break: break-word;
	overflow-wrap: anywhere;
	line-height: 1.5;
}
.diffRow {
	display: grid;
	gap: 6px;
	padding: 10px 0;
	border-top: 1px solid var(--MI_THEME-divider);
}
.diffRow:first-of-type {
	border-top: none;
	padding-top: 0;
}
.stickerGrid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
	gap: 10px;
}
.stickerItem {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 8px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 8px;
	min-width: 0;
	background: var(--MI_THEME-bg);
}
.stickerItem img,
.stickerFallback {
	display: block;
	width: 100%;
	height: 120px;
	object-fit: contain;
	border-radius: 6px;
	background: var(--MI_THEME-panel);
}
.stickerFallback {
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
	overflow: hidden;
}
.stickerMeta {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}
.stickerMeta span {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
	overflow-wrap: anywhere;
}
.actions {
	position: sticky;
	bottom: 0;
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	padding: 10px 0;
	background: var(--MI_THEME-bg);
}
@media (max-width: 600px) {
	.headCard,
	.noteCard,
	.block {
		padding: 12px;
	}
}
</style>
