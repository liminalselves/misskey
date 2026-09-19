/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 桌宠表演指令（[[agent_cue express=… play=…]]）的服务端工具：
// 协议注入、历史剥离与落库前过滤。指令随消息原文存储、展示端各自剥离；
// 仅当请求携带 performance 清单（桌宠环境）时才向 LLM 注入协议并保留历史指令。

export type AgentPerformanceItem = { name: string; hint: string };
export type AgentPerformanceCapabilities = {
	expressions: AgentPerformanceItem[];
	actions: AgentPerformanceItem[];
};

const CUE_NAME = '[a-z0-9_-]{1,32}';

// 宽松匹配（含缺参/畸形变体），用于检测与剥离；不容许换行，避免误吞多行正文
const AGENT_CUE_ANY_RE = /\[\[agent_cue\b[^\]\n]*\]\]/iu;
const AGENT_CUE_ANY_RE_G = /\[\[agent_cue\b[^\]\n]*\]\]/giu;

// 严格解析：[[agent_cue express=名] [play=名]]，属性顺序固定、名字小写
const AGENT_CUE_TOKEN_PARSE_RE = new RegExp(`^\\[\\[agent_cue\\s+(?:express=(${CUE_NAME})\\s*)?(?:play=(${CUE_NAME})\\s*)?\\]\\]$`, 'iu');

/**
 * 规范化请求清单：paramDef 已限形，这里做去重/裁剪/小写化。
 * 返回 null 表示非桌宠环境（字段缺失或两清单皆空）。
 */
export function normalizePerformanceCapabilities(raw: unknown): AgentPerformanceCapabilities | null {
	if (raw == null || typeof raw !== 'object') return null;
	const source = raw as { expressions?: unknown; actions?: unknown };
	const normalize = (list: unknown): AgentPerformanceItem[] => {
		if (!Array.isArray(list)) return [];
		const out: AgentPerformanceItem[] = [];
		const seen = new Set<string>();
		for (const item of list) {
			if (item == null || typeof item !== 'object') continue;
			const { name, hint } = item as { name?: unknown; hint?: unknown };
			if (typeof name !== 'string') continue;
			const normalized = name.trim().toLowerCase().slice(0, 64);
			if (normalized === '' || seen.has(normalized)) continue;
			seen.add(normalized);
			out.push({ name: normalized, hint: typeof hint === 'string' ? hint.trim().slice(0, 64) : '' });
		}
		return out;
	};
	const capabilities: AgentPerformanceCapabilities = {
		expressions: normalize(source.expressions),
		actions: normalize(source.actions),
	};
	if (capabilities.expressions.length === 0 && capabilities.actions.length === 0) return null;
	return capabilities;
}

/** 名字白名单（表情与动作并集；同名分属两通道时语义各自成立，无需分开校验） */
export function performanceAllowedNames(capabilities: AgentPerformanceCapabilities): Set<string> {
	return new Set([...capabilities.expressions, ...capabilities.actions].map(item => item.name));
}

/**
 * 整体剥离表演指令：独占行连同换行移除、行内残留清理、空行收敛。
 * 与 AgentImageService.stripDrawPlaceholders 同款三段式，仅用于 LLM 视图与非桌宠落库前过滤。
 */
export function stripPerformanceCues(text: string): string {
	if (!text) return text;
	if (!AGENT_CUE_ANY_RE.test(text)) return text;
	return text
		.replace(/^[ \t]*\[\[agent_cue\b[^\]\n]*\]\][ \t]*\r?\n?/gimu, '')
		.replace(AGENT_CUE_ANY_RE_G, '')
		.replace(/\n{3,}/gu, '\n\n')
		.trim();
}

/**
 * 落库前过滤：allowed 为 null 时全部剥离；否则只保留名字命中白名单且语法完整的指令，
 * 非法指令按 stripPerformanceCues 同款规则移除（含畸形变体与清单外名字）。
 */
export function enforcePerformanceCues(text: string, allowed: Set<string> | null): string {
	if (!text) return text;
	if (!AGENT_CUE_ANY_RE.test(text)) return text;
	if (allowed == null) return stripPerformanceCues(text);
	const keep = (token: string): boolean => {
		const m = token.match(AGENT_CUE_TOKEN_PARSE_RE);
		if (m == null) return false;
		if (m[1] != null && !allowed.has(m[1].toLowerCase())) return false;
		if (m[2] != null && !allowed.has(m[2].toLowerCase())) return false;
		return true;
	};
	return text
		// 独占行的非法指令连同换行移除，避免留下空行
		.replace(/^[ \t]*(\[\[agent_cue\b[^\]\n]*\]\])[ \t]*\r?\n?/gimu, (whole, token: string) => keep(token) ? whole : '')
		// 行内残留的非法指令就地移除
		.replace(AGENT_CUE_ANY_RE_G, (token: string) => keep(token) ? token : '')
		.replace(/\n{3,}/gu, '\n\n')
		.trim();
}

/** 与 AgentService.escapeAgentXmlText 同款；本地实现以保持本模块零依赖（单测直接引入） */
function escapePerformanceXmlText(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 构建表演协议系统提示块（仅桌宠请求注入）。
 * 行文对齐 AgentStickerService.buildSystemBlocks：中文说明 + `- name —— hint` 清单。
 * extraPrompt 为管理员在控制台配置的桌宠默认提示词，非空时追加在示例之后、闭合标签之前。
 */
export function buildPerformanceSystemBlock(capabilities: AgentPerformanceCapabilities, extraPrompt?: string | null): string {
	const list = (title: 'expressions' | 'actions', items: AgentPerformanceItem[]): string => {
		if (items.length === 0) return '';
		return `<${title}>\n` + items.map(item => `- ${item.name}${item.hint !== '' ? ` —— ${item.hint}` : ''}`).join('\n') + `\n</${title}>\n`;
	};
	let block = '<agent_performance_protocol>\n';
	block += '你正在与桌宠客户端对话，用户眼前是一个 Live2D 角色。你可以在回复中穿插表演指令，控制这个角色的表情与动作。\n';
	block += '- 指令独占一行，不与台词同行。格式：[[agent_cue express=表情名]]、[[agent_cue play=动作名]]，或合写 [[agent_cue express=表情名 play=动作名]]。\n';
	block += '- **回复必须以指令行开头**：第一句台词之前就要有一条指令（至少一个表情或动作），让角色从开口的第一句话起就在表演，不要出现整段没有指令的开场白。\n';
	block += '- **指令行必须先于它所驱动的台词出现**：一段台词的情绪与上一段不同时，以指令行开启这一段；不要先把要说的话写出来、再补指令。\n';
	block += '- 想解说当前表情时（如「这个是开心的。」），先把当前表情的指令行写完，解说句跟在指令之后；切换下一个表情的指令行紧跟解说句，再接下一段台词。\n';
	block += '- 表情（express）：切换后长期保持，直到你下一次切换表情；同样的表情连续使用时不需重复切换。\n';
	block += '- 动作（play）：只播放一次；用于配合当下台词的瞬时行为。\n';
	block += '- 每一段台词都可以换一次表情或配一个动作，让互动更真实；只在情绪或语义明显契合时使用，不必每段都用。\n';
	block += '- 只能使用下列列表中的名字，不要编造。指令行不会展示给用户，也不要在正文里解释或提及这些指令。\n';
	block += list('expressions', capabilities.expressions);
	block += list('actions', capabilities.actions);
	block += '示例：\n[[agent_cue express=happy play=wave]]\n你想看表情？好呀，那我一个一个给你变，你可看仔细了。\n\n这个是开心的。\n[[agent_cue express=shy]]\n你看，一说到给你看这个，我自己就先笑出来了。因为每次你凑过来说要看我表情的时候，眼睛都亮晶晶的。\n\n这个是害羞的。\n[[agent_cue express=angry play=shake]]\n……你别一直盯着看啦。我一被你这样看着就没辙，脸也不听话地发热。\n\n这个是生气的。\n[[agent_cue express=happy]]\n这个，是我现在最想给你的——就是很安心、很踏实的笑。\n\n看完了没有？可要记得，我最想让你记住的是最后一个。\n';
	const extra = (extraPrompt ?? '').trim();
	if (extra !== '') {
		block += `\n<pet_custom_instructions>\n${escapePerformanceXmlText(extra)}\n</pet_custom_instructions>\n`;
	}
	block += '</agent_performance_protocol>';
	return block;
}
