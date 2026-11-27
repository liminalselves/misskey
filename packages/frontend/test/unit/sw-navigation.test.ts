/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import {
	isNonHtmlBackendPath,
	shouldRespondWithOfflineFallback,
} from '../../../sw/src/scripts/navigation-request.js';

const ORIGIN = 'https://misskey.liminalselves.top';

describe('sw navigation-request', () => {
	test('excludes backend file, proxy, API and static asset paths even on document navigations', () => {
		const bypassedUrls = [
			`${ORIGIN}/files/app-releases/1.1.1/LiminalSelves_v1.1.1.apk`,
			`${ORIGIN}/files/abc123`,
			`${ORIGIN}/files/app-default.jpg`,
			`${ORIGIN}/files`,
			`${ORIGIN}/proxy/https%3A%2F%2Fexample.com%2Fimage.png`,
			`${ORIGIN}/api/meta`,
			`${ORIGIN}/api/app/releases/`,
			`${ORIGIN}/emoji/custom.webp`,
			`${ORIGIN}/.well-known/nodeinfo`,
			`${ORIGIN}/nodeinfo/2.0`,
			`${ORIGIN}/healthz`,
			`${ORIGIN}/oauth/token`,
			`${ORIGIN}/streaming`,
			`${ORIGIN}/sw.js`,
			`${ORIGIN}/manifest.webmanifest`,
		];

		for (const url of bypassedUrls) {
			expect(isNonHtmlBackendPath(new URL(url).pathname), url).toBe(true);
			const req = {
				method: 'GET',
				url,
				mode: 'navigate' as const,
				headers: new Headers({
					'sec-fetch-dest': 'document',
					accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				}),
			};
			expect(shouldRespondWithOfflineFallback(req, ORIGIN), url).toBe(false);
		}
	});

	test('keeps offline fallback enabled for same-origin GET HTML page navigations', () => {
		const pageUrls = [
			`${ORIGIN}/`,
			`${ORIGIN}/app`,
			`${ORIGIN}/notes/abcdef1234`,
			`${ORIGIN}/admin/files`,
			`${ORIGIN}/api-console`,
			`${ORIGIN}/oauth/authorize?client_id=abc`,
		];

		for (const url of pageUrls) {
			expect(shouldRespondWithOfflineFallback({
				method: 'GET',
				url,
				mode: 'navigate',
				headers: new Headers({ accept: 'text/html' }),
			}, ORIGIN), url).toBe(true);
		}

		expect(shouldRespondWithOfflineFallback({
			method: 'GET',
			url: `${ORIGIN}/timeline/`,
			headers: new Headers(),
		}, ORIGIN)).toBe(true);

		expect(shouldRespondWithOfflineFallback({
			method: 'POST',
			url: `${ORIGIN}/app`,
			mode: 'navigate',
			headers: new Headers({ accept: 'text/html' }),
		}, ORIGIN)).toBe(false);

		expect(shouldRespondWithOfflineFallback({
			method: 'GET',
			url: 'https://github.com/liminalselves/liminalselves_app/releases',
			mode: 'navigate',
			headers: new Headers({ accept: 'text/html' }),
		}, ORIGIN)).toBe(false);

		expect(shouldRespondWithOfflineFallback({
			method: 'GET',
			url: `${ORIGIN}/assets/app.js`,
			mode: 'same-origin',
			headers: new Headers({ accept: '*/*' }),
		}, ORIGIN)).toBe(false);
	});
});
