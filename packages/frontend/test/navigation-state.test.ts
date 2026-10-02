/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { createApp, defineComponent, h, KeepAlive, nextTick, onMounted, provide, ref, useTemplateRef } from 'vue';
import type { App } from 'vue';
import { Nirax } from '@/lib/nirax.js';
import type { RouteDef } from '@/lib/nirax.js';
import { bindRouterHistory, canGoBackInApp, goBackInApp } from '@/utility/router-history.js';
import { useScrollPositionKeeper } from '@/composables/use-scroll-position-keeper.js';
import NestedRouterView from '@/components/global/NestedRouterView.vue';
import RouterView from '@/components/global/RouterView.vue';
import { preferMobileNavigation } from '@/utility/prefer-mobile-navigation.js';
import { DI } from '@/di.js';
vi.mock('@/preferences.js', () => ({ prefer: { s: { numberOfPageCache: 3 } } }));

let app: App | undefined;
const roots: HTMLElement[] = [];

async function settle() {
	await nextTick();
	await nextTick();
}

function mount(component: ReturnType<typeof defineComponent>) {
	const root = document.createElement('div');
	document.body.append(root);
	roots.push(root);
	app = createApp(component);
	app.component('MkLoading', defineComponent(() => () => h('span', 'loading')));
	app.mount(root);
	return root;
}

afterEach(() => {
	app?.unmount();
	app = undefined;
	for (const root of roots.splice(0)) root.remove();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('Mobile navigation', () => {
	test('desktop keeps windows while narrow, touch and App environments prefer page navigation', () => {
		const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
		expect(preferMobileNavigation()).toBe(false);
		matchMedia.mockReturnValue({ matches: true } as MediaQueryList);
		expect(preferMobileNavigation()).toBe(true);
		matchMedia.mockReturnValue({ matches: false } as MediaQueryList);
		vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Android LiminalSelvesApp');
		expect(preferMobileNavigation()).toBe(true);
	});
});

describe('Router history', () => {
	test('direct entry does not count external browser history as an in-app back destination', () => {
		const replaceState = vi.spyOn(window.history, 'replaceState');
		vi.spyOn(window.history, 'state', 'get').mockReturnValue({ unrelated: true });
		vi.spyOn(window.history, 'length', 'get').mockReturnValue(10);
		const router = new Nirax<RouteDef[]>([{ path: '/direct', component: {} }, { path: '/list', component: {} }], '/direct', true, {});
		const back = vi.spyOn(window.history, 'back');
		bindRouterHistory(router);
		expect(canGoBackInApp()).toBe(false);
		goBackInApp(router, '/list');
		expect(back).not.toHaveBeenCalled();
		expect(router.getCurrentFullPath()).toBe('/list');
		expect(replaceState).toHaveBeenLastCalledWith({ unrelated: true, misskeyNavigation: { index: 0 } }, '', '/list');
	});

	test('push advances history, replace preserves it, and independent window routers do not navigate the browser', () => {
		let state: unknown = { misskeyNavigation: { index: 0 }, retained: 'yes' };
		vi.spyOn(window.history, 'state', 'get').mockImplementation(() => state);
		vi.spyOn(window.history, 'length', 'get').mockReturnValue(5);
		vi.spyOn(window.history, 'replaceState').mockImplementation(value => { state = value; });
		const pushState = vi.spyOn(window.history, 'pushState').mockImplementation(value => { state = value; });
		const routes: RouteDef[] = [{ path: '/list', component: {} }, { path: '/detail', component: {} }];
		const router = new Nirax(routes, '/list', true, {});
		bindRouterHistory(router);
		router.replaceByPath('/list?view=sessions');
		expect(canGoBackInApp()).toBe(false);
		router.pushByPath('/detail');
		expect(pushState).toHaveBeenLastCalledWith({ retained: 'yes', misskeyNavigation: { index: 1 } }, '', '/detail');
		router.replaceByPath('/detail?messageId=target');
		expect(canGoBackInApp()).toBe(true);
		const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
		goBackInApp(router, '/list');
		expect(back).toHaveBeenCalledOnce();
		const windowRouter = new Nirax(routes, '/detail', true, {});
		goBackInApp(windowRouter, '/list');
		expect(back).toHaveBeenCalledOnce();
		expect(windowRouter.getCurrentFullPath()).toBe('/list');
	});
});

describe('Nested page cache', () => {
	test('returning to a parent section reuses its cache regardless of the initial child URL', async () => {
		let listCreations = 0;
		let shellCreations = 0;
		const List = defineComponent(() => {
			listCreations++;
			return () => h('span', 'list');
		});
		const Empty = defineComponent(() => () => h('span', 'detail'));
		const Shell = defineComponent(() => {
			shellCreations++;
			return () => h(NestedRouterView);
		});
		const router = new Nirax<RouteDef[]>([{
			path: '/admin', component: Shell, children: [
				{ path: '/start', component: Empty },
				{ path: '/list', component: List, cache: true },
			],
		}, { path: '/detail', component: Empty }], '/admin/start', true, {});
		const root = mount(defineComponent(() => {
			provide(DI.router, router as never);
			return () => h(RouterView);
		}));
		await settle();
		router.pushByPath('/admin/list');
		await settle();
		router.pushByPath('/detail');
		await settle();
		router.replaceByPath('/admin/list');
		await settle();
		expect(root.textContent).toBe('list');
		expect(listCreations).toBe(1);
		expect(shellCreations).toBe(1);
	});

	test('preserves query-tab state across detail, other sections and the mobile admin menu', async () => {
		let creations = 0;
		const List = defineComponent({
			props: { view: String },
			setup(props) {
				creations++;
				const count = ref(0);
				return () => h('button', { onClick: () => count.value++ }, `${props.view}:${count.value}`);
			},
		});
		const Empty = defineComponent(() => () => h('span', 'detail'));
		const router = new Nirax<RouteDef[]>([{
			path: '/admin', component: {}, children: [
				{ path: '/list', component: List, cache: true, reuseComponent: true, query: { view: 'view' } },
				{ path: '/detail', component: Empty },
				{ path: '/', component: Empty },
			],
		}, { path: '/settings', component: {}, children: [{ path: '/profile', component: Empty }] }], '/admin/list?view=sessions', true, {});
		const root = mount(defineComponent({
			setup() {
				provide(DI.routerCurrentDepth, 1);
				provide(DI.router, router as never);
				return () => h(NestedRouterView);
			},
		}));
		await settle();
		root.querySelector('button')!.click();
		router.replaceByPath('/admin/list?view=images');
		await settle();
		expect(root.textContent).toBe('images:1');
		for (const destination of ['/admin/detail', '/settings/profile', '/admin/']) {
			router.pushByPath(destination);
			await settle();
			router.replaceByPath('/admin/list?view=images');
			await settle();
			expect(root.textContent).toBe('images:1');
		}
		expect(creations).toBe(1);
	});
});

describe('Cached page scroll', () => {
	test('initial activation does not overwrite a page-provided deep-link scroll position', async () => {
		vi.useFakeTimers();
		const Page = defineComponent(() => {
			const el = useTemplateRef<HTMLElement>('scroll');
			useScrollPositionKeeper(el);
			onMounted(() => { el.value!.scrollTop = 800; });
			return () => h('div', { ref: 'scroll' });
		});
		const root = mount(defineComponent(() => () => h(KeepAlive, null, () => h(Page))));
		await settle();
		vi.advanceTimersByTime(100);
		expect((root.firstElementChild as HTMLElement).scrollTop).toBe(800);
	});

	test.each([640, -420])('restores exact non-anchor scroll position %s', async (top) => {
		vi.useFakeTimers();
		const visible = ref(true);
		const Page = defineComponent({
			setup() {
				const el = useTemplateRef<HTMLElement>('scroll');
				useScrollPositionKeeper(el);
				return () => h('div', { ref: 'scroll' });
			},
		});
		const root = mount(defineComponent(() => () => h(KeepAlive, null, () => visible.value ? h(Page) : null)));
		await settle();
		vi.advanceTimersByTime(100);
		const el = root.firstElementChild as HTMLElement;
		el.scrollTop = top;
		el.scrollLeft = 24;
		el.dispatchEvent(new Event('scroll'));
		visible.value = false;
		await settle();
		el.scrollTop = 0;
		el.scrollLeft = 0;
		el.dispatchEvent(new Event('scroll'));
		visible.value = true;
		await settle();
		vi.advanceTimersByTime(100);
		expect(el.scrollTop).toBe(top);
		expect(el.scrollLeft).toBe(24);
	});

	test('retains anchor offset within an offset container and cancels restoration on departure', async () => {
		vi.useFakeTimers();
		const visible = ref(true);
		let anchorShift = 0;
		const Page = defineComponent({
			setup() {
				const el = useTemplateRef<HTMLElement>('scroll');
				useScrollPositionKeeper(el);
				return () => h('div', { ref: 'scroll' }, [h('div', { 'data-scroll-anchor': 'quoted"id' })]);
			},
		});
		const root = mount(defineComponent(() => () => h(KeepAlive, null, () => visible.value ? h(Page) : null)));
		await settle();
		vi.advanceTimersByTime(100);
		const el = root.firstElementChild as HTMLElement;
		const anchor = el.firstElementChild as HTMLElement;
		vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: 200, height: 400 } as DOMRect);
		vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(() => ({ top: 350 + anchorShift, bottom: 450 + anchorShift } as DOMRect));
		el.scrollTop = 500;
		el.dispatchEvent(new Event('scroll'));
		visible.value = false;
		await settle();
		el.scrollTop = 0;
		anchorShift = 80;
		visible.value = true;
		await settle();
		expect(el.scrollTop).toBe(580);
		visible.value = false;
		await settle();
		const scrollTo = vi.spyOn(el, 'scrollTo');
		vi.advanceTimersByTime(200);
		expect(scrollTo).not.toHaveBeenCalled();
	});
});
