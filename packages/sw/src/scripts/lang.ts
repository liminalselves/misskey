/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/*
 * Language manager for SW
 */
import { get, set } from 'idb-keyval';
import { I18n } from '@@/js/i18n.js';
import { FETCH_TIMEOUT_MS } from '@/const.js';
import type { Locale } from 'i18n';

class SwLang {
	public cacheName = `mk-cache-${_VERSION_}`;

	public lang: Promise<string> = get('lang').then(async prelang => {
		if (!prelang) return 'en-US';
		return prelang;
	});

	public setLang(newLang: string): Promise<I18n<Locale>> {
		this.lang = Promise.resolve(newLang);
		set('lang', newLang);
		return this.fetchLocale();
	}

	public i18n: Promise<I18n<Locale>> | null = null;

	public fetchLocale(): Promise<I18n<Locale>> {
		const p: Promise<I18n<Locale>> = this._fetch().catch(err => {
			if (this.i18n === p) this.i18n = null;
			throw err;
		});
		this.i18n = p;
		return p;
	}

	private async _fetch(): Promise<I18n<Locale>> {
		// Service Workerは何度も起動しそのたびにlocaleを読み込むので、CacheStorageを使う
		const localeUrl = `/assets/locales/${await this.lang}.${_VERSION_}.json`;
		const cachedRes = await caches.match(localeUrl);
		let localeRes = cachedRes;

		// _DEV_がtrueの場合は常に最新化
		if (!localeRes || _DEV_) {
			const controller = new AbortController();
			const timeout = globalThis.setTimeout(() => {
				controller.abort('locale-fetch-timeout');
			}, FETCH_TIMEOUT_MS);

			try {
				localeRes = await fetch(localeUrl, { signal: controller.signal });

				const clone = localeRes.clone();
				if (!clone.clone().ok) throw new Error('locale fetching error');

				caches.open(this.cacheName).then(cache => cache.put(localeUrl, clone));
			} catch (err) {
				// If refreshing fails (e.g. offline), keep using the cached locale for the offline page
				if (!cachedRes) throw err;
				localeRes = cachedRes;
			} finally {
				globalThis.clearTimeout(timeout);
			}
		}

		return new I18n<Locale>(await localeRes.json());
	}
}

export const swLang = new SwLang();
