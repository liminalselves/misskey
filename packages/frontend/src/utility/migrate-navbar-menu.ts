/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { miLocalStorage } from '@/local-storage.js';
import { prefer } from '@/preferences.js';

const MIGRATION_KEY = 'menuExplorePinnedMigrated_v1';

/**
 * 发现固定为首项后：从可配置菜单中移除重复的 explore，并在首次迁移时插入 timeline（旧版时间线为固定项，未写入 menu）。
 */
export function migrateNavbarMenuForPinnedExplore(): void {
	if (miLocalStorage.getItem(MIGRATION_KEY) === '1') return;

	const raw = prefer.s.menu;
	let next = raw.filter(x => x !== 'explore');
	if (!next.includes('timeline')) {
		next = ['timeline', ...next];
	}
	const changed =
		next.length !== raw.length ||
		next.some((v, i) => v !== raw[i]);
	if (changed) {
		prefer.commit('menu', next);
	}
	miLocalStorage.setItem(MIGRATION_KEY, '1');
}

const MIGRATION_KEY_AGENTS = 'menuAgentsAfterTimelineMigrated_v1';

/**
 * 默认导航栏在 preferences 里一旦写入就会持久化；仅改 def.ts 的 default 不会更新老用户。
 * 在 timeline 后插入 agents（与当前默认顺序一致），且只对本机执行一次；若已有 agents 或未包含 timeline 则跳过。
 */
export function migrateNavbarMenuAgentsAfterTimeline(): void {
	if (miLocalStorage.getItem(MIGRATION_KEY_AGENTS) === '1') return;

	const raw = prefer.s.menu;
	if (raw.includes('agents')) {
		miLocalStorage.setItem(MIGRATION_KEY_AGENTS, '1');
		return;
	}
	const idx = raw.indexOf('timeline');
	if (idx === -1) {
		miLocalStorage.setItem(MIGRATION_KEY_AGENTS, '1');
		return;
	}
	const next = [...raw.slice(0, idx + 1), 'agents', ...raw.slice(idx + 1)];
	prefer.commit('menu', next);
	miLocalStorage.setItem(MIGRATION_KEY_AGENTS, '1');
}
