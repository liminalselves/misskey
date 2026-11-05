/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 解析 CHANGELOG.md，只保留本 fork 的发布段（`## <上游基线>-liminalselves.<N>`）。
 * 兼容历史上出现过的三种写法：
 * - `### 修复` 这类三级标题分组；
 * - 「修复」单独成行的纯文本分组；
 * - 上游风格的 `- Enhance:` / `- Fix:` 前缀条目，可带缩进子条目。
 * 分组外的普通行作为段首说明（如「合并上游至 X」「部署须执行迁移…」）。
 */

export type ForkChangelogKind = 'feature' | 'improve' | 'change' | 'fix' | 'other';

export type ForkChangelogItem = {
	/** 行内 Markdown 原文（`代码`、[链接](url)、**加粗**） */
	text: string;
	/** 由 Enhance:/Fix: 等前缀识别出的类型；无前缀时为 null，跟随分组 */
	kind: ForkChangelogKind | null;
	/** 缩进子条目 */
	children: string[];
};

export type ForkChangelogGroup = {
	title: string;
	kind: ForkChangelogKind;
	items: ForkChangelogItem[];
};

export type ForkChangelogRelease = {
	/** 完整版本号，如 2026.10.0-liminalselves.1 */
	version: string;
	/** 上游基线版本，如 2026.10.0 */
	baseVersion: string;
	/** 该基线上的第几次发布 */
	forkRevision: number;
	notes: string[];
	groups: ForkChangelogGroup[];
};

const FORK_VERSION_RE = /^(\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?)-liminalselves\.(\d+)$/;
const PLAIN_GROUP_TITLES = ['新增', '更新', '优化', '调整', '修复', '移除', '安全', '其他'];
const NOTES_GROUP_TITLE = '更新内容';

const PREFIX_KINDS: Record<string, ForkChangelogKind> = {
	feat: 'feature',
	feature: 'feature',
	new: 'feature',
	enhance: 'improve',
	improve: 'improve',
	change: 'change',
	fix: 'fix',
	security: 'fix',
};

export function groupKindOf(title: string): ForkChangelogKind {
	if (/新增|新功能|上线|更新|feature/i.test(title)) return 'feature';
	if (/优化|改进|improve|enhance/i.test(title)) return 'improve';
	if (/调整|变更|移除|change/i.test(title)) return 'change';
	if (/修复|安全|fix|security/i.test(title)) return 'fix';
	return 'other';
}

function isHashtagLine(line: string): boolean {
	// 发布帖用的话题标签链接，对页面阅读无意义
	return /^\[#[^\]]+\]\([^)]+\)$/.test(line);
}

/** 部署、迁移须知只面向运维，不在用户页展示 */
export function isOperatorOnlyText(text: string): boolean {
	return /^部署/.test(text) || /(数据库)?迁移[：:]/.test(text) || /执行(数据库)?迁移/.test(text);
}

function parseItem(text: string): ForkChangelogItem {
	const prefix = /^([A-Za-z]+):\s*(.+)$/.exec(text);
	const kind = prefix != null ? PREFIX_KINDS[prefix[1].toLowerCase()] : undefined;
	return { text: kind != null ? prefix![2].trim() : text, kind: kind ?? null, children: [] };
}

export function parseForkChangelog(markdown: string): ForkChangelogRelease[] {
	const releases: ForkChangelogRelease[] = [];
	const sections = markdown.replace(/\r\n?/g, '\n').split(/^## /m).slice(1);
	for (const section of sections) {
		const newline = section.indexOf('\n');
		const version = (newline === -1 ? section : section.slice(0, newline)).trim();
		const match = FORK_VERSION_RE.exec(version);
		if (match == null) continue;

		const release: ForkChangelogRelease = {
			version,
			baseVersion: match[1],
			forkRevision: Number(match[2]),
			notes: [],
			groups: [],
		};
		let group: ForkChangelogGroup | null = null;
		let lastItem: ForkChangelogItem | null = null;
		const openGroup = (title: string, kind: ForkChangelogKind = groupKindOf(title)): ForkChangelogGroup => {
			const created: ForkChangelogGroup = { title, kind, items: [] };
			release.groups.push(created);
			lastItem = null;
			return created;
		};

		for (const raw of (newline === -1 ? '' : section.slice(newline + 1)).split('\n')) {
			const line = raw.replace(/\s+$/, '');
			const trimmed = line.trim();
			if (trimmed === '' || isHashtagLine(trimmed)) continue;

			const heading = /^#{3,6}\s+(.+)$/.exec(trimmed);
			if (heading != null) {
				group = openGroup(heading[1].trim());
				continue;
			}
			if (PLAIN_GROUP_TITLES.includes(trimmed)) {
				group = openGroup(trimmed);
				continue;
			}

			const indented = /^(\s{2,}|\t)/.test(line);
			const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
			if (bullet != null && !indented) {
				group ??= openGroup(NOTES_GROUP_TITLE, 'other');
				lastItem = parseItem(bullet[1].trim());
				group.items.push(lastItem);
				continue;
			}
			if (lastItem != null && (indented || bullet != null)) {
				const current: ForkChangelogItem = lastItem;
				const text = (bullet != null ? bullet[1] : trimmed).trim();
				if (bullet != null || current.children.length === 0) current.children.push(text);
				else current.children[current.children.length - 1] += ` ${text}`;
				continue;
			}
			// 「- 部署须执行迁移…」之外的普通段落：属于段首说明
			lastItem = null;
			release.notes.push(trimmed);
		}
		release.notes = release.notes.filter(n => !isOperatorOnlyText(n));
		for (const g of release.groups) {
			g.items = g.items.filter(i => !isOperatorOnlyText(i.text));
			for (const i of g.items) i.children = i.children.filter(c => !isOperatorOnlyText(c));
		}
		release.groups = release.groups.filter(g => g.items.length > 0);
		releases.push(release);
	}
	return releases;
}
