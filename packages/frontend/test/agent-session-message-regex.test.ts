/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import type { App } from 'vue';
import { filterAgentRegexTexts, type AgentRegexFilterRule } from '@/utility/agent-regex-filter.js';
import AgentSessionMessage from '@/pages/chat/agent-session.message.vue';

vi.mock('@/i.js', () => ({ $i: null, ensureSignin: () => ({ id: 'user1' }) }));
vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			_agents: { imageDrawManualPending: '该图片尚未自动生成', imageDrawManualGenerate: '手动生成' },
		},
	},
}));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, 'chat.showSenderName': false } } }));
vi.mock('@/instance.js', () => ({ instance: { agentStickerEnabled: false } }));
vi.mock('@/custom-emojis.js', () => ({ customEmojisMap: new Map() }));
vi.mock('@/os.js', () => ({ alert: vi.fn(), toast: vi.fn(), popupMenu: vi.fn(), contextMenu: vi.fn(), confirm: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn(), formatApiError: vi.fn() }));
vi.mock('@/components/global/MkTime.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkLoading.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkCustomEmoji.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkDeletedFileMedia.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkMediaList.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkFukidashi.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return {
		default: defineComponent({
			setup: (_props, { slots }) => () => h('div', { 'data-bubble': '' }, slots.default?.()),
		}),
	};
});
// 仅替换异步过滤入口，保持模块其余导出为真实实现
vi.mock('@/utility/agent-regex-filter.js', async (importOriginal) => ({
	...(await importOriginal<object>()),
	filterAgentRegexTexts: vi.fn(),
}));

const filterMock = vi.mocked(filterAgentRegexTexts);

let app: App | undefined;
let host: HTMLElement | undefined;

async function settle() {
	await nextTick();
	await nextTick();
	await nextTick();
}

async function mountMessage(overrides: Partial<InstanceType<typeof AgentSessionMessage>['$props']> = {}) {
	const props = reactive({
		sessionId: 'session1',
		message: { id: 'message1', role: 'assistant', content: 'visible text', createdAt: '2026-10-07T00:00:00Z' },
		...overrides,
	});
	host = document.createElement('div');
	document.body.append(host);
	app = createApp(defineComponent({ setup: () => () => h(AgentSessionMessage, props) }));
	app.component('MkAvatar', defineComponent(() => () => h('span')));
	app.component('MkA', defineComponent(() => () => h('a')));
	app.mount(host);
	await settle();
	return { host, props };
}

beforeEach(() => {
	filterMock.mockReset();
});
afterEach(() => {
	app?.unmount();
	host?.remove();
	app = undefined;
	host = undefined;
});

describe('Agent session message hide-rules rendering', () => {
	test('does not render an empty bubble while the worker filters, then shows the filtered text', async () => {
		let resolveFilter: ((results: string[] | null) => void) | undefined;
		filterMock.mockReturnValue(new Promise<string[] | null>(resolve => {
			resolveFilter = resolve;
		}));
		const { host } = await mountMessage({
			message: { id: 'm1', role: 'assistant', content: '[[agent_cue smile]] secret-plan visible', createdAt: '2026-10-07T00:00:00Z' },
			regexRules: [{ id: 'r1', pattern: 'secret-plan\\s*', targets: ['assistant'], effects: ['hide'] }],
		});
		// Pending filter: no empty bubble is mounted, so there is no empty-to-full-width move.
		expect(host.querySelectorAll('[data-bubble]')).toHaveLength(0);
		expect(host.textContent).not.toContain('secret-plan');
		expect(host.textContent).not.toContain('visible');
		resolveFilter?.(['visible']);
		await settle();
		expect(host.querySelectorAll('[data-bubble]')).toHaveLength(1);
		expect(host.textContent).toContain('visible');
		expect(host.textContent).not.toContain('secret-plan');
		expect(host.textContent).not.toContain('agent_cue');
		expect(filterMock).toHaveBeenCalledTimes(1);
		expect(filterMock.mock.calls[0][1]).toBe('hide');
	});

	test('coalesces optimistic and persisted mounts and reuses the filtered text on later mounts', async () => {
		let resolveFilter: ((results: string[] | null) => void) | undefined;
		filterMock.mockReturnValue(new Promise<string[] | null>(resolve => {
			resolveFilter = resolve;
		}));
		const rules: Array<AgentRegexFilterRule & { id: string }> = [{ id: 'r1', pattern: 'secret\\s*', targets: ['user'], effects: ['hide'] }];
		await mountMessage({
			message: { id: 'agent-opt:1', role: 'user', content: 'optimistic secret visible', createdAt: '2026-10-07T00:00:00Z' },
			regexRules: rules,
		});
		app?.unmount();
		host?.remove();

		const persisted = await mountMessage({
			message: { id: 'persisted-1', role: 'user', content: 'optimistic secret visible', createdAt: '2026-10-07T00:00:00Z' },
			regexRules: rules,
		});
		expect(filterMock).toHaveBeenCalledTimes(1);
		resolveFilter?.(['visible']);
		await settle();
		expect(persisted.host.textContent).toContain('visible');

		app?.unmount();
		host?.remove();
		const history = await mountMessage({
			message: { id: 'persisted-1', role: 'user', content: 'optimistic secret visible', createdAt: '2026-10-07T00:00:00Z' },
			regexRules: rules,
		});
		expect(history.host.textContent).toContain('visible');
		expect(history.host.querySelectorAll('[data-bubble]')).toHaveLength(1);
		expect(filterMock).toHaveBeenCalledTimes(1);
	});

	test('falls back to the raw text when the worker times out', async () => {
		filterMock.mockResolvedValue(null);
		const { host } = await mountMessage({
			message: { id: 'm1', role: 'assistant', content: 'secret-plan visible [[agent_cue smile]]', createdAt: '2026-10-07T00:00:00Z' },
			regexRules: [{ id: 'r1', pattern: 'secret-plan\\s*', targets: ['assistant'], effects: ['hide'] }],
		});
		await settle();
		// Timeout fallback: raw text stays usable, agent cues are still stripped.
		expect(host.textContent).toContain('secret-plan');
		expect(host.textContent).toContain('visible');
		expect(host.textContent).not.toContain('agent_cue');
	});

	test('renders synchronously without the worker when no hide rule applies', async () => {
		filterMock.mockImplementation(() => {
			throw new Error('worker filter must not be called');
		});
		const { host } = await mountMessage({
			message: { id: 'm1', role: 'user', content: 'plain text [[agent_cue smile]]', createdAt: '2026-10-07T00:00:00Z' },
			regexRules: [{ id: 'r1', pattern: 'nothing', targets: ['assistant'], effects: ['aiInvisible'] }],
		});
		await settle();
		expect(host.textContent).toContain('plain text');
		expect(host.textContent).not.toContain('agent_cue');
		expect(filterMock).not.toHaveBeenCalled();
	});

	test('unmounting with an in-flight filter produces no errors', async () => {
		let resolveFilter: ((results: string[] | null) => void) | undefined;
		filterMock.mockReturnValue(new Promise<string[] | null>(resolve => {
			resolveFilter = resolve;
		}));
		await mountMessage({
			message: { id: 'm1', role: 'assistant', content: 'secret-plan visible', createdAt: '2026-10-07T00:00:00Z' },
			regexRules: [{ id: 'r1', pattern: 'secret-plan\\s*', targets: ['assistant'], effects: ['hide'] }],
		});
		app?.unmount();
		resolveFilter?.(null);
		await settle();
	});
});
