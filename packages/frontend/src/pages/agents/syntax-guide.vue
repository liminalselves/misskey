<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions">
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div class="_gaps">
			<MkInfo>{{ i18n.ts._agents.syntaxGuideDescription }}</MkInfo>
			<MkInfo warn>{{ i18n.ts._agents.syntaxGuideScopeNote }}</MkInfo>

			<!-- Markdown (GFM) -->
			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-markdown"></i></template>
				<template #label>{{ i18n.ts._agents.syntaxGuideMarkdownSection }}</template>
				<div class="_gaps_s">
					<div :class="$style.intro">{{ i18n.ts._agents.syntaxGuideMarkdownIntro }}</div>
					<div :class="$style.intro">{{ i18n.ts._agents.syntaxGuideHtmlNote }}</div>

					<div :class="$style.table">
						<div :class="[$style.row, $style.head]">
							<div :class="$style.cellSyntax">{{ i18n.ts._agents.syntaxGuideColSyntax }}</div>
							<div :class="$style.cellPreview">{{ i18n.ts._agents.syntaxGuideColPreview }}</div>
						</div>
						<div v-for="(ex, i) in markdownExamples" :key="`md-${i}`" :class="$style.row">
							<div :class="$style.cellSyntax"><pre :class="$style.code">{{ ex }}</pre></div>
							<!-- eslint-disable-next-line vue/no-v-html -->
							<div :class="[$style.cellPreview, $style.mdPreview]" v-html="renderMd(ex)"></div>
						</div>
					</div>

					<MkLink url="https://github.github.com/gfm/">{{ i18n.ts._agents.syntaxGuideOpenSpec }}</MkLink>
				</div>
			</MkFolder>

			<!-- MFM -->
			<MkFolder :defaultOpen="false">
				<template #icon><i class="ti ti-sparkles"></i></template>
				<template #label>{{ i18n.ts._agents.syntaxGuideMfmSection }}</template>
				<div class="_gaps_s">
					<div :class="$style.intro">{{ i18n.ts._agents.syntaxGuideMfmIntro }}</div>

					<div :class="$style.table">
						<div :class="[$style.row, $style.head]">
							<div :class="$style.cellSyntax">{{ i18n.ts._agents.syntaxGuideColSyntax }}</div>
							<div :class="$style.cellPreview">{{ i18n.ts._agents.syntaxGuideColPreview }}</div>
						</div>
						<div v-for="(ex, i) in mfmExamples" :key="`mfm-${i}`" :class="$style.row">
							<div :class="$style.cellSyntax"><pre :class="$style.code">{{ ex }}</pre></div>
							<div :class="$style.cellPreview"><Mfm :text="ex" :nyaize="'respect'"/></div>
						</div>
					</div>

					<MkLink url="https://misskey-hub.net/en/docs/for-users/features/mfm/">{{ i18n.ts._agents.syntaxGuideOpenSpec }}</MkLink>
				</div>
			</MkFolder>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkLink from '@/components/MkLink.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { renderAgentChatMarkdown } from '@/utility/agent-chat-markdown.js';
import type { PageHeaderItem } from '@/types/page-header.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import * as os from '@/os.js';

const markdownExamples = [
	'# 标题 / Heading\n## 二级标题',
	'**加粗**、*斜体*、~~删除线~~、`行内代码`',
	'- 无序列表项 1\n- 无序列表项 2\n  - 嵌套项',
	'1. 有序列表\n2. 第二项',
	'> 引用块\n> 第二行',
	'[链接文字](https://example.com)',
	'| 列 A | 列 B |\n| --- | --- |\n| 1 | 2 |',
	'```js\nconst x = 1;\nconsole.log(x);\n```',
	'- [x] 已完成\n- [ ] 未完成',
	'第一行\n第二行（软换行）',
	'<b>安全的 HTML</b> 会保留，<script>alert(1)<\/script> 会被移除',
];

const mfmExamples = [
	'$[x2 放大]',
	'$[spin 旋转] $[jelly 果冻] $[shake 抖动]',
	'$[bg.color=f00 背景色] $[fg.color=00f 前景色]',
	'**MFM 也支持加粗** 和 `行内代码`',
	'> MFM 引用',
	'?[隐藏链接](https://example.com)',
	':emoji: 自定义表情（示例占位）',
];

function renderMd(src: string): string {
	return renderAgentChatMarkdown(src);
}

const headerActions = computed<PageHeaderItem[]>(() => [
	{
		icon: 'ti ti-clipboard',
		text: i18n.ts.copy,
		handler: () => {
			copyToClipboard(markdownExamples.join('\n\n'));
			os.success();
		},
	},
]);

definePage(() => ({
	title: i18n.ts._agents.syntaxGuide,
	icon: 'ti ti-help-circle',
}));
</script>

<style lang="scss" module>
.intro {
	font-size: 0.92em;
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.5;
}

.table {
	display: flex;
	flex-direction: column;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 8px;
	overflow: hidden;
}

.row {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	border-top: 1px solid var(--MI_THEME-divider);

	&:first-child {
		border-top: none;
	}

	&.head {
		font-weight: 700;
		background: color-mix(in srgb, var(--MI_THEME-panel) 80%, transparent);
		font-size: 0.9em;
	}
}

.cellSyntax,
.cellPreview {
	padding: 10px 12px;
	min-width: 0;
}

.cellSyntax {
	border-right: 1px solid var(--MI_THEME-divider);
}

.code {
	margin: 0;
	white-space: pre-wrap;
	word-break: break-word;
	font-size: 0.85em;
	font-family: var(--MI-fontMono, monospace);
	color: var(--MI_THEME-fg);
}

.mdPreview {
	font-size: 0.92em;
	line-height: 1.45;
	word-break: break-word;

	&:deep(p) {
		margin: 0.3em 0;

		&:first-child { margin-top: 0; }
		&:last-child { margin-bottom: 0; }
	}

	&:deep(h1),
	&:deep(h2),
	&:deep(h3) {
		margin: 0.3em 0 0.2em;
		font-weight: 700;

		&:first-child { margin-top: 0; }
	}

	&:deep(h1) { font-size: 1.2em; }
	&:deep(h2) { font-size: 1.1em; }

	&:deep(ul),
	&:deep(ol) {
		margin: 0.3em 0;
		padding-left: 1.3em;
	}

	&:deep(blockquote) {
		margin: 0.3em 0;
		padding-left: 0.6em;
		border-left: 3px solid var(--MI_THEME-divider);
		color: var(--MI_THEME-fgTransparentWeak);
	}

	&:deep(pre) {
		margin: 0.3em 0;
		padding: 0.5em 0.6em;
		overflow-x: auto;
		border-radius: 6px;
		background: color-mix(in srgb, var(--MI_THEME-panel) 92%, var(--MI_THEME-fg));
		font-size: 0.9em;
	}

	&:deep(code) {
		padding: 0.1em 0.3em;
		border-radius: 4px;
		background: color-mix(in srgb, var(--MI_THEME-panel) 88%, var(--MI_THEME-fg));
		font-size: 0.9em;
	}

	&:deep(pre code) {
		padding: 0;
		background: transparent;
	}

	&:deep(table) {
		border-collapse: collapse;
		font-size: 0.9em;
	}

	&:deep(th),
	&:deep(td) {
		border: 1px solid var(--MI_THEME-divider);
		padding: 0.2em 0.4em;
	}

	&:deep(a) {
		color: var(--MI_THEME-link);
		text-decoration: underline;
	}
}

@container (max-width: 500px) {
	.row {
		grid-template-columns: 1fr;
	}

	.cellSyntax {
		border-right: none;
		border-bottom: 1px solid var(--MI_THEME-divider);
	}
}
</style>
