/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const NON_HTML_PATH_PREFIXES = [
	'/files/',
	'/proxy/',
	'/api/',
	'/emoji/',
	'/.well-known/',
	'/nodeinfo/',
];

const NON_HTML_EXACT_PATHS = new Set([
	'/files',
	'/proxy',
	'/api',
	'/emoji',
	'/.well-known',
	'/nodeinfo',
	'/healthz',
	'/oauth/token',
	'/streaming',
	'/sw.js',
	'/manifest.webmanifest',
	'/manifest.json',
]);

export function isNonHtmlBackendPath(pathname: string): boolean {
	if (NON_HTML_EXACT_PATHS.has(pathname)) return true;
	return NON_HTML_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

/**
 * 仅同源 GET 网页导航需要断网兜底页；文件下载、媒体代理与 API 等路由即使以新标签页打开也不能被 SW 超时中止或吞掉服务端状态码。
 */
export function shouldRespondWithOfflineFallback(
	request: Pick<Request, 'method' | 'url' | 'headers'> & { mode?: Request['mode'] },
	origin: string,
): boolean {
	if (request.method.toUpperCase() !== 'GET') return false;

	let parsed: URL;
	try {
		parsed = new URL(request.url);
	} catch {
		return false;
	}

	if (parsed.origin !== origin) return false;
	if (isNonHtmlBackendPath(parsed.pathname)) return false;

	if (request.mode === 'navigate') return true;
	if (request.headers.get('sec-fetch-dest') === 'document') return true;
	if (request.headers.get('accept')?.includes('/html')) return true;
	if (parsed.pathname.endsWith('/')) return true;

	return false;
}
