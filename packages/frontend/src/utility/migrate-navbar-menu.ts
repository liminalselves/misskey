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
