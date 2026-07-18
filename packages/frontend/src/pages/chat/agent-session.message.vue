<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	v-if="message.role === 'system'"
	:class="[$style.systemRoot, { [$style.clickable]: isSearchResult }]"
	:data-message-id="message.id"
	@click="onSearchResultClick"
>
	<span
		:class="$style.systemText"
		v-html="systemHtml"
	></span>
	<div :class="$style.systemFooter" @click.stop>
		<button class="_textButton" style="color: currentColor;" @pointerdown.stop @click.stop="showMenu"><i class="ti ti-dots-circle-horizontal"></i></button>
		<MkTime :class="$style.systemTime" :time="message.createdAt"/>
	</div>
</div>
<div
	v-else
	:class="[$style.root, { [$style.isMe]: isUser, [$style.highlighted]: highlighted, [$style.clickable]: isSearchResult }]"
	:data-message-id="message.id"
	@click="onSearchResultClick"
>
	<MkAvatar
		v-if="isUser"
		:class="[$style.avatar, prefer.s.useStickyIcons ? $style.useSticky : null]"
		:user="$i"
		:link="false"
		:preview="false"
	/>
	<div v-else :class="[$style.avatar, prefer.s.useStickyIcons ? $style.useSticky : null, $style.assistantAvatar]">
		<img v-if="assistantAvatarUrl" :class="$style.assistantImg" :src="assistantAvatarUrl" alt=""/>
		<div v-else :class="$style.assistantFallback"><i class="ti ti-robot"></i></div>
	</div>
	<div :class="$style.body" @contextmenu.stop="onContextmenu">
		<div v-if="!isUser && prefer.s['chat.showSenderName'] && assistantName" :class="$style.header">{{ assistantName }}</div>
		<TransitionGroup
			tag="div"
			:class="$style.segmentStack"
			:enterActiveClass="prefer.s.animation ? $style.segmentEnterActive : ''"
			:enterFromClass="prefer.s.animation ? $style.segmentEnterFrom : ''"
			:moveClass="prefer.s.animation ? $style.segmentMove : ''"
		>
			<MkFukidashi
				v-for="(segment, segmentIndex) in renderedSegments"
				:key="segment.key"
				:class="[
					$style.fukidashi,
					segment.drawOnly ? $style.drawFukidashi : null,
					isUser && segmentIndex === 0 && message.file ? $style.imageFukidashi : null,
				]"
				:tail="isUser ? 'right' : (segmentIndex === renderedSegments.length - 1 ? 'left' : 'none')"
				:accented="isUser"
			>
				<MkMediaList v-if="isUser && segmentIndex === 0 && message.file" :class="$style.attachedMedia" :mediaList="[message.file]"/>
				<div v-if="segment.content" :class="[$style.mdRoot, segment.drawOnly ? $style.drawSegmentContent : null, '_selectable']">
					<template v-for="part in segment.parts" :key="part.key">
						<div v-if="part.type === 'text'" v-html="part.html"></div>
						<div v-else :class="$style.drawCard">
							<div :class="$style.drawCardHead">
								<span><i class="ti ti-brush"></i> AI生成图片</span>
								<button
									class="_button"
									:class="$style.drawRetry"
									:title="drawState(part.index)?.status === 'generating' ? '生成中' : '重新生成'"
									:disabled="drawState(part.index)?.status === 'generating'"
									@click.stop="regenerateDraw(part.index)"
								>
									<i class="ti ti-refresh"></i>
								</button>
							</div>
							<div v-if="drawState(part.index)?.status === 'succeeded' && drawState(part.index)?.url && !isDrawBlocked(part.index)" :class="$style.drawImageWrap">
								<MkMediaList v-if="drawFileList(part.index).length > 0" :key="drawState(part.index)?.fileId ?? part.index" :class="$style.drawMediaList" :mediaList="drawFileList(part.index)"/>
								<img v-else :src="drawState(part.index)?.url ?? ''" :class="$style.drawImage" alt="AI生成图片"/>
							</div>
							<div v-else :class="$style.drawPending">
								<MkLoading v-if="!drawState(part.index) || drawState(part.index)?.status === 'generating' || drawState(part.index)?.status === 'pending'"/>
								<i v-else-if="isDrawBlocked(part.index)" class="ti ti-ban"></i>
								<i v-else class="ti ti-alert-circle"></i>
								<span>{{ drawStatusText(part.index) }}</span>
								<span v-if="drawErrorDiagnostic(part.index)" :class="$style.drawErrorDiagnostic">{{ drawErrorDiagnostic(part.index) }}</span>
							</div>
						</div>
					</template>
				</div>
			</MkFukidashi>
		</TransitionGroup>
		<div v-if="proactiveScheduleActionSummary" :class="$style.proactiveScheduleActionSummary">
			<i class="ti ti-calendar-clock"></i>
			<span>{{ proactiveScheduleActionSummary.text }}</span>
			<span v-if="proactiveScheduleActionSummary.failed" :class="$style.proactiveScheduleActionFailed">{{ i18n.ts._agents.proactiveScheduleActionFailed }}</span>
		</div>
		<div :class="$style.footer">
			<button class="_textButton" style="color: currentColor;" @pointerdown.stop @click.stop="showMenu"><i class="ti ti-dots-circle-horizontal"></i></button>
			<MkTime :class="$style.time" :time="message.createdAt"/>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, watch } from 'vue';
import { isLink } from '@@/js/is-link.js';
import type { DriveFile } from 'misskey-js/entities.js';
import { renderAgentChatMarkdown } from '@/utility/agent-chat-markdown.js';
import type { MenuItem } from '@/types/menu.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import MkFukidashi from '@/components/MkFukidashi.vue';
import MkTime from '@/components/global/MkTime.vue';
import * as os from '@/os.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { prefer } from '@/preferences.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import MkLoading from '@/components/global/MkLoading.vue';
import MkMediaList from '@/components/MkMediaList.vue';
import { splitAgentMessageIntoSegments } from '@/utility/agent-message-segments.js';

const $i = ensureSignin();

export type AgentSessionMessageView = {
	id: string;
	role: string;
	content: string;
	createdAt: string;
	file?: DriveFile | null;
	imageRecognitionStatus?: 'succeeded' | 'failed' | null;
	imageRecognitionDescription?: string | null;
	proactiveScheduleActionTypes?: ('create' | 'update' | 'cancel')[];
	proactiveScheduleControlFailed?: boolean;
};

const props = defineProps<{
	sessionId: string;
	message: AgentSessionMessageView;
	assistantName?: string | null;
	assistantAvatarUrl?: string | null;
	regexRules?: Array<{ id: string; pattern: string; targets: ('user' | 'assistant')[]; effects: ('hide' | 'aiInvisible')[] }>;
	highlighted?: boolean;
	segmentedOutputEnabled?: boolean;
	visibleSegmentCount?: number;
	/** 与私信 XMessage 搜索结果一致：点击行跳转到该条消息 */
	isSearchResult?: boolean;
}>();

const emit = defineEmits<{
	(e: 'navigate', messageId: string): void;
	(e: 'deleted', messageId: string): void;
	(e: 'editRequested', payload: { id: string; role: string; content: string }): void;
	(e: 'rollbackRequested', payload: { id: string; content: string }): void;
}>();

const isUser = computed(() => props.message.role === 'user');
const proactiveScheduleActionSummary = computed(() => {
	const labels = (props.message.proactiveScheduleActionTypes ?? [])
		.map(type => {
			switch (type) {
				case 'create': return i18n.ts._agents.proactiveScheduleActionCreateLabel;
				case 'update': return i18n.ts._agents.proactiveScheduleActionUpdateLabel;
				case 'cancel': return i18n.ts._agents.proactiveScheduleActionCancelLabel;
			}
		})
		.filter((text): text is string => text != null);
	const failed = props.message.proactiveScheduleControlFailed === true;
	if (labels.length === 0) {
		return failed ? { text: i18n.ts._agents.proactiveScheduleActionUnknown, failed } : null;
	}
	const actions = labels.join('、');
	return {
		text: failed
			? i18n.tsx._agents.proactiveScheduleActionAttemptedSummary({ actions })
			: i18n.tsx._agents.proactiveScheduleActionSummary({ actions }),
		failed,
	};
});

const displayContent = computed(() => {
	let content = props.message.content ?? '';
	const role = props.message.role === 'user' ? 'user' : props.message.role === 'assistant' ? 'assistant' : null;
	if (!role) return content;
	for (const rule of props.regexRules ?? []) {
		if (!rule.targets.includes(role) || !rule.effects.includes('hide')) continue;
		try { content = content.replace(new RegExp(rule.pattern, 'gu'), ''); } catch { /* Invalid rules are ignored in the client too. */ }
	}
	return content;
});

const systemHtml = computed(() => renderAgentChatMarkdown(props.message.content ?? ''));
const AGENT_DRAW_RE = /\[\[agent_draw(?:\s+size=(portrait|landscape|square))?\s+tag=([\s\S]*?)\]\]/g;

type DrawResult = {
	id: string;
	messageId: string;
	placeholderIndex: number;
	status: 'pending' | 'generating' | 'succeeded' | 'failed' | 'blocked' | 'deleted' | 'auto_cleaned';
	fileId: string | null;
	url: string | null;
	file: DriveFile | null;
	errorCode: string | null;
	errorMessage: string | null;
	tag: string;
	size: 'portrait' | 'landscape' | 'square';
	isBlocked: boolean;
};

type RenderPart =
	| { type: 'text'; key: string; html: string }
	| { type: 'draw'; key: string; index: number; tag: string; size: 'portrait' | 'landscape' | 'square' };

const drawResults = reactive<Record<number, DrawResult | undefined>>({});

const displaySegmentContents = computed(() => {
	const content = displayContent.value;
	if (props.message.role !== 'assistant' || !props.segmentedOutputEnabled) return [content];
	const segments = splitAgentMessageIntoSegments(content);
	if (props.visibleSegmentCount == null) return segments;
	return segments.slice(0, Math.max(1, Math.min(segments.length, props.visibleSegmentCount)));
});

const renderedSegments = computed(() => {
	let drawOffset = 0;
	return displaySegmentContents.value.map((content, segmentIndex) => {
		const parts = renderParts(content, drawOffset);
		drawOffset += parts.filter(part => part.type === 'draw').length;
		return {
			key: `segment:${segmentIndex}`,
			content,
			parts,
			hasDraw: parts.some(part => part.type === 'draw'),
			drawOnly: parts.length === 1 && parts[0]?.type === 'draw',
		};
	});
});

function renderParts(text: string, drawOffset: number): RenderPart[] {
	const parts: RenderPart[] = [];
	let lastIndex = 0;
	let localDrawIndex = 0;
	for (const match of text.matchAll(AGENT_DRAW_RE)) {
		const start = match.index ?? 0;
		if (start > lastIndex) {
			parts.push({ type: 'text', key: `text:${lastIndex}`, html: renderAgentChatMarkdown(text.slice(lastIndex, start)) });
		}
		const size = match[1] === 'landscape' || match[1] === 'square' || match[1] === 'portrait' ? match[1] : 'portrait';
		parts.push({
			type: 'draw',
			key: `draw:${drawOffset + localDrawIndex}`,
			index: drawOffset + localDrawIndex,
			size,
			tag: String(match[2] ?? '').trim(),
		});
		localDrawIndex++;
		lastIndex = start + match[0].length;
	}
	if (lastIndex < text.length) {
		parts.push({ type: 'text', key: `text:${lastIndex}`, html: renderAgentChatMarkdown(text.slice(lastIndex)) });
	}
	return parts.length > 0 ? parts : [{ type: 'text', key: 'text:all', html: renderAgentChatMarkdown(text) }];
}

function drawState(index: number): DrawResult | undefined {
	return drawResults[index];
}

function shouldRefreshDrawState(current: DrawResult | undefined): boolean {
	return current == null || current.status === 'pending' || (current.status === 'failed' && current.errorCode === 'AGENT_IMAGE_FILE_REMOVED');
}

function isDrawBlocked(index: number): boolean {
	const s = drawResults[index];
	return s?.status === 'blocked' || s?.isBlocked === true || s?.file?.isAgentImageBlocked === true;
}

function drawFileList(index: number): DriveFile[] {
	if (isDrawBlocked(index)) return [];
	const file = drawResults[index]?.file;
	return file ? [file] : [];
}

function drawErrorText(code: string | null): string {
	switch (code) {
		case 'AGENT_IMAGE_NO_FREE_DRIVE_SPACE':
			return '网盘空间不足，无法保存生成图片';
		case 'AGENT_IMAGE_MAX_FILE_SIZE_EXCEEDED':
			return '图片超过账号允许的最大文件大小';
		case 'AGENT_IMAGE_UNALLOWED_FILE_TYPE':
			return '图片文件类型不允许上传';
		case 'AGENT_IMAGE_INSUFFICIENT_CREDIT':
			return '智能体额度不足';
		case 'AGENT_IMAGE_DISABLED':
			return '生图模型未启用';
		case null:
		case '':
			return '生成失败';
		default:
			return code;
	}
}

function drawStatusText(index: number): string {
	const s = drawState(index);
	if (!s || s.status === 'pending' || s.status === 'generating') return '图片生成中...';
	if (isDrawBlocked(index)) return '图片已被审核封禁';
	if (s.status === 'auto_cleaned') return '图片已自动清理';
	if (s.status === 'deleted') return '图片已删除';
	if (s.status === 'failed') return `生成失败：${drawErrorText(s.errorCode)}`;
	return '图片生成中...';
}

function drawErrorDiagnostic(index: number): string | null {
	const state = drawState(index);
	return state?.status === 'failed' && state.errorMessage ? state.errorMessage : null;
}

async function generateDraw(index: number, regenerate = false) {
	if (props.isSearchResult) return;
	const current = drawResults[index];
	if (!regenerate && !shouldRefreshDrawState(current)) return;
	drawResults[index] = {
		id: current?.id ?? `${props.message.id}:${index}`,
		messageId: props.message.id,
		placeholderIndex: index,
		status: 'generating',
		fileId: current?.fileId ?? null,
		url: current?.url ?? null,
		file: current?.file ?? null,
		errorCode: null,
		errorMessage: null,
		tag: current?.tag ?? '',
		size: current?.size ?? 'portrait',
		isBlocked: false,
	};
	try {
		const regenerationOfId = regenerate && current?.id && !current.id.includes(':') ? current.id : null;
		const res = await misskeyApi(
			'agents/images/generate-placeholder' as Parameters<typeof misskeyApi>[0],
			{
				sessionId: props.sessionId,
				messageId: props.message.id,
				placeholderIndex: index,
				regenerate,
				regenerationOfId,
			} as any,
		) as DrawResult;
		drawResults[index] = res;
	} catch (e) {
		drawResults[index] = {
			...drawResults[index]!,
			status: 'failed',
			file: null,
			errorCode: formatApiError(e),
			errorMessage: e != null && typeof e === 'object' && typeof (e as { info?: { diagnostic?: unknown } }).info?.diagnostic === 'string'
				? (e as { info: { diagnostic: string } }).info.diagnostic
				: null,
		};
	}
}

function regenerateDraw(index: number) {
	void generateDraw(index, true);
}

function startDraws() {
	if (props.message.role !== 'assistant' || props.isSearchResult) return;
	for (const segment of renderedSegments.value) {
		for (const part of segment.parts) {
			if (part.type === 'draw') void generateDraw(part.index, false);
		}
	}
}

onMounted(startDraws);
watch(() => `${props.message.id}:${props.message.content}`, () => {
	for (const key of Object.keys(drawResults)) delete drawResults[Number(key)];
	startDraws();
});
watch(() => props.visibleSegmentCount, startDraws);
watch(
	() => renderedSegments.value.flatMap(segment => segment.parts.filter(part => part.type === 'draw').map(part => part.index)).join(','),
	startDraws,
	{ flush: 'post' },
);

function onSearchResultClick(ev: MouseEvent) {
	if (!props.isSearchResult) return;
	const target = ev.target as HTMLElement;
	if (target.closest('a, button')) return;
	emit('navigate', props.message.id);
}

function menuItems(): MenuItem[] {
	const items: MenuItem[] = [{
		text: i18n.ts.copyContent,
		icon: 'ti ti-copy',
		action: () => {
			copyToClipboard(props.message.content ?? '');
		},
	}];
	if (props.message.role === 'user' && props.message.file) {
		items.push({
			text: i18n.ts._agents.imageRecognitionContent,
			icon: 'ti ti-eye',
			action: () => {
				void showImageRecognition();
			},
		});
	}
	if (!props.isSearchResult && (props.message.role === 'user' || props.message.role === 'assistant')) {
		items.push({
			text: i18n.ts.edit,
			icon: 'ti ti-pencil',
			action: () => {
				emit('editRequested', {
					id: props.message.id,
					role: props.message.role,
					content: props.message.content ?? '',
				});
			},
		});
	}
	if (!props.isSearchResult && props.message.role === 'user') {
		items.push({
			text: i18n.ts._agents.rollback,
			icon: 'ti ti-arrow-back-up',
			action: () => {
				emit('rollbackRequested', {
					id: props.message.id,
					content: props.message.content ?? '',
				});
			},
		});
	}
	items.push({ type: 'divider' });
	items.push({
		text: i18n.ts.delete,
		icon: 'ti ti-trash',
		danger: true,
		action: () => {
			void confirmDelete();
		},
	});
	return items;
}

async function showImageRecognition() {
	const description = props.message.imageRecognitionStatus === 'succeeded'
		? props.message.imageRecognitionDescription?.trim()
		: null;
	const text = description ?? i18n.ts._agents.imageRecognitionUnavailable;
	await os.alert({ type: 'info', title: i18n.ts._agents.imageRecognitionContentTitle, text });
}

function showMenu(ev: PointerEvent) {
	os.popupMenu(menuItems(), ev.currentTarget ?? ev.target);
}

function onContextmenu(ev: PointerEvent) {
	if (ev.target && isLink(ev.target as HTMLElement)) return;
	if (window.getSelection()?.toString() !== '') return;
	os.contextMenu(menuItems(), ev);
}

async function confirmDelete() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.deleteConfirm,
	});
	if (canceled) return;
	try {
		await misskeyApi('agents/messages/delete', {
			sessionId: props.sessionId,
			messageId: props.message.id,
		});
		emit('deleted', props.message.id);
		os.toast(i18n.ts.removed);
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}
</script>

<style lang="scss" module>
.systemRoot {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	padding: 8px 12px;
	margin: 0 auto;
	max-width: 90%;
	text-align: center;
	font-size: 85%;
	opacity: 0.72;

	&.clickable {
		cursor: pointer;
		transition: background-color 0.2s;

		&:hover {
			opacity: 0.95;
			background-color: var(--MI_THEME-panelHighlight);
			border-radius: 12px;
		}
	}
}

.systemText {
	white-space: pre-wrap;
	word-break: break-word;
}

.systemFooter {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: center;
	gap: 0.5em;
	margin-top: 2px;
	font-size: 75%;
}

.systemTime {
	opacity: 0.55;
	font-size: 90%;
}

.root {
	position: relative;
	display: flex;

	&.isMe {
		flex-direction: row-reverse;
		text-align: right;

		.footer {
			flex-direction: row-reverse;
		}
	}

	&.highlighted {
		animation: highlightBlink 1s ease-in-out 1;
		border-radius: 12px;
	}

	&.clickable {
		cursor: pointer;
		transition: background-color 0.2s;

		&:hover {
			background-color: var(--MI_THEME-panelHighlight);
			border-radius: 12px;
		}
	}
}

/* 与私信 XMessage 一致：定位后整行背景闪烁一次 */
@keyframes highlightBlink {
	0% {
		background-color: transparent;
	}
	5% {
		background-color: var(--MI_THEME-accentedBg);
	}
	95% {
		background-color: var(--MI_THEME-accentedBg);
	}
	100% {
		background-color: transparent;
	}
}

.avatar {
	display: block;
	width: 50px;
	height: 50px;

	&.useSticky {
		position: sticky;
		top: calc(16px + var(--MI-stickyTop, 0px));
	}
}

.assistantAvatar {
	flex-shrink: 0;
}

.assistantImg {
	width: 50px;
	height: 50px;
	border-radius: 999px;
	object-fit: cover;
	display: block;
}

.assistantFallback {
	width: 50px;
	height: 50px;
	border-radius: 999px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
	color: var(--MI_THEME-fg);
	font-size: 1.35em;
}

@container (max-width: 450px) {
	.root {
		&.isMe {
			.avatar {
				display: none;
			}
		}
	}

	.avatar {
		width: 42px;
		height: 42px;
	}

	.assistantImg,
	.assistantFallback {
		width: 42px;
		height: 42px;
	}

	.fukidashi {
		font-size: 90%;
	}
}

.body {
	margin: 0 12px;
	min-width: 0;
}

.header {
	min-height: 4px;
	font-size: 80%;
}

.fukidashi {
	text-align: left;
}

.drawFukidashi {
	width: 328px;
	max-width: 100%;
	box-sizing: border-box;
}

/* 附图消息不应由短文本决定宽度；媒体列表会继续按图片比例及自身高度上限渲染。 */
.imageFukidashi {
	width: 328px;
	max-width: 100%;
	box-sizing: border-box;
}

.drawSegmentContent {
	width: 300px;
	max-width: 100%;
	box-sizing: border-box;
}

.segmentStack {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
}

.isMe .segmentStack {
	align-items: flex-end;
}

/* GFM（marked）渲染：仅此处 v-html，样式用 :deep 作用于 sanitize 后的子节点 */
.mdRoot {
	max-width: 100%;
	font-size: 0.95em;
	line-height: 1.45;
	word-break: break-word;

	&:deep(p) {
		margin: 0.35em 0;

		&:first-child {
			margin-top: 0;
		}

		&:last-child {
			margin-bottom: 0;
		}
	}

	&:deep(h1),
	&:deep(h2),
	&:deep(h3),
	&:deep(h4),
	&:deep(h5),
	&:deep(h6) {
		margin: 0.5em 0 0.25em;
		font-weight: 700;
		line-height: 1.25;

		&:first-child {
			margin-top: 0;
		}
	}

	&:deep(h1) { font-size: 1.25em; }
	&:deep(h2) { font-size: 1.15em; }
	&:deep(h3) { font-size: 1.08em; }

	&:deep(ul),
	&:deep(ol) {
		margin: 0.35em 0;
		padding-left: 1.35em;
	}

	&:deep(li) {
		margin: 0.15em 0;
	}

	&:deep(blockquote) {
		margin: 0.35em 0;
		padding: 0.2em 0 0.2em 0.65em;
		border-left: 3px solid var(--MI_THEME-divider);
		color: var(--MI_THEME-fgTransparentWeak);
	}

	&:deep(hr) {
		margin: 0.6em 0;
		border: none;
		border-top: 1px solid var(--MI_THEME-divider);
	}

	&:deep(pre) {
		margin: 0.4em 0;
		padding: 0.5em 0.65em;
		overflow-x: auto;
		border-radius: 6px;
		background: color-mix(in srgb, var(--MI_THEME-panel) 92%, var(--MI_THEME-fg));
		font-size: 0.88em;
	}

	&:deep(code) {
		padding: 0.1em 0.35em;
		border-radius: 4px;
		background: color-mix(in srgb, var(--MI_THEME-panel) 88%, var(--MI_THEME-fg));
		font-size: 0.9em;
	}

	&:deep(pre code) {
		padding: 0;
		background: transparent;
		font-size: inherit;
	}

	&:deep(a) {
		color: var(--MI_THEME-link);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	&:deep(table) {
		margin: 0.4em 0;
		width: 100%;
		border-collapse: collapse;
		font-size: 0.92em;
	}

	&:deep(th),
	&:deep(td) {
		border: 1px solid var(--MI_THEME-divider);
		padding: 0.25em 0.45em;
	}

	&:deep(th) {
		background: color-mix(in srgb, var(--MI_THEME-panel) 80%, transparent);
	}

	&:deep(img) {
		max-width: 100%;
		height: auto;
		vertical-align: middle;
		border-radius: 4px;
	}

	&:deep(input[type="checkbox"]) {
		margin-right: 0.35em;
		vertical-align: middle;
		pointer-events: none;
	}
}

.footer {
	display: flex;
	flex-direction: row;
	gap: 0.5em;
	margin-top: 4px;
	font-size: 75%;
}

.proactiveScheduleActionSummary {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 0.35em;
	margin-top: 0.45em;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.58);
	font-size: 0.78em;
	line-height: 1.35;

	> i {
		flex: 0 0 auto;
	}
}

.proactiveScheduleActionFailed {
	padding-left: 0.45em;
	border-left: 1px solid color(from var(--MI_THEME-error) srgb r g b / 0.42);
	color: var(--MI_THEME-error);
	font-weight: 700;
	white-space: nowrap;
}

.attachedMedia {
	margin-bottom: 8px;
}

.time {
	opacity: 0.5;
}

.drawCard {
	position: relative;
	margin: 0.5em 0;
	width: min(100%, 300px);
	overflow: hidden;
	border-radius: 8px;
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 92%, var(--MI_THEME-bg));
}

.drawCardHead {
	position: absolute;
	top: 8px;
	right: 8px;
	left: 8px;
	z-index: 1;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	pointer-events: none;

	> span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-height: 28px;
		padding: 0 10px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--MI_THEME-panel) 88%, #000);
		color: var(--MI_THEME-fg);
		font-size: 0.82em;
		font-weight: 700;
		box-shadow: 0 6px 18px color-mix(in srgb, #000 20%, transparent);
	}
}

.drawRetry {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--MI_THEME-panel) 88%, #000);
	color: var(--MI_THEME-fg);
	box-shadow: 0 6px 18px color-mix(in srgb, #000 20%, transparent);
	pointer-events: auto;

	&:disabled {
		opacity: 0.5;
		cursor: wait;
	}
}

.drawImageWrap {
	display: block;
	max-width: min(100%, 300px);
	background: var(--MI_THEME-panel);
}

.drawMediaList {
	width: 100%;
}

.drawImage {
	display: block;
	width: 100%;
	max-height: 220px;
	object-fit: contain;
	background: var(--MI_THEME-panel);
}

.drawPending {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	gap: 10px;
	min-height: 180px;
	padding: 52px 18px 24px;
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: center;

	> i {
		font-size: 1.7em;
		color: var(--MI_THEME-accent);
	}
}

.drawErrorDiagnostic {
	max-width: 100%;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.85em;
	line-height: 1.45;
	white-space: pre-wrap;
	word-break: break-word;
}

.segmentEnterActive,
.segmentMove {
	transition: opacity 0.22s cubic-bezier(0,.5,.5,1), transform 0.22s cubic-bezier(0,.5,.5,1) !important;
}

.segmentEnterFrom {
	opacity: 0;
	transform: translateY(12px) scale(0.985);
}
</style>
