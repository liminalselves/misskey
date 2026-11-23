/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, effectScope, h, nextTick, provide, reactive, ref, watch } from 'vue';
import { cleanup, render } from '@testing-library/vue';
import { transpileModule } from 'typescript';
import ControlEmbedContent from '@/pages/agents/control-embed-content.vue';
import RouterView from '@/components/global/RouterView.vue';
import { Nirax } from '@/lib/nirax.js';
import { ROUTE_DEF } from '@/router.definition.js';
import { DI } from '@/di.js';
import { setAgentControlEmbedActive, setAgentControlRuntimeToken } from '@/utility/agent-control-embed.js';

vi.mock('@/instance.js', () => ({ instance: { agentFeatureEnabled: true } }));
vi.mock('@/i.js', () => ({ $i: null, iAmAdmin: false, iAmModerator: false }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { numberOfPageCache: 3 } } }));
vi.mock('@/router.js', async () => {
	const { inject } = await import('vue');
	const { DI } = await import('@/di.js');
	return { useRouter: () => inject(DI.router) };
});
vi.mock('@/theme.js', () => ({ themeManager: { on: vi.fn(), off: vi.fn() } }));
vi.mock('@@/js/theme.js', () => ({
	compile: () => ({ bg: '#111111', panel: '#222222', fg: '#eeeeee', accent: '#ff9900', divider: '#333333' }),
}));
vi.mock('@/pages/_loading_.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/_error_.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/timeline.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/agents/control-embed-loading.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/agent-session.vue', () => ({
	default: defineComponent({
		props: ['sessionId', 'embeddedPanel'],
		template: '<div data-agent-session :data-session-id="sessionId" :data-panel="embeddedPanel"/>',
	}),
}));

const origResizeObserver = globalThis.ResizeObserver;
let parentPostMessage: ReturnType<typeof vi.fn>;
let parentWindow: Window;

function dispatchParentMessage(data: unknown) {
	const event = new MessageEvent('message', {
		origin: 'https://host.example',
		data,
	});
	Object.defineProperty(event, 'source', { value: parentWindow, configurable: true });
	window.dispatchEvent(event);
}

beforeEach(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	vi.spyOn(window, 'matchMedia').mockReturnValue({
		matches: false,
		media: '',
		onchange: null,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatchEvent: vi.fn(),
	} as unknown as MediaQueryList);
	vi.spyOn(window.document, 'referrer', 'get').mockReturnValue('https://host.example/app');
	parentPostMessage = vi.fn();
	parentWindow = { postMessage: parentPostMessage } as unknown as Window;
	vi.spyOn(window, 'parent', 'get').mockReturnValue(parentWindow);
	vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(240);
});

afterEach(() => {
	cleanup();
	setAgentControlEmbedActive(false);
	setAgentControlRuntimeToken(null);
	globalThis.ResizeObserver = origResizeObserver;
	vi.restoreAllMocks();
});

describe('Agent control embed setPanel switching', () => {
	test('ROUTE_DEF reuses embed route and control-embed-content emits ready and height on set-panel without losing auth', async () => {
		const route = ROUTE_DEF.find(item => item.path === '/agents/embed/:sessionId/:panel');
		expect(route?.reuseComponent).toBe(true);

		const router = new Nirax([{ ...route!, component: ControlEmbedContent }], '/agents/embed/s1/memory', true, {});
		const { container } = render(defineComponent(() => {
			provide(DI.router, router as never);
			return () => h(RouterView);
		}), { global: { stubs: { MkLoading: true } } });
		await nextTick();
		await nextTick();

		expect(parentPostMessage).toHaveBeenCalledWith(
			{ type: 'misskey:agent-control:ready', version: 1, sessionId: 's1', panel: 'memory' },
			'https://host.example',
		);

		dispatchParentMessage({
			type: 'misskey:agent-control:configure',
			token: 'tok-1',
			appearance: { colorScheme: 'dark' },
		});
		await nextTick();
		await nextTick();

		const initialPanelEl = container.querySelector('[data-agent-session]');
		expect(initialPanelEl?.getAttribute('data-panel')).toBe('memory');

		parentPostMessage.mockClear();

		dispatchParentMessage({
			type: 'misskey:agent-control:set-panel',
			panel: 'worldbook',
		});
		await vi.waitFor(() => {
			expect(parentPostMessage).toHaveBeenCalledWith(
				{ type: 'misskey:agent-control:height', height: 240 },
				'https://host.example',
			);
		});

		expect(router.getCurrentFullPath()).toBe('/agents/embed/s1/worldbook');
		const switchedPanelEl = container.querySelector('[data-agent-session]');
		expect(switchedPanelEl).toBe(initialPanelEl);
		expect(switchedPanelEl?.getAttribute('data-panel')).toBe('worldbook');
		expect(parentPostMessage).toHaveBeenCalledWith(
			{ type: 'misskey:agent-control:ready', version: 1, sessionId: 's1', panel: 'worldbook' },
			'https://host.example',
		);
		const readyCalls = parentPostMessage.mock.calls.filter(([msg]) => (msg as { type?: string } | undefined)?.type === 'misskey:agent-control:ready');
		expect(readyCalls).toHaveLength(1);
	});

	test('agent-session.vue updates tab and loads model catalogs when embeddedPanel switches to model', async () => {
		const source = readFileSync(resolve(process.cwd(), 'src/pages/chat/agent-session.vue'), 'utf8');
		const start = source.indexOf('watch(() => props.embeddedPanel,');
		const end = source.indexOf('\n/**\n * 子面板动态数据统一刷新入口', start);
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
		const script = transpileModule(source.slice(start, end), {}).outputText;

		const props = reactive<{ embeddedPanel: string }>({ embeddedPanel: 'memory' });
		const tab = ref('memory');
		const loading = ref(false);
		const isSessionBannedPage = ref(false);
		const loadUserModels = vi.fn();
		const loadVisionModels = vi.fn();

		const scope = effectScope();
		try {
			scope.run(() => {
				new Function('props', 'tab', 'loading', 'isSessionBannedPage', 'loadUserModels', 'loadVisionModels', 'watch', script)(
					props, tab, loading, isSessionBannedPage, loadUserModels, loadVisionModels, watch,
				);
			});

			props.embeddedPanel = 'worldbook';
			await nextTick();
			expect(tab.value).toBe('worldbook');
			expect(loadUserModels).not.toHaveBeenCalled();

			props.embeddedPanel = 'model';
			await nextTick();
			expect(tab.value).toBe('model');
			expect(loadUserModels).toHaveBeenCalledOnce();
			expect(loadVisionModels).toHaveBeenCalledOnce();
		} finally {
			scope.stop();
		}
	});
});
