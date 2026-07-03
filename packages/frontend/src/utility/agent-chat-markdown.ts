/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 智能体会话气泡内：GFM 风格 Markdown → 安全 HTML（仅前端渲染，不入库、不经服务端）。
 * 使用 marked（gfm + breaks）生成 HTML，再用 sanitize-html 白名单过滤。
 */

import sanitizeHtml from 'sanitize-html';
import { marked } from 'marked';

const MARKED_OPTS = {
	gfm: true,
	breaks: true,
	silent: true,
} as const;

const SANITIZE_OPTS: sanitizeHtml.IOptions = {
	allowedTags: [
		'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
		'p', 'br', 'hr',
		'strong', 'em', 'del', 's',
		'blockquote',
		'ul', 'ol', 'li',
		'table', 'thead', 'tbody', 'tr', 'th', 'td',
		'pre', 'code',
		'a', 'img',
		'input',
	],
	allowedAttributes: {
		a: ['href', 'title'],
		img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
		code: ['class'],
		pre: ['class'],
		input: ['type', 'disabled', 'checked'],
		th: ['align', 'colspan', 'rowspan'],
		td: ['align', 'colspan', 'rowspan'],
	},
	allowedSchemes: ['http', 'https', 'mailto'],
	allowedSchemesByTag: {
		img: ['http', 'https'],
	},
	allowProtocolRelative: false,
	// 外链新窗口 + 反钓鱼
	transformTags: {
		'a': (_tagName, attribs) => {
			const href = attribs.href ?? '';
			const isHttp = /^https?:\/\//i.test(href);
			return {
				tagName: 'a',
				attribs: {
					...attribs,
					rel: 'nofollow noopener noreferrer',
					...(isHttp ? { target: '_blank' } : {}),
				},
			};
		},
	},
};

/**
 * 将 Markdown 转为可安全插入 DOM 的 HTML 字符串。
 */
export function renderAgentChatMarkdown(markdown: string): string {
	const src = markdown.trim();
	if (src === '') return '';

	let html: string;
	try {
		html = marked.parse(src, { ...MARKED_OPTS, async: false }) as string;
	} catch {
		return sanitizeHtml(
			`<p>${escapeHtmlPlain(markdown).replace(/\n/g, '<br>')}</p>`,
			{ allowedTags: ['p', 'br'], allowedAttributes: {} },
		);
	}

	return sanitizeHtml(html, SANITIZE_OPTS);
}

function escapeHtmlPlain(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
