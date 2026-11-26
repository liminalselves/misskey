/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { tokenizeInlineMarkdown } from './inline-markdown.js';
import type { InlineMarkdownToken } from './inline-markdown.js';

export type { InlineMarkdownToken };

export type ClientPlatform = 'android' | 'ios' | 'desktop' | 'unknown';

export type ReleaseSectionKind = 'add' | 'imp' | 'fix' | 'other';

export type ParsedReleaseBlock =
	| { type: 'paragraph'; tokens: InlineMarkdownToken[] }
	| { type: 'list'; items: InlineMarkdownToken[][] };

export type ParsedReleaseSection = {
	title: string;
	kind: ReleaseSectionKind;
	blocks: ParsedReleaseBlock[];
};

export type ParsedReleaseNotes = {
	minVersion: string | null;
	summary: ParsedReleaseBlock[];
	sections: ParsedReleaseSection[];
};

const MIN_VERSION_COMMENT_RE = /<!--\s*min-version:\s*v?(\d+\.\d+\.\d+)\s*-->/i;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const NOISE_LINE_RE = /^\*\*Full Changelog\*\*|^##\s+What's Changed\b|^##\s+New Contributors\b/i;
const NOISE_ITEM_RE = /^[-*]\s+(?:.* by @\S+|@\S+\s+made their first contribution) in https?:\/\/\S+$/;
const NEW_CONTRIBUTORS_HEADING_RE = /^#{2,4}\s+New Contributors\b/i;
const HEADING_RE = /^#{2,4}\s+(.*)$/;
const LIST_ITEM_RE = /^[-*]\s+(.*)$/;

function detectSectionKind(title: string): ReleaseSectionKind {
	if (/新增|feature/i.test(title)) return 'add';
	if (/变更|改进|优化|change|improve/i.test(title)) return 'imp';
	if (/修复|fix/i.test(title)) return 'fix';
	return 'other';
}

function parseBlocks(lines: string[]): ParsedReleaseBlock[] {
	const blocks: ParsedReleaseBlock[] = [];
	let para: string[] = [];
	let list: InlineMarkdownToken[][] = [];

	const flushPara = () => {
		if (para.length > 0) {
			blocks.push({ type: 'paragraph', tokens: tokenizeInlineMarkdown(para.join(' ')) });
			para = [];
		}
	};

	const flushList = () => {
		if (list.length > 0) {
			blocks.push({ type: 'list', items: list });
			list = [];
		}
	};

	for (const line of lines) {
		if (line === '') {
			flushPara();
			flushList();
			continue;
		}
		const itemMatch = LIST_ITEM_RE.exec(line);
		if (itemMatch) {
			flushPara();
			const content = itemMatch[1].trim();
			if (content.length > 0) {
				list.push(tokenizeInlineMarkdown(content));
			}
			continue;
		}
		flushList();
		para.push(line);
	}

	flushPara();
	flushList();
	return blocks;
}

/**
 * 解析 GitHub Release Markdown 为结构化块与行内 token，供 Vue 模板安全渲染（不使用 v-html）。
 */
export function parseReleaseNotes(markdown: string | null | undefined): ParsedReleaseNotes {
	const raw = typeof markdown === 'string' ? markdown : '';
	const minVersionMatch = MIN_VERSION_COMMENT_RE.exec(raw);
	const minVersion = minVersionMatch ? minVersionMatch[1] : null;
	const cleaned = raw.replace(HTML_COMMENT_RE, '');

	const lines: string[] = [];
	let inNewContributors = false;
	for (const rawLine of cleaned.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (NEW_CONTRIBUTORS_HEADING_RE.test(line)) {
			inNewContributors = true;
			continue;
		}
		if (HEADING_RE.test(line)) {
			inNewContributors = false;
		}
		if (inNewContributors) continue;
		if (NOISE_LINE_RE.test(line) || NOISE_ITEM_RE.test(line)) continue;
		lines.push(line);
	}

	const summaryLines: string[] = [];
	const rawSections: Array<{ title: string; lines: string[] }> = [];
	let currentSection: { title: string; lines: string[] } | null = null;

	for (const line of lines) {
		const headingMatch = HEADING_RE.exec(line);
		if (headingMatch) {
			const title = headingMatch[1].trim();
			if (title.length > 0) {
				currentSection = { title, lines: [] };
				rawSections.push(currentSection);
				continue;
			}
		}
		if (currentSection) {
			currentSection.lines.push(line);
		} else {
			summaryLines.push(line);
		}
	}

	const summary = parseBlocks(summaryLines);
	const sections: ParsedReleaseSection[] = rawSections
		.map((sec) => ({
			title: sec.title,
			kind: detectSectionKind(sec.title),
			blocks: parseBlocks(sec.lines),
		}))
		.filter((sec) => sec.blocks.length > 0);

	return {
		minVersion,
		summary,
		sections,
	};
}

/**
 * 根据 UA 与触控点数识别访问者平台。
 */
export function detectClientPlatform(ua: string, maxTouchPoints = 0): ClientPlatform {
	const text = typeof ua === 'string' ? ua : '';
	if (!text) return 'unknown';

	if (/Android/i.test(text)) return 'android';
	if (/iPhone|iPod|iPad/i.test(text)) return 'ios';
	if (/Macintosh/i.test(text) && maxTouchPoints > 1) return 'ios';
	if (/HarmonyOS|OpenHarmony/i.test(text)) return 'unknown';
	if (/Windows|Macintosh|Mac OS X|CrOS|Linux|X11/i.test(text)) return 'desktop';
	return 'unknown';
}

export function formatBytes(bytes: number | null | undefined): string {
	if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
	if (bytes < 1024) return `${Math.round(bytes)} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatReleaseDate(iso: string | null | undefined): string {
	const raw = typeof iso === 'string' ? iso.trim() : '';
	if (!raw) return '';
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
	if (match) {
		return `${match[1]} 年 ${Number(match[2])} 月 ${Number(match[3])} 日`;
	}
	const parsed = new Date(raw);
	if (Number.isNaN(parsed.getTime())) return '';
	return `${parsed.getUTCFullYear()} 年 ${parsed.getUTCMonth() + 1} 月 ${parsed.getUTCDate()} 日`;
}

export function shortenSha256(sha256: string | null | undefined): string {
	const raw = typeof sha256 === 'string' ? sha256.trim() : '';
	if (!raw) return '';
	if (raw.length <= 24) return raw;
	return `${raw.slice(0, 12)}…${raw.slice(-8)}`;
}

export function isSafeHttpUrl(url: string | null | undefined): url is string {
	const raw = typeof url === 'string' ? url.trim() : '';
	if (!raw || !URL.canParse(raw)) return false;
	const parsed = new URL(raw);
	return parsed.protocol === 'https:' || parsed.protocol === 'http:';
}
