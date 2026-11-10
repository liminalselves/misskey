/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { I18n } from '@@/js/i18n.js';
import type { Locale } from 'i18n';
import { swLang } from '@/scripts/lang.js';
import brandImage from '@/assets/liminal-brand.webp';

const QQ_GROUP = '519308434';
const SUPPORT_EMAIL = 'help@liminalselves.top';

// 离线页 logo：客户端 initialize 时把实例 iconUrl 交给本 worker 缓存进 CacheStorage；
// 离线时页面通过虚拟路径取图，未配置/未缓存则回退打包的阈界人格品牌图。
export const OFFLINE_LOGO_PATH = '/__liminal-offline-logo__';
const OFFLINE_LOGO_IDB_KEY = 'offlineLogoUrl';

export async function syncOfflineLogo(logoUrl: string | null): Promise<void> {
	const cache = await caches.open(swLang.cacheName);
	if (logoUrl == null) {
		await idbDel(OFFLINE_LOGO_IDB_KEY);
		await cache.delete(OFFLINE_LOGO_PATH);
		return;
	}
	if (logoUrl === await idbGet<string>(OFFLINE_LOGO_IDB_KEY) && await cache.match(OFFLINE_LOGO_PATH) != null) return;

	try {
		const response = await fetch(logoUrl);
		if (!response.ok) return;
		await cache.put(OFFLINE_LOGO_PATH, response);
		await idbSet(OFFLINE_LOGO_IDB_KEY, logoUrl);
	} catch {
		// 抓取失败时保留既有缓存，不清除
	}
}

export async function offlineLogoResponse(): Promise<Response> {
	const cached = await caches.match(OFFLINE_LOGO_PATH);
	return cached ?? fetch(brandImage);
}

export async function offlineLogoSrc(): Promise<string> {
	return await caches.match(OFFLINE_LOGO_PATH) != null ? OFFLINE_LOGO_PATH : brandImage;
}

// locale YAML 只可改 ja-JP（其他语言由 Crowdin 管）；本站主体用户使用中文，离线页新增文案对 zh 兜底为中文。
const ZH_CN = {
	checkNetwork: '请先检查您的网络连接，然后重新加载',
	serverMaintenance: '若网络连接正常，服务器可能正在维护或更新，请稍后再试',
	contact: '若长时间仍无法访问，请加入QQ群 {qq} 咨询，或发送邮件至 {mail}',
};

function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

export function offlinePageHTML(i18n: Partial<I18n<Locale>>, lang: string, version: string, logoSrc: string): string {
	const offline = i18n.ts?._offlineScreen;
	const zh = lang.startsWith('zh');
	const messages = {
		title: escapeHtml(offline?.title ?? 'Offline - Could not connect to server'),
		header: escapeHtml(offline?.header ?? 'Could not connect to server'),
		reload: escapeHtml(i18n.ts?.reload ?? 'Reload'),
		checkNetwork: escapeHtml(offline?.checkNetwork ?? (zh ? ZH_CN.checkNetwork : 'Please check your network connection, then reload and try again.')),
		serverMaintenance: escapeHtml(offline?.serverMaintenance ?? (zh ? ZH_CN.serverMaintenance : 'If your network is fine, the server may be down for maintenance or an update. Please try again later.')),
		contact: escapeHtml(offline?.contact ?? (zh ? ZH_CN.contact : 'If it remains unreachable for a long time, ask in the QQ group {qq} or email {mail}.'))
			.replaceAll('{qq}', QQ_GROUP)
			.replaceAll('{mail}', `<a class="mail" href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`),
	};
	const htmlLang = /^[a-zA-Z0-9-]+$/.test(lang) ? lang : 'en';

	return `<!DOCTYPE html><html lang="${htmlLang}"><head><meta charset="UTF-8"><meta content="width=device-width,initial-scale=1,viewport-fit=cover"name="viewport"><meta content="#0c1210"name="theme-color"><title>${messages.title}</title><style>:root{color-scheme:dark}html{-webkit-text-size-adjust:100%;text-size-adjust:100%}*{box-sizing:border-box}body{background-color:#0c1210;color:#dee7e4;font-family:"Hiragino Maru Gothic Pro","BIZ UDGothic",system-ui,Roboto,HelveticaNeue,Arial,"Microsoft YaHei","PingFang SC",sans-serif;line-height:1.5;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;min-height:100dvh;margin:0;padding:max(32px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(32px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));text-align:center}.brand{display:block;width:min(228px,62vw);aspect-ratio:4/3;height:auto;border-radius:16px;border:1px solid rgba(255,255,255,.07);box-shadow:0 8px 40px rgba(0,0,0,.35);object-fit:contain}.header{margin:28px 0 6px;font-size:22px;font-weight:700;letter-spacing:.04em}.version{font-size:12px;opacity:.4;font-variant-numeric:tabular-nums}.steps{margin:26px 0 0;padding:0 0 0 1.4em;max-width:34em;text-align:left;font-size:14px;line-height:1.9;color:#a9b8b2}.steps>li{padding-left:4px}.steps>li::marker{color:#b4e900;font-variant-numeric:tabular-nums}.mail{color:#b4e900;text-decoration:none;border-bottom:1px solid rgba(180,233,0,.4)}button{margin-top:30px;padding:10px 42px;min-width:120px;font-size:15px;font-weight:700;letter-spacing:.05em;font-family:inherit;border-radius:99rem;background-color:#b4e900;color:#192320;border:none;cursor:pointer;-webkit-tap-highlight-color:transparent}button:hover{background-color:#c6ff03}button:active{background-color:#a0d000}button:focus-visible{outline:2px solid #c6ff03;outline-offset:3px}@media (min-width:640px){.brand{width:260px;border-radius:18px}.header{margin-top:32px;font-size:24px}.steps{font-size:15px}}</style></head><body><img alt="阈界人格 Liminal Selves"class="brand"src="${logoSrc}"><h1 class="header">${messages.header}</h1><div class="version">v${version}</div><ol class="steps"><li>${messages.checkNetwork}</li><li>${messages.serverMaintenance}</li><li>${messages.contact}</li></ol><button onclick="reloadPage()"type="button">${messages.reload}</button><script>function reloadPage(){location.reload(!0)}<\/script></body></html>`;
}
