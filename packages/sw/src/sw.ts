/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { get } from 'idb-keyval';
import * as Misskey from 'misskey-js';
import { FETCH_TIMEOUT_MS } from '@/const.js';
import type { PushNotificationDataMap } from '@/types.js';
import type { I18n } from '@@/js/i18n.js';
import type { Locale } from 'i18n';
import { createEmptyNotification, createNotification } from '@/scripts/create-notification.js';
import { swLang } from '@/scripts/lang.js';
import { OFFLINE_LOGO_PATH, offlineLogoResponse, offlineLogoSrc, offlinePageHTML, syncOfflineLogo } from '@/scripts/offline-page.js';
import * as swos from '@/scripts/operations.js';

async function respondToNavigation(request: Request): Promise<Response> {
	const controller = new AbortController();
	const timeout = globalThis.setTimeout(() => {
		controller.abort('navigation-timeout');
	}, FETCH_TIMEOUT_MS);

	try {
		const response = await fetch(request, { signal: controller.signal });

		if (response?.status && response.status < 500) return response;
		if (response?.type === 'opaqueredirect') return response;
	} catch (error) {
		if (_DEV_) {
			console.warn('navigation fetch failed; showing offline page', error);
		}
	} finally {
		globalThis.clearTimeout(timeout);
	}

	// Only show offline page when network request actually fails
	const html = await offlineContentHTML();
	return new Response(html, {
		status: 200,
		headers: {
			'content-type': 'text/html',
		},
	});
}

async function offlineContentHTML() {
	let i18n: Partial<I18n<Locale>>;
	try {
		i18n = await (swLang.i18n ?? await swLang.fetchLocale()) as Partial<I18n<Locale>>;
	} catch {
		i18n = {};
	}

	return offlinePageHTML(i18n, await swLang.lang, _VERSION_, await offlineLogoSrc());
}

globalThis.addEventListener('install', (ev) => {
	// 次の問題が発生するため、ServiceWorkerAutoPreload をオプトアウトする必要がある
	// https://issues.chromium.org/issues/466790291
	if ('addRoutes' in ev) {
		// doc: https://developer.mozilla.org/en-US/docs/Web/API/InstallEvent/addRoutes
		// @ts-expect-error 実験的なAPIなので型定義がない
		ev.addRoutes({
			condition: {
				// doc: https://developer.mozilla.org/ja/docs/Web/API/URLPattern
				// @ts-expect-error 実験的なAPIなので型定義がない
				urlPattern: new URLPattern({}),
			},
			source: 'fetch-event',
		});
	}
});

globalThis.addEventListener('activate', ev => {
	ev.waitUntil(
		caches.keys()
			.then(cacheNames => Promise.all(
				cacheNames
					.filter((v) => v !== swLang.cacheName)
					.map(name => caches.delete(name)),
			))
			.then(() => globalThis.clients.claim()),
	);
});

globalThis.addEventListener('fetch', ev => {
	// 离线页 logo：虚拟地址，命中 CacheStorage 实例 logo，否则回退打包品牌图
	if (new URL(ev.request.url).pathname === OFFLINE_LOGO_PATH) {
		ev.respondWith(offlineLogoResponse());
		return;
	}

	let isHTMLRequest = false;
	if (ev.request.headers.get('sec-fetch-dest') === 'document') {
		isHTMLRequest = true;
	} else if (ev.request.headers.get('accept')?.includes('/html')) {
		isHTMLRequest = true;
	} else if (ev.request.url.endsWith('/')) {
		isHTMLRequest = true;
	}

	if (!isHTMLRequest) return;
	ev.respondWith(respondToNavigation(ev.request));
});

globalThis.addEventListener('push', ev => {
	// クライアント取得
	ev.waitUntil(globalThis.clients.matchAll({
		includeUncontrolled: true,
		type: 'window',
	}).then(async () => {
		const data: PushNotificationDataMap[keyof PushNotificationDataMap] = ev.data?.json();

		switch (data.type) {
			// case 'driveFileCreated':
			case 'notification':
			case 'unreadAntennaNote':
			case 'newChatMessage':
			case 'newAgentMessage':
				// 1日以上経過している場合は無視
				if (Date.now() - data.dateTime > 1000 * 60 * 60 * 24) break;

				return createNotification(data);
			case 'readAllNotifications':
				await globalThis.registration.getNotifications()
					.then(notifications => notifications.forEach(n => n.tag !== 'read_notification' && n.close()));
				break;
		}

		await createEmptyNotification();
		return;
	}));
});

globalThis.addEventListener('notificationclick', (ev: ServiceWorkerGlobalScopeEventMap['notificationclick']) => {
	ev.waitUntil((async (): Promise<void> => {
		if (_DEV_) {
			console.log('notificationclick', ev.action, ev.notification.data);
		}

		const { action, notification } = ev;
		const data: PushNotificationDataMap[keyof PushNotificationDataMap] = notification.data ?? {};
		const { userId: loginId } = data;
		let client: WindowClient | null = null;

		switch (data.type) {
			case 'notification':
				switch (action) {
					case 'follow':
						if ('userId' in data.body) await swos.api('following/create', loginId, { userId: data.body.userId });
						break;
					case 'showUser':
						if ('user' in data.body) client = await swos.openUser(Misskey.acct.toString(data.body.user), loginId);
						break;
					case 'reply':
						if ('note' in data.body) client = await swos.openPost({ reply: data.body.note }, loginId);
						break;
					case 'renote':
						if ('note' in data.body) await swos.api('notes/create', loginId, { renoteId: data.body.note.id });
						break;
					case 'accept':
						switch (data.body.type) {
							case 'receiveFollowRequest':
								await swos.api('following/requests/accept', loginId, { userId: data.body.userId });
								break;
						}
						break;
					case 'reject':
						switch (data.body.type) {
							case 'receiveFollowRequest':
								await swos.api('following/requests/reject', loginId, { userId: data.body.userId });
								break;
						}
						break;
					case 'showFollowRequests':
						client = await swos.openClient('push', '/my/follow-requests', loginId);
						break;
					default:
						switch (data.body.type) {
							case 'receiveFollowRequest':
								client = await swos.openClient('push', '/my/follow-requests', loginId);
								break;
							case 'reaction':
								client = await swos.openNote(data.body.note.id, loginId);
								break;
							default:
								if ('note' in data.body) {
									client = await swos.openNote(data.body.note.id, loginId);
								} else if ('user' in data.body) {
									client = await swos.openUser(Misskey.acct.toString(data.body.user), loginId);
								}
								break;
						}
				}
				break;
			case 'unreadAntennaNote':
				client = await swos.openAntenna(data.body.antenna.id, loginId);
				break;
			case 'newChatMessage':
				client = await swos.openChat(data.body, loginId);
				break;
			case 'newAgentMessage':
				client = await swos.openAgentChat(data.body, loginId);
				break;
			default:
				switch (action) {
					case 'markAllAsRead':
						await globalThis.registration.getNotifications()
							.then(notifications => notifications.forEach(n => n.tag !== 'read_notification' && n.close()));
						await get<Pick<Misskey.entities.SignupResponse, 'id' | 'token'>[]>('accounts').then(accounts => {
							return Promise.all((accounts ?? []).map(async account => {
								await swos.sendMarkAllAsRead(account.id);
							}));
						});
						break;
					case 'settings':
						client = await swos.openClient('push', '/settings/notifications', loginId);
						break;
				}
		}

		if (client) {
			client.focus();
		}
		if (data.type === 'notification') {
			await swos.sendMarkAllAsRead(loginId);
		}

		notification.close();
	})());
});

globalThis.addEventListener('notificationclose', (ev: ServiceWorkerGlobalScopeEventMap['notificationclose']) => {
	const data: PushNotificationDataMap[keyof PushNotificationDataMap] = ev.notification.data;

	ev.waitUntil((async (): Promise<void> => {
		if (data.type === 'notification') {
			await swos.sendMarkAllAsRead(data.userId);
		}
		return;
	})());
});

globalThis.addEventListener('message', (ev: ServiceWorkerGlobalScopeEventMap['message']) => {
	ev.waitUntil((async (): Promise<void> => {
		switch (ev.data) {
			case 'clear':
				// Cache Storage全削除
				await caches.keys()
					.then(cacheNames => Promise.all(
						cacheNames.map(name => caches.delete(name)),
					));
				return; // TODO
		}

		if (typeof ev.data === 'object') {
			// E.g. '[object Array]' → 'array'
			const otype = Object.prototype.toString.call(ev.data).slice(8, -1).toLowerCase();

			if (otype === 'object') {
				if (ev.data.msg === 'initialize') {
					swLang.setLang(ev.data.lang);
					// 旧客户端不携带 logoUrl：字段缺失时不动既有缓存
					if ('logoUrl' in ev.data) {
						await syncOfflineLogo(ev.data.logoUrl ?? null);
					}
				}
			}
		}
	})());
});
