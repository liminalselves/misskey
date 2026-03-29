/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * WebView 套壳客户端应在 User-Agent 中包含此子串，以便 Misskey 区分「App 内嵌」与常规浏览器。
 * Flutter: `WebViewController.setUserAgent('$defaultUa $EMBEDDED_APP_SHELL_USER_AGENT_MARKER')`
 */
export const EMBEDDED_APP_SHELL_USER_AGENT_MARKER = 'LiminalSelvesApp';

/**
 * 也可在页面最早阶段执行：`window.__MISSKEY_EMBEDDED_APP__ = true`（需保证在 UI 渲染前执行，否则优先用 UA）
 */
export function isEmbeddedAppShell(): boolean {
	if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
	if ((window as unknown as { __MISSKEY_EMBEDDED_APP__?: boolean }).__MISSKEY_EMBEDDED_APP__ === true) return true;
	return navigator.userAgent.includes(EMBEDDED_APP_SHELL_USER_AGENT_MARKER);
}
