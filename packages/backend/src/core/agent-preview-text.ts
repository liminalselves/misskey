/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';

export type AgentPreviewTextOptions = {
	/** 保留换行（主动消息等需要正常换行的场景）；否则折叠为单行 */
	preserveNewlines?: boolean;
	/** 最大输出长度（超出截断并追加 …）；0 或不传为不限 */
	maxLength?: number;
};

type MfmNodeLike = {
	type: string;
	props?: Record<string, unknown>;
	children?: MfmNodeLike[];
};

function renderMfmTextNodes(nodes: MfmNodeLike[]): string {
	return nodes.map(node => {
		const props = node.props ?? {};
		if (node.children) return renderMfmTextNodes(node.children);
		switch (node.type) {
			case 'text': return typeof props.text === 'string' ? props.text : '';
			case 'unicodeEmoji': return typeof props.emoji === 'string' ? props.emoji : '';
			case 'mention': return typeof props.acct === 'string' ? props.acct : '';
			case 'hashtag': return typeof props.hashtag === 'string' ? `#${props.hashtag}` : '';
			case 'url': return typeof props.url === 'string' ? props.url : '';
			case 'inlineCode':
			case 'blockCode': return typeof props.code === 'string' ? props.code : '';
			case 'mathInline':
			case 'mathBlock': return typeof props.formula === 'string' ? props.formula : '';
			// 自定义表情名属于展示语法，不是正文
			case 'emojiCode': return '';
			default: return '';
		}
	}).join('');
}

/**
 * 过滤消息正文中的 MD / MFM / XML 及智能体自定义语法，输出最简纯文本用于预览。
 *
 * 移除规则：
 * - `[[agent_draw ...]]` / `[[agent_* ...]]` / `[[wb:...]]` 自定义指令标签（整体移除）
 * - XML/HTML 标签本身（如 `<proactive_message ...>` / `</proactive_message>`），保留标签间正文
 * - MFM 语法（`$[x2 ...]`、搜索、翻转等）→ 仅保留文本节点
 * - Markdown 格式字符（`` ` ``、`*`、`_`、`~`、`>`、`#`、`|` 等行首语法）
 *
 * 换行策略由 `preserveNewlines` 控制：
 * - true：保留换行（每行去除首尾空白，移除空行），用于主动消息等需要正常换行的展示
 * - false（默认）：所有空白折叠为单个空格，输出单行，用于列表/分段预览
 */
export function agentPreviewText(text: string, opts: AgentPreviewTextOptions = {}): string {
	if (text == null || text === '') return '';

	// 1. 移除智能体自定义指令标签（整体移除，内容为机器指令非正文）
	let t = text
		.replace(/\[\[agent_draw\b[\s\S]*?\]\]/giu, ' ')
		.replace(/\[\[(?:agent_[a-z_]+|wb:)[\s\S]*?\]\]/giu, ' ');

	// 2. 移除 XML/HTML 标签本身，保留标签之间的正文
	t = t.replace(/<\/?[a-zA-Z][a-zA-Z0-9_-]*(?:\s[^<>]*)?\/?>/gu, ' ');

	// 3. MFM 解析：仅提取文本节点（解析失败时回退原文继续后续清理）
	try {
		t = renderMfmTextNodes(mfm.parse(t) as unknown as MfmNodeLike[]);
	} catch {
		// 模型输出的畸形标记不应阻断预览生成
	}

	// 4. 移除残留 Markdown 格式字符
	t = t.replace(/[`*_~>#|]/gu, '');

	// 5. 换行策略
	if (opts.preserveNewlines) {
		t = t
			.split('\n')
			.map(line => line.replace(/[ \t\u3000]+/gu, ' ').trim())
			.filter(line => line.length > 0)
			.join('\n');
	} else {
		t = t.replace(/\s+/gu, ' ').trim();
	}

	// 6. 截断
	const max = opts.maxLength ?? 0;
	if (max > 0 && t.length > max) {
		t = `${t.slice(0, max)}…`;
	}
	return t;
}
