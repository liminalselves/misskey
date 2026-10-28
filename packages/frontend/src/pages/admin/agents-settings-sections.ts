/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 智能体管理页的分区与保存契约：
 * - 每个表单字段只属于一个保存分区，保存时只校验、只提交有改动的分区（避免一处脏数据阻断其他页的保存，也避免整份配置重写）；
 * - 页面导航为「分组 → 子页」两级，view query 只记录子页 key（旧链接 ?view=images 等保持可用）。
 */

export type SaveSection =
	| 'basic'
	| 'models'
	| 'memory'
	| 'compression'
	| 'externalAudit'
	| 'images'
	| 'sticker'
	| 'pet'
	| 'vision'
	| 'credits'
	| 'checkin'
	| 'proactive';

export type LeafKey =
	| 'overview'
	| 'basic'
	| 'models'
	| 'byok'
	| 'announcements'
	| 'images'
	| 'vision'
	| 'sticker'
	| 'pet'
	| 'memory'
	| 'compression'
	| 'proactive'
	| 'externalAudit'
	| 'externalAuditRules'
	| 'externalAuditReview'
	| 'externalAuditStats'
	| 'credits'
	| 'checkin'
	| 'migration'
	| 'reports';

export type GroupKey = 'overview' | 'basic' | 'models' | 'capabilities' | 'conversation' | 'externalAudit' | 'credits' | 'reports';

export type LeafDef = { key: LeafKey; title: string; icon: string; sections: SaveSection[] };
export type GroupDef = { key: GroupKey; title: string; icon: string; leaves: LeafDef[] };

export const settingsGroups: GroupDef[] = [
	{ key: 'overview', title: '总览', icon: 'ti ti-dashboard', leaves: [
		{ key: 'overview', title: '总览', icon: 'ti ti-dashboard', sections: [] },
	] },
	{ key: 'basic', title: '基础', icon: 'ti ti-toggle-right', leaves: [
		{ key: 'basic', title: '基础', icon: 'ti ti-toggle-right', sections: ['basic'] },
	] },
	{ key: 'models', title: '模型', icon: 'ti ti-cpu', leaves: [
		{ key: 'models', title: '对话模型', icon: 'ti ti-message-dots', sections: ['models'] },
		{ key: 'images', title: '绘图模型', icon: 'ti ti-brush', sections: ['images'] },
		{ key: 'byok', title: 'BYOK', icon: 'ti ti-key', sections: ['models'] },
		{ key: 'announcements', title: '公告', icon: 'ti ti-speakerphone', sections: [] },
	] },
	{ key: 'capabilities', title: '能力', icon: 'ti ti-sparkles', leaves: [
		{ key: 'vision', title: '识图', icon: 'ti ti-eye', sections: ['vision'] },
		{ key: 'sticker', title: '表情包', icon: 'ti ti-sticker', sections: ['sticker'] },
		{ key: 'pet', title: '桌宠', icon: 'ti ti-paw', sections: ['pet'] },
	] },
	{ key: 'conversation', title: '行为', icon: 'ti ti-message-chatbot', leaves: [
		{ key: 'memory', title: '长期记忆', icon: 'ti ti-brain', sections: ['memory'] },
		{ key: 'compression', title: '压缩', icon: 'ti ti-file-zip', sections: ['compression'] },
		{ key: 'proactive', title: '主动消息', icon: 'ti ti-message-chatbot', sections: ['proactive'] },
	] },
	{ key: 'externalAudit', title: '外审', icon: 'ti ti-shield-check', leaves: [
		{ key: 'externalAudit', title: '模型与参数', icon: 'ti ti-adjustments', sections: ['externalAudit'] },
		{ key: 'externalAuditRules', title: '违规条目', icon: 'ti ti-list-check', sections: ['externalAudit'] },
		{ key: 'externalAuditReview', title: '复审触发', icon: 'ti ti-shield-exclamation', sections: ['externalAudit'] },
		{ key: 'externalAuditStats', title: '运行统计', icon: 'ti ti-chart-bar', sections: [] },
	] },
	{ key: 'credits', title: '额度', icon: 'ti ti-ticket', leaves: [
		{ key: 'credits', title: '卡密与签发', icon: 'ti ti-ticket', sections: ['credits'] },
		{ key: 'checkin', title: '签到', icon: 'ti ti-calendar-check', sections: ['checkin'] },
		{ key: 'migration', title: '迁移', icon: 'ti ti-transfer', sections: [] },
	] },
	{ key: 'reports', title: '报表', icon: 'ti ti-report-analytics', leaves: [
		{ key: 'reports', title: '报表', icon: 'ti ti-report-analytics', sections: [] },
	] },
];

export const leafKeys: LeafKey[] = settingsGroups.flatMap(g => g.leaves.map(l => l.key));

export function resolveLeaf(view: string | null | undefined): LeafKey {
	return leafKeys.includes(view as LeafKey) ? view as LeafKey : 'overview';
}

export function groupOfLeaf(leaf: LeafKey): GroupDef {
	return settingsGroups.find(g => g.leaves.some(l => l.key === leaf)) ?? settingsGroups[0];
}

export function leafDef(leaf: LeafKey): LeafDef {
	return groupOfLeaf(leaf).leaves.find(l => l.key === leaf)!;
}

export const saveSectionLabels: Record<SaveSection, string> = {
	basic: '基础',
	models: '对话模型',
	memory: '长期记忆',
	compression: '压缩',
	externalAudit: '外审',
	images: '绘图模型',
	sticker: '表情包',
	pet: '桌宠',
	vision: '识图',
	credits: '额度',
	checkin: '签到',
	proactive: '主动消息',
};

/** 保存分区的默认落点子页（校验失败跳转、保存栏「前往」用） */
export const saveSectionHomeLeaf: Record<SaveSection, LeafKey> = {
	basic: 'basic',
	models: 'models',
	memory: 'memory',
	compression: 'compression',
	externalAudit: 'externalAudit',
	images: 'images',
	sticker: 'sticker',
	pet: 'pet',
	vision: 'vision',
	credits: 'credits',
	checkin: 'checkin',
	proactive: 'proactive',
};

const sectionPrefixes: [string, SaveSection][] = [
	['agentLlmModel', 'models'],
	['agentDefaultModelId', 'models'],
	['agentByok', 'models'],
	['agentMem0', 'memory'],
	['agentCompression', 'compression'],
	['agentExternalAudit', 'externalAudit'],
	['agentReviewTriggerRules', 'externalAudit'],
	['agentImage', 'images'],
	['agentSticker', 'sticker'],
	['agentEmojiPrompt', 'sticker'],
	['agentPerformance', 'pet'],
	['agentVision', 'vision'],
	['agentRedeem', 'credits'],
	['checkin', 'checkin'],
	['agentProactive', 'proactive'],
	['agentFeatureEnabled', 'basic'],
	['agentGlobalSystemPrompt', 'basic'],
	['agentAliya', 'basic'],
];

/** 表单字段 → 保存分区；新增字段未登记时抛错，避免静默漏存 */
export function sectionOfField(key: string): SaveSection {
	for (const [prefix, section] of sectionPrefixes) {
		if (key.startsWith(prefix)) return section;
	}
	throw new Error(`agents-settings: form field "${key}" has no save section`);
}

/** 表单字段 → 所在子页（未保存标记精确到子页；同一保存分区可跨多个子页） */
export function leafOfField(key: string): LeafKey {
	if (key.startsWith('agentByok')) return 'byok';
	if (key === 'agentExternalAuditRuleRows' || key === 'agentExternalAuditOtherRule' || key === 'agentExternalAuditSystemPrompt') return 'externalAuditRules';
	if (key === 'agentReviewTriggerRules') return 'externalAuditReview';
	return saveSectionHomeLeaf[sectionOfField(key)];
}

export function dirtyLeaves(modifiedStates: Record<string, boolean>): Set<LeafKey> {
	const set = new Set<LeafKey>();
	for (const [key, modified] of Object.entries(modifiedStates)) {
		if (modified) set.add(leafOfField(key));
	}
	return set;
}

export function dirtySections(modifiedStates: Record<string, boolean>): SaveSection[] {
	const set = new Set<SaveSection>();
	for (const [key, modified] of Object.entries(modifiedStates)) {
		if (modified) set.add(sectionOfField(key));
	}
	return [...set];
}

/** 校验失败：带分区与可选定位锚点（data-settings-anchor），由页面跳转并高亮 */
export class SettingsValidationError extends Error {
	constructor(
		public readonly section: SaveSection,
		message: string,
		public readonly anchor: string | null = null,
		public readonly leaf: LeafKey | null = null,
	) {
		super(message);
	}
}
