/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { parseForkChangelog } from './fork-changelog.js';

const VIRTUAL_ID = 'virtual:fork-changelog';
const RESOLVED_ID = '\0' + VIRTUAL_ID;
const changelogPath = path.resolve(__dirname, '../../../CHANGELOG.md');

/**
 * 构建期解析仓库根目录的 CHANGELOG.md，以虚拟模块导出本 fork 的发布记录。
 * 只把 fork 段打进前端包，开发时监听文件变化并热更新。
 */
export default function pluginForkChangelog(): Plugin {
	return {
		name: 'fork-changelog',

		resolveId(id) {
			return id === VIRTUAL_ID ? RESOLVED_ID : null;
		},

		async load(id) {
			if (id !== RESOLVED_ID) return null;
			this.addWatchFile(changelogPath);
			let markdown = '';
			try {
				markdown = await readFile(changelogPath, 'utf8');
			} catch {
				// 缺少 CHANGELOG 时页面显示空状态，不中断构建
				this.warn(`CHANGELOG.md not found at ${changelogPath}`);
			}
			return `export const forkChangelog = ${JSON.stringify(parseForkChangelog(markdown))};`;
		},
	};
}
