/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 智能体表情包纯工具函数与常量。
 * 独立成模块以避免 AgentService ↔ AgentStickerService 之间的循环 import
 * （AgentService 只需要纯 normalize 函数，不注入服务）。
 */

import type { MiAgentCharacterSticker } from '@/models/AgentCharacter.js';

/** 描述入库/返回的最大长度（与 emoji.agentDescription 列一致） */
export const AGENT_STICKER_DESCRIPTION_MAX = 200;
/** 角色专属表情包库上限 */
export const AGENT_CHARACTER_STICKER_MAX = 50;
/** 角色表情 key 的合法字符 */
export const AGENT_CHARACTER_STICKER_KEY_RE = /^[a-zA-Z0-9_-]{1,32}$/;

/** 校验/规范化角色表情库条目：key 合法、fileId/description 非空，描述截断到上限（不合规条目静默剔除） */
export function normalizeCharacterStickerList(raw: unknown): MiAgentCharacterSticker[] {
	if (!Array.isArray(raw)) return [];
	const out: MiAgentCharacterSticker[] = [];
	for (const item of raw) {
		if (item == null || typeof item !== 'object') continue;
		const key = String((item as MiAgentCharacterSticker).key ?? '').trim();
		const fileId = String((item as MiAgentCharacterSticker).fileId ?? '').trim();
		const description = String((item as MiAgentCharacterSticker).description ?? '').trim();
		if (!AGENT_CHARACTER_STICKER_KEY_RE.test(key) || fileId === '' || description === '') continue;
		out.push({ key, fileId, description: description.slice(0, AGENT_STICKER_DESCRIPTION_MAX) });
	}
	return out;
}

/** 助手回复中的角色表情包标签语法 */
export const AGENT_STICKER_TAG_RE = /\[\[agent_sticker\s+key=([a-zA-Z0-9_-]{1,32})\s*\]\]/g;
/** 全站表情短代码（本地表情名只含字母数字下划线） */
export const AGENT_EMOJI_CODE_RE = /:([a-zA-Z0-9_]+):/g;
