/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { lang, version } from '@@/js/config.js';
import type { Locale } from 'i18n';

// locale JSON は常にランタイムで取得する。
// ビルド時の locale-inliner は TemplateLiteral の fetch を置換するため、
// minifier が静的に畳み込めないよう配列 join で URL を構築し、インライン化を回避する。
const localeUrl = ['', 'assets', 'locales', `${lang}.${version}.json`].join('/');
export let locale: Locale = await window.fetch(localeUrl, { cache: 'no-store' }).then(r => r.json(), () => null);

export function updateLocale(newLocale: Locale): void {
	locale = newLocale;
}
