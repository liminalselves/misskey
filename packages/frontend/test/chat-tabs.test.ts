/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, h, nextTick, provide } from 'vue';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import type { PropType } from 'vue';
import type { Tab } from '@/components/MkTabs.vue';
import ChatHome from '@/pages/chat/home.vue';
import RouterView from '@/components/global/RouterView.vue';
import { Nirax } from '@/lib/nirax.js';
import { ROUTE_DEF } from '@/router.definition.js';
import { DI } from '@/di.js';
import { provideMetadataReceiver } from '@/page.js';

const { instance } = vi.hoisted(() => ({ instance: { agentFeatureEnabled: true } }));
vi.mock('@/instance.js', () => ({ instance }));
vi.mock('@/i.js', () => ({ $i: { policies: { chatAvailability: 'available' } }, iAmAdmin: false, iAmModerator: false }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { numberOfPageCache: 3 } } }));
vi.mock('@/router.js', async () => {
	const { inject } = await import('vue');
	const { DI } = await import('@/di.js');
	return { useRouter: () => inject(DI.router) };
});
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	directMessage: 'Private messages', directMessage_short: 'Messages',
	_chat: { home: 'Home', invitations: 'Invitations', joiningRooms: 'Joined rooms', yourRooms: 'Owned rooms' },
	_agents: { chatTab: 'Agents' },
} } }));
vi.mock('@/pages/_loading_.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/_error_.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/timeline.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/agents/control-embed.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/home.home.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/home.directMessages.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/home.agents.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/home.invitations.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/home.joiningRooms.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/chat/home.ownedRooms.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPolkadots.vue', () => ({ default: { render: () => null } }));

const Header = defineComponent({
	props: { tab: String, tabs: { type: Array as PropType<Tab[]>, required: true } },
	emits: ['update:tab'],
	setup: (props, { emit, slots }) => () => h('div', [
		h('nav', props.tabs.map(tab => h('button', {
			'data-tab': tab.key,
			'aria-pressed': props.tab === tab.key,
			onClick: () => emit('update:tab', tab.key),
		}, tab.title))),
		slots.default?.(),
	]),
});

function mountChat(path = '/chat') {
	const route = ROUTE_DEF.find(item => item.path === '/chat');
	if (!route) throw new Error('Chat route not found');
	const router = new Nirax([{ ...route, component: ChatHome }], path, true, {});
	const view = render(defineComponent(() => {
		provideMetadataReceiver(() => {});
		provide(DI.router, router as never);
		return () => h(RouterView);
	}), { global: { stubs: { PageWithHeader: Header, MkLoading: true } } });
	return { router, ...view };
}

async function settle() {
	await nextTick();
	await nextTick();
}

afterEach(() => {
	cleanup();
	instance.agentFeatureEnabled = true;
	vi.restoreAllMocks();
});

describe('Chat tabs', () => {
	test.each(['directMessages', 'agents', 'invitations', 'joiningRooms', 'ownedRooms'])(
		'restores %s after reloading without adding history or remounting on tab changes',
		async tab => {
			const view = mountChat('/chat?source=menu#anchor');
			await settle();
			const header = view.container.querySelector('nav');
			const replace = vi.spyOn(view.router, 'replaceByPath');
			const push = vi.spyOn(view.router, 'pushByPath');
			await fireEvent.click(view.container.querySelector(`[data-tab="${tab}"]`)!);
			await settle();
			expect(view.router.getCurrentFullPath()).toBe(`/chat?source=menu&view=${tab}#anchor`);
			expect(replace).toHaveBeenCalledOnce();
			expect(push).not.toHaveBeenCalled();
			expect(view.container.querySelector('nav')).toBe(header);
			const path = view.router.getCurrentFullPath();
			view.unmount();
			const reloaded = mountChat(path);
			await settle();
			expect(reloaded.container.querySelector('[aria-pressed="true"]')?.getAttribute('data-tab')).toBe(tab);
		},
	);

	test('returning home clears only the view parameter and route updates select the matching tab', async () => {
		const view = mountChat('/chat?view=directMessages&source=menu#anchor');
		await settle();
		await fireEvent.click(view.container.querySelector('[data-tab="home"]')!);
		await settle();
		expect(view.router.getCurrentFullPath()).toBe('/chat?source=menu#anchor');
		view.router.replaceByPath('/chat?view=ownedRooms');
		await settle();
		expect(view.container.querySelector('[aria-pressed="true"]')?.getAttribute('data-tab')).toBe('ownedRooms');
	});

	test.each(['unknown', 'agents'])('falls back to home for an unavailable tab: %s', async tab => {
		instance.agentFeatureEnabled = false;
		const view = mountChat(`/chat?view=${tab}`);
		await settle();
		expect(view.container.querySelector('[aria-pressed="true"]')?.getAttribute('data-tab')).toBe('home');
	});
});
