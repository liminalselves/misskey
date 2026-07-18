/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 智能体会话气泡内：GFM 风格 Markdown → 安全 HTML（仅前端渲染，不入库、不经服务端）。
 * 使用 marked（gfm + breaks）生成 HTML，再由浏览器侧白名单过滤。
 */

import { marked } from 'marked';

const MARKED_OPTS = {
	gfm: true,
	breaks: true,
	silent: true,
} as const;

const ALLOWED_TAGS = new Set([
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'p', 'br', 'hr',
	'strong', 'em', 'del', 's',
	'blockquote',
	'ul', 'ol', 'li',
	'table', 'thead', 'tbody', 'tr', 'th', 'td',
	'pre', 'code',
	'a', 'img', 'input',
]);

const DROP_WITH_CONTENT_TAGS = new Set([
	'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base',
	'svg', 'math', 'form', 'button', 'textarea', 'select', 'option',
]);

const TABLE_ALIGNMENTS = new Set(['left', 'right', 'center', 'justify']);

function sanitizeAgentHtml(html: string): string {
	const template = window.document.createElement('template');
	template.innerHTML = html;
	for (const node of Array.from(template.content.childNodes)) {
		sanitizeNode(node);
	}
	return template.innerHTML;
}

function sanitizeNode(node: Node): void {
	if (node.nodeType === Node.COMMENT_NODE) {
		node.parentNode?.removeChild(node);
		return;
	}
	if (node.nodeType !== Node.ELEMENT_NODE) return;

	const element = node as HTMLElement;
	const tag = element.tagName.toLowerCase();
	if (!ALLOWED_TAGS.has(tag)) {
		if (DROP_WITH_CONTENT_TAGS.has(tag)) {
			element.remove();
			return;
		}
		for (const child of Array.from(element.childNodes)) sanitizeNode(child);
		element.replaceWith(...Array.from(element.childNodes));
		return;
	}

	sanitizeAttributes(element, tag);
	for (const child of Array.from(element.childNodes)) {
		sanitizeNode(child);
	}
}

function sanitizeAttributes(element: HTMLElement, tag: string): void {
	for (const attribute of Array.from(element.attributes)) {
		if (!isAllowedAttribute(tag, attribute.name, attribute.value)) {
			element.removeAttribute(attribute.name);
		}
	}

	if (tag === 'a') {
		const href = element.getAttribute('href');
		if (!href || !isSafeUrl(href, new Set(['http', 'https', 'mailto']))) {
			element.removeAttribute('href');
			element.removeAttribute('title');
			return;
		}
		element.setAttribute('rel', 'nofollow noopener noreferrer');
		if (/^https?:\/\//i.test(href)) element.setAttribute('target', '_blank');
	}

	if (tag === 'img') {
		const src = element.getAttribute('src');
		if (!src || !isSafeUrl(src, new Set(['http', 'https']))) {
			element.remove();
			return;
		}
	}

	if (tag === 'input') {
		if (element.getAttribute('type') !== 'checkbox') element.remove();
	}
}

function isAllowedAttribute(tag: string, name: string, value: string): boolean {
	if (tag === 'a') return name === 'href' || name === 'title';
	if (tag === 'img') {
		if (name === 'src' || name === 'alt' || name === 'title') return true;
		if (name === 'loading') return value === 'lazy' || value === 'eager' || value === 'auto';
		return (name === 'width' || name === 'height') && /^\d{1,4}$/.test(value);
	}
	if (tag === 'code' || tag === 'pre') {
		return name === 'class' && value.split(/\s+/).every(className => /^language-[\w-]+$/.test(className));
	}
	if (tag === 'input') return name === 'type' || name === 'disabled' || name === 'checked';
	if (tag === 'th' || tag === 'td') {
		if (name === 'align') return TABLE_ALIGNMENTS.has(value.toLowerCase());
		return (name === 'colspan' || name === 'rowspan') && /^\d{1,3}$/.test(value);
	}
	return false;
}

function isSafeUrl(value: string, schemes: Set<string>): boolean {
	const raw = value.trim();
	if (raw === '' || raw.startsWith('//')) return false;
	try {
		const url = new URL(raw, window.location.href);
		return schemes.has(url.protocol.slice(0, -1).toLowerCase());
	} catch {
		return false;
	}
}

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
		return `<p>${escapeHtmlPlain(markdown).replace(/\n/g, '<br>')}</p>`;
	}

	return sanitizeAgentHtml(html);
}

function escapeHtmlPlain(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
