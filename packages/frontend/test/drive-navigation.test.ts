/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, h, provide } from 'vue';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import type { DriveFolder } from 'misskey-js/entities.js';
import { Nirax } from '@/lib/nirax.js';
import type { RouteDef } from '@/lib/nirax.js';
import { bindRouterHistory } from '@/utility/router-history.js';
import { DI } from '@/di.js';
import { provideMetadataReceiver } from '@/page.js';
import RouterView from '@/components/global/RouterView.vue';
import DrivePage from '@/pages/drive.vue';
import MkDrive from '@/components/MkDrive.vue';
import * as os from '@/os.js';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: api }));
vi.mock('@/router.js', async () => {
	const { inject } = await import('vue');
	const { DI } = await import('@/di.js');
	return { useRouter: () => inject(DI.router) };
});
vi.mock('@/preferences.js', () => ({ prefer: {
	s: { numberOfPageCache: 3, animation: false }, r: { enableInfiniteScroll: { value: false } },
} }));
vi.mock('@/store.js', () => ({ store: { s: { realtimeMode: false } } }));
vi.mock('@/stream.js', () => ({ useStream: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { drive: 'Drive', emptyDrive: 'Empty', emptyFolder: 'Empty folder', deleteFolder: 'Delete folder' } } }));
vi.mock('@/os.js', () => ({ popupMenu: vi.fn() }));
vi.mock('@/utility/drive.js', () => ({}));
vi.mock('@/utility/achievements.js', () => ({}));
vi.mock('@/utility/get-drive-file-menu.js', () => ({}));
vi.mock('@/events.js', () => ({ globalEvents: { emit: vi.fn() }, useGlobalEvent: vi.fn() }));
vi.mock('@/components/MkButton.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent((_, { slots }) => () => h('button', slots.default?.())) };
});
vi.mock('@/components/MkDrive.folder.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ props: ['folder'], setup: props => () => h('button', { 'data-drive-folder': props.folder.id }, props.folder.name) }) };
});
vi.mock('@/components/MkDrive.navFolder.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ props: ['folder'], setup: props => () => h('button', { 'data-drive-nav-folder': props.folder?.id ?? 'root' }, props.folder?.name ?? 'Drive') }) };
});
vi.mock('@/components/MkDrive.file.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ props: ['file'], setup: props => () => h('button', { 'data-drive-file': props.file.id }, 'File') }) };
});

const parent: DriveFolder = { id: 'parent', createdAt: '2026-10-04T00:00:00.000Z', systemType: null, name: 'Parent', parentId: null, foldersCount: 1, filesCount: 0 };
const nested: DriveFolder = { ...parent, id: 'nested', name: 'Nested', parentId: 'parent', parent, foldersCount: 0, filesCount: 1 };
const listeners: EventListener[] = [];
let pendingFolder: Promise<DriveFolder> | undefined;
const global = {
	stubs: {
		MkStickyContainer: defineComponent((_, { slots }) => () => h('div', [slots.header?.(), slots.default?.(), slots.footer?.()])),
		MkTip: true,
		MkLoading: true,
	},
	directives: { anim: {}, appear: {} },
};

function mountDrive(path = '/my/drive') {
	const routes: RouteDef[] = [
		{ path: '/my/drive/folder/:folder', component: DrivePage, reuseComponent: true },
		{ path: '/my/drive', component: DrivePage },
		{ path: '/my/drive/file/:fileId', component: defineComponent(() => () => h('div', 'File preview')) },
	];
	const router = new Nirax(routes, path, true, {});
	window.history.replaceState(null, '', path);
	const addEventListener = vi.spyOn(window, 'addEventListener');
	bindRouterHistory(router);
	listeners.push(addEventListener.mock.calls.find(([event]) => String(event) === 'popstate')![1] as EventListener);
	const view = render(defineComponent(() => {
		provideMetadataReceiver(() => {});
		provide(DI.router, router as never);
		return () => h(RouterView);
	}), { global });
	return { router, ...view };
}

async function click(container: Element, selector: string) {
	await waitFor(() => expect(container.querySelector(selector)).not.toBeNull());
	await fireEvent.click(container.querySelector(selector)!);
}

async function expectFolder(container: Element, name: string) {
	await waitFor(() => expect(container.querySelector('nav')?.textContent).toBe(name));
}

beforeEach(() => {
	api.mockImplementation(async (endpoint: string, data: { folderId?: string | null }) => {
		switch (endpoint) {
			case 'drive/stats': return { usage: 0, capacity: 100, usagePercent: 0 };
			case 'drive/folders/show': return data.folderId === 'nested' ? pendingFolder ?? nested : parent;
			case 'drive/folders': return [parent, nested].filter(folder => folder.parentId === data.folderId);
			case 'drive/files': return data.folderId === 'nested' ? [{ id: 'file', createdAt: '2026-10-04T00:00:00.000Z' }] : [];
			case 'drive/folders/delete': return;
			default: throw new Error(`Unexpected endpoint: ${endpoint}`);
		}
	});
});

afterEach(() => {
	cleanup();
	for (const listener of listeners.splice(0)) window.removeEventListener('popstate', listener);
	vi.restoreAllMocks();
	api.mockReset();
	pendingFolder = undefined;
});

describe('Drive folder navigation', () => {
	test('browser back returns from file preview through each folder to root, and forward restores a folder', async () => {
		const { container, router } = mountDrive();
		// Happy DOM truncates forward history on replaceState; popstate already carries the target state.
		vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
		const pushState = vi.spyOn(window.history, 'pushState');
		await click(container, '[data-drive-folder="parent"]');
		await expectFolder(container, 'DriveParent');
		await click(container, '[data-drive-folder="nested"]');
		await expectFolder(container, 'DriveParentNested');
		await click(container, '[data-drive-file="file"]');
		await waitFor(() => expect(container.textContent).toBe('File preview'));
		window.history.back();
		await expectFolder(container, 'DriveParentNested');
		window.history.back();
		await expectFolder(container, 'DriveParent');
		window.history.back();
		await expectFolder(container, 'Drive');
		expect(router.getCurrentFullPath()).toBe('/my/drive');
		expect(pushState).toHaveBeenCalledTimes(3);
		window.history.forward();
		await waitFor(() => expect(router.getCurrentFullPath()).toBe('/my/drive/folder/parent'));
		await expectFolder(container, 'DriveParent');
		expect(router.getCurrentFullPath()).toBe('/my/drive/folder/parent');
		expect(pushState).toHaveBeenCalledTimes(3);
	});

	test('direct folder entry loads the requested folder without adding history, and breadcrumbs navigate to root', async () => {
		const pushState = vi.spyOn(window.history, 'pushState');
		const { container, router } = mountDrive('/my/drive/folder/nested');
		await expectFolder(container, 'DriveParentNested');
		expect(pushState).not.toHaveBeenCalled();
		await click(container, '[data-drive-nav-folder="root"]');
		await expectFolder(container, 'Drive');
		expect(router.getCurrentFullPath()).toBe('/my/drive');
		expect(pushState).toHaveBeenCalledOnce();
	});

	test('a late folder response cannot overwrite the folder restored by back', async () => {
		const { container, router } = mountDrive('/my/drive/folder/parent');
		await expectFolder(container, 'DriveParent');
		let resolveFolder!: (folder: DriveFolder) => void;
		pendingFolder = new Promise(resolve => { resolveFolder = resolve; });
		await click(container, '[data-drive-folder="nested"]');
		await waitFor(() => expect(api).toHaveBeenCalledWith('drive/folders/show', { folderId: 'nested' }));
		window.history.back();
		await waitFor(() => expect(router.getCurrentFullPath()).toBe('/my/drive/folder/parent'));
		await expectFolder(container, 'DriveParent');
		resolveFolder(nested);
		await pendingFolder;
		await new Promise(resolve => setTimeout(resolve, 0));
		await expectFolder(container, 'DriveParent');
	});

	test('deleting the current folder replaces its history entry with its parent', async () => {
		const { container, router } = mountDrive('/my/drive/folder/nested');
		await expectFolder(container, 'DriveParentNested');
		const replaceState = vi.spyOn(window.history, 'replaceState');
		const pushState = vi.spyOn(window.history, 'pushState');
		await click(container, 'nav > button');
		const menu = vi.mocked(os.popupMenu).mock.calls.at(-1)![0];
		const remove = menu?.find(item => item && 'text' in item && item.text === 'Delete folder');
		if (!remove || !('action' in remove)) throw new Error('Missing delete folder action');
		remove.action(new PointerEvent('click'));
		await expectFolder(container, 'DriveParent');
		expect(router.getCurrentFullPath()).toBe('/my/drive/folder/parent');
		expect(pushState).not.toHaveBeenCalled();
		expect(replaceState).toHaveBeenLastCalledWith(expect.anything(), '', '/my/drive/folder/parent');
	});

	test.each(['file', 'folder'] as const)('%s pickers change folders locally without navigating the page', async (select) => {
		const router = new Nirax<RouteDef[]>([{ path: '/outside', component: {} }], '/outside', true, {});
		const push = vi.spyOn(router, 'pushByPath');
		const { container } = render(defineComponent(() => {
			provide(DI.router, router as never);
			return () => h(MkDrive, { select, initialFolder: 'parent' });
		}), { global });
		await expectFolder(container, 'DriveParent');
		await click(container, '[data-drive-folder="nested"]');
		await expectFolder(container, 'DriveParentNested');
		await click(container, '[data-drive-nav-folder="root"]');
		await expectFolder(container, 'Drive');
		expect(push).not.toHaveBeenCalled();
		expect(router.getCurrentFullPath()).toBe('/outside');
	});
});
