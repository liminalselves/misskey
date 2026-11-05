/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 更新日志用的行内 Markdown 子集：`代码`、**加粗**、[文字](https://…)。
 * 只产出文本片段，由模板逐段渲染，不经 v-html，因而不存在注入面。
 */
export type InlineMarkdownToken =
	| { type: 'text'; text: string }
	| { type: 'code'; text: string }
	| { type: 'strong'; text: string }
	| { type: 'link'; text: string; href: string };

const INLINE_RE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

export function tokenizeInlineMarkdown(source: string): InlineMarkdownToken[] {
	const tokens: InlineMarkdownToken[] = [];
	let last = 0;
	for (const m of source.matchAll(INLINE_RE)) {
		const index = m.index;
		if (index > last) tokens.push({ type: 'text', text: source.slice(last, index) });
		if (m[1] != null) tokens.push({ type: 'code', text: m[1] });
		else if (m[2] != null) tokens.push({ type: 'strong', text: m[2] });
		else tokens.push({ type: 'link', text: m[3], href: m[4] });
		last = index + m[0].length;
	}
	if (last < source.length) tokens.push({ type: 'text', text: source.slice(last) });
	return tokens;
}
