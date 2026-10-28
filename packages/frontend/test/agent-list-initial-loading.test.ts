/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import AgentsIndex from '@/pages/agents/index.vue';
import AgentSessions from '@/pages/chat/home.agents.vue';
import { misskeyApi } from '@/utility/misskey-api.js';

vi.mock('@@/js/locale.js', () => ({ locale: {} }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn(), formatApiError: vi.fn() }));
vi.mock('@/os.js', () => ({ alert: vi.fn(), toast: vi.fn() }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/stream.js', () => ({ useStream: () => ({ useChannel: () => ({ on: vi.fn(), dispose: vi.fn() }) }) }));
vi.mock('@/utility/confirm-start-agent-session.js', () => ({ confirmStartAgentSession: vi.fn() }));
vi.mock('@/pages/agents/square.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/agents/my-stats.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/agents/models.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/agents/checkin.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkLoading.vue', () => ({ default: { template: '<span data-loading>Loading</span>' } }));
vi.mock('@/components/global/MkTime.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkAvatar.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkUserName.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkDriveFileThumbnail.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkTab.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkInput.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/MkFoldableSection.vue', () => ({ default: { template: '<section><slot/></section>' } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { template: '<a><slot/></a>' } }));

const apiMock = vi.mocked(misskeyApi);
const global = {
	stubs: { PageWithHeader: { template: '<div><slot/></div>' } },
	components: {
		// Render the default slot so error results expose their retry button.
		MkResult: { template: '<div data-result><slot/></div>' },
	},
	directives: { appear: {}, panel: {} },
};
let requests: Map<string, (rows: unknown[]) => void>;

beforeEach(() => {
	requests = new Map();
	apiMock.mockReset();
	apiMock.mockImplementation((endpoint) => new Promise(resolve => {
		requests.set(endpoint, resolve);
	}));
});

afterEach(cleanup);

async function finishRequest(endpoint: string, rows: unknown[]) {
	const resolve = requests.get(endpoint);
	expect(resolve).toBeDefined();
	resolve?.(rows);
	await nextTick();
	await nextTick();
}

describe('Agent list initial requests', () => {
	test.each(['characters', 'styles'])('loads the creation %s list on mount and clears the spinner', async (sub) => {
		const { container } = render(AgentsIndex, { props: { view: 'create', sub }, global });
		expect(apiMock).toHaveBeenCalledTimes(2);
		expect(apiMock).toHaveBeenCalledWith('agents/characters/list-mine', { limit: 31 });
		expect(apiMock).toHaveBeenCalledWith('agents/styles/list-mine', { limit: 31 });
		await nextTick();
		expect(container.querySelector('[data-loading]')).not.toBeNull();
		await finishRequest(`agents/${sub}/list-mine`, [{
			id: 'entry1', name: 'Loaded entry', createdAt: '2026-10-18T00:00:00Z', updatedAt: '2026-10-18T00:00:00Z', user: {},
		}]);
		expect(container.querySelector('[data-loading]')).toBeNull();
		expect(container.textContent).toContain('Loaded entry');
		await finishRequest(`agents/${sub === 'characters' ? 'styles' : 'characters'}/list-mine`, []);
	});

	test('loads the chat session list on mount and clears the spinner', async () => {
		const { container } = render(AgentSessions, { global });
		expect(apiMock).toHaveBeenCalledExactlyOnceWith('agents/sessions/list-mine', { limit: 31 });
		await nextTick();
		expect(container.querySelector('[data-loading]')).not.toBeNull();
		await finishRequest('agents/sessions/list-mine', [{
			id: 'session1', name: 'Loaded session', characterName: 'Character', sessionKind: 'draft_test', lastMessageAt: '2026-10-18T00:00:00Z',
		}]);
		expect(container.querySelector('[data-loading]')).toBeNull();
		expect(container.textContent).toContain('Loaded session');
	});
});

describe('Agent list load failures keep a retry entry', () => {
	test('chat agents tab: failed first load shows an error result whose retry reloads', async () => {
		apiMock.mockReset();
		apiMock.mockRejectedValueOnce(new Error('offline'));
		apiMock.mockImplementation((endpoint) => new Promise(resolve => {
			requests.set(endpoint, resolve);
		}));
		const { container } = render(AgentSessions, { global });
		expect(apiMock).toHaveBeenCalledTimes(1);
		await nextTick();
		await nextTick();
		// 失败不复位 loading 之外的任何 spinner 死锁：错误态出现且带重试按钮
		expect(container.querySelector('[data-loading]')).toBeNull();
		const retry = container.querySelector('[data-result] button');
		expect(retry).not.toBeNull();

		fireEvent.click(retry!);
		await nextTick();
		expect(apiMock).toHaveBeenCalledTimes(2);
		await finishRequest('agents/sessions/list-mine', [{
			id: 'session1', name: 'Retried session', characterName: 'Character', sessionKind: 'draft_test', lastMessageAt: '2026-10-18T00:00:00Z',
		}]);
		expect(container.textContent).toContain('Retried session');
	});

	test('create characters tab: failed first load shows an error result whose retry reloads', async () => {
		apiMock.mockReset();
		apiMock.mockRejectedValueOnce(new Error('offline'));
		apiMock.mockImplementation((endpoint) => new Promise(resolve => {
			requests.set(endpoint, resolve);
		}));
		const { container } = render(AgentsIndex, { props: { view: 'create', sub: 'characters' }, global });
		await nextTick();
		await nextTick();
		const retry = container.querySelector('[data-result] button');
		expect(retry).not.toBeNull();

		fireEvent.click(retry!);
		await nextTick();
		await finishRequest('agents/characters/list-mine', [{
			id: 'entry1', name: 'Recovered entry', createdAt: '2026-10-18T00:00:00Z', updatedAt: '2026-10-18T00:00:00Z', user: {},
		}]);
		expect(container.textContent).toContain('Recovered entry');
		// styles 列表请求仍在 pending，收尾避免悬挂 promise
		await finishRequest('agents/styles/list-mine', []);
	});
});
