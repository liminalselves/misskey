/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Nirax, RouteDef } from '@/lib/nirax.js';

type HistoryState = { misskeyNavigation?: { index: number } };
let historyRouter: Nirax<RouteDef[]> | null = null;

function currentIndex(): number {
	const index = (window.history.state as HistoryState | null)?.misskeyNavigation?.index;
	return typeof index === 'number' && Number.isInteger(index) && index >= 0 ? index : 0;
}

function stateAt(index: number): HistoryState {
	return { ...window.history.state, misskeyNavigation: { index } };
}

export function canGoBackInApp(): boolean {
	return currentIndex() > 0 && window.history.length > 1;
}

export function goBackInApp(router: Nirax<RouteDef[]>, fallbackPath: string): void {
	if (router === historyRouter && canGoBackInApp()) {
		window.history.back();
	} else {
		router.replaceByPath(fallbackPath);
	}
}

export function bindRouterHistory(router: Nirax<RouteDef[]>): void {
	historyRouter = router;
	window.history.replaceState(stateAt(currentIndex()), '');
	window.addEventListener('popstate', () => {
		router.replaceByPath(window.location.pathname + window.location.search + window.location.hash);
	});
	router.addListener('push', ctx => {
		window.history.pushState(stateAt(currentIndex() + 1), '', ctx.fullPath);
	});
	router.addListener('replace', ctx => {
		window.history.replaceState(stateAt(currentIndex()), '', ctx.fullPath);
	});
}
