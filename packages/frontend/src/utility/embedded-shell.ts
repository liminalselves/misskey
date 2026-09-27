/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 嵌入式壳（App WebView）协议的 Web 端唯一入口。
 *
 * 壳层是 Android 原生 WebView（`top.liminalselves.app`，User-Agent 含 `LiminalSelvesApp`）。
 * 本模块集中封装与壳层原生桥的全部交互，业务代码不得散落 `window` 桥类型断言：
 *
 * - 路由状态上报（Web 主动）：订阅 mainRouter，经 `window.AppNav.onRouteChange(json)`
 *   上报 `{ fullPath, route }`。Android 据此同步当前 URL；返回键行为只以
 *   WebView 自身历史（canGoBack）为准。
 * - theme-color 上报（Web 主动）：theme.ts 更新 `meta[name=theme-color]` 后派发
 *   `SHELL_THEME_COLOR_EVENT`，本模块读取该 meta 并经 `window.AppChrome.postColor(color)`
 *   通知 Android 系统栏；页面加载初值由 Android 在 pageFinished 自行读取 meta 兜底。
 * - 推送开关桥接（Web 主动）：业务代码经本模块的 `postAppNativePush(action)` 向壳层
 *   `window.AppNativePush.postMessage(action)` 发送 `enable` / `disable` / `query`。
 *   不得散落 `window.AppNativePush` 类型断言。
 *
 * 全部能力在非壳环境（常规浏览器）下为 no-op。
 */

import { mainRouter } from '@/router.js';

/** theme.ts 更新 theme-color 后派发的事件；本模块监听并转发给壳层。 */
export const SHELL_THEME_COLOR_EVENT = 'embedded-shell:theme-color-changed';

type ShellJsBridge = Record<string, unknown>;

function getShellBridge(name: 'AppNav' | 'AppChrome' | 'AppNativePush'): ShellJsBridge | null {
	if (typeof window === 'undefined') return null;
	const bridge = (window as unknown as Record<string, unknown>)[name];
	if (bridge == null || typeof bridge !== 'object') return null;
	return bridge as ShellJsBridge;
}

let initialized = false;

/**
 * 初始化壳层协议（幂等）。未检测到壳层桥时为 no-op。
 * 在 main-boot 最早阶段调用，需先于 common()（首个 applyTheme），
 * 以保证 theme-color 事件监听先于首次主题应用生效。
 */
export function initEmbeddedShell(): void {
	if (initialized || typeof window === 'undefined') return;
	initialized = true;

	if (getShellBridge('AppChrome') == null && getShellBridge('AppNav') == null) return;

	// ── 主题背景色上报（多通道兜底，保证壳层任何路径下都能拿到真实页面背景色）：
	// 1) theme.ts 派发事件（站内手动切换/深浅联动时实时）；
	// 2) documentElement 的 style 属性精准监听——applyThemeInternal 写 --MI_THEME-*
	//    必然触发（含 startViewTransition 异步路径与缓存路径），开销可忽略；
	// 3) 初始化/首帧/页面 load 各兜底上报一次（覆盖变量早已就位的冷启动）。
	window.addEventListener(SHELL_THEME_COLOR_EVENT, (event) => {
		const color = (event as CustomEvent<string>).detail;
		reportThemeColorToShell(color);
	});
	let styleObserverTimer: number | null = null;
	new MutationObserver(() => {
		// 主题切换会连续写多个变量，合并到下一拍只上报最后一次
		if (styleObserverTimer != null) window.clearTimeout(styleObserverTimer);
		styleObserverTimer = window.setTimeout(() => {
			styleObserverTimer = null;
			reportThemeColorToShell();
		}, 80);
	}).observe(window.document.documentElement, { attributes: true, attributeFilter: ['style'] });
	reportThemeColorToShell();
	window.requestAnimationFrame(() => window.requestAnimationFrame(() => reportThemeColorToShell()));
	window.addEventListener('load', () => reportThemeColorToShell(), { once: true });

	// ── 路由状态：mainRouter 'change' 覆盖 push/replace/popstate 全部路径变化 ──
	mainRouter.addListener('change', ctx => {
		reportRouteState(ctx.fullPath, ctx.resolved.route.path);
	});
	// Nirax 的 change 早于 router.ts 写入 history.pushState；push 完成后再上报一次，
	// 让壳层此时读取到准确的 WebView.canGoBack() 状态。
	mainRouter.addListener('push', ctx => {
		reportRouteState(ctx.fullPath, ctx.route?.path ?? mainRouter.current.route.path);
	});
	reportRouteState(mainRouter.getCurrentFullPath(), mainRouter.current.route.path);
}

/**
 * 上报 Misskey 已应用主题的页面背景色（`--MI_THEME-bg`）。
 * 永不回退 meta[name=theme-color]——服务端初值是实例强调色，不是背景色。
 */
function reportThemeColorToShell(appliedBackground?: string): void {
	if (typeof window === 'undefined') return;
	const bridge = getShellBridge('AppChrome');
	if (bridge == null || typeof bridge.postColor !== 'function') return;
	const color = appliedBackground
		|| window.getComputedStyle(window.document.documentElement).getPropertyValue('--MI_THEME-bg').trim();
	if (!color) return;
	try {
		bridge.postColor(color);
	} catch {
		// ignore bridge failures
	}
}

/** 上报当前路由状态：fullPath 与命中的路由定义（identity）。 */
function reportRouteState(fullPath: string, routePath: string): void {
	const bridge = getShellBridge('AppNav');
	if (bridge == null || typeof bridge.onRouteChange !== 'function') return;
	try {
		bridge.onRouteChange(JSON.stringify({
			fullPath,
			route: routePath,
		}));
	} catch {
		// ignore bridge failures
	}
}

/** 壳层推送开关桥支持的 action。 */
export type AppNativePushAction = 'enable' | 'disable' | 'query';

/**
 * 向壳层发送推送开关指令（`window.AppNativePush.postMessage`）。
 * 无壳 / 桥不可用时 no-op；业务代码统一经此函数调用，不直接断言 `window.AppNativePush`。
 */
export function postAppNativePush(action: AppNativePushAction): void {
	if (typeof window === 'undefined') return;
	const bridge = getShellBridge('AppNativePush');
	if (bridge == null || typeof bridge.postMessage !== 'function') return;
	try {
		bridge.postMessage(action);
	} catch {
		// ignore bridge failures
	}
}
