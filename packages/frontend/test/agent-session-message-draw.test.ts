/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import type { App } from 'vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { resolveAgentSessionReviewCall } from '@/utility/agent-session-review.js';
import AgentSessionMessage from '@/pages/chat/agent-session.message.vue';

vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'moderator' }) }));
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
vi.mock('@/os.js', () => ({ alert: vi.fn(), toast: vi.fn(), popupMenu: vi.fn(), contextMenu: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn(), formatApiError: vi.fn() }));
vi.mock('@/components/global/MkTime.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkLoading.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkCustomEmoji.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkDeletedFileMedia.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkMediaList.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return {
		default: defineComponent({
			props: ['mediaList'],
			setup: props => () => h('div', (props.mediaList as Array<{ id: string; url: string }>).map(file =>
				h('img', { src: file.url, 'data-file-id': file.id }),
			)),
		}),
	};
});

const api = vi.mocked(misskeyApi);
const statusEndpoint = 'admin/agents/governance/session-review/image-placeholder-status';
const drawResult = {
	id: 'image1',
	messageId: 'message1',
	placeholderIndex: 0,
	status: 'succeeded',
	fileId: 'file1',
	url: 'https://example.com/image.png',
	file: { id: 'file1', url: 'https://example.com/image.png' },
	errorCode: null,
	errorMessage: null,
	tag: 'test image',
	size: 'portrait',
	isBlocked: false,
};

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
		message: { id: 'message1', role: 'assistant', content: '[[agent_draw tag=test image]]', createdAt: '2026-10-07T00:00:00Z' },
		review: true,
		autoDrawEnabled: true,
		autoDrawCount: 1,
		drawModelReady: true,
		liveArrived: false,
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
	api.mockReset();
});
afterEach(() => {
	app?.unmount();
	host?.remove();
	app = undefined;
	host = undefined;
});

describe('Agent session image review', () => {
	test('reads an existing image through the review endpoint without generation controls', async () => {
		api.mockResolvedValue(drawResult as never);
		const { host } = await mountMessage();

		expect(api).toHaveBeenCalledExactlyOnceWith(statusEndpoint, { sessionId: 'session1', messageId: 'message1', placeholderIndex: 0 });
		expect(host.querySelector('img[data-file-id="file1"]')?.getAttribute('src')).toBe(drawResult.url);
		expect(host.textContent).not.toContain('该图片尚未自动生成');
		expect(host.textContent).not.toContain('手动生成');
		expect(host.querySelector('button[title="重新生成"]')).toBeNull();
	});

	test('shows an ungenerated placeholder but never starts generation, including setting changes and new arrivals', async () => {
		api.mockResolvedValue(null as never);
		const { host, props } = await mountMessage({ liveArrived: true, autoDrawEnabled: false });
		expect(host.textContent).toContain('该图片尚未自动生成');
		expect(host.textContent).not.toContain('手动生成');

		props.autoDrawEnabled = true;
		props.autoDrawCount = 3;
		await settle();
		props.message = { ...props.message, id: 'message2' };
		await settle();

		expect(api.mock.calls.every(([endpoint]) => String(endpoint) === statusEndpoint)).toBe(true);
		expect(host.querySelector('button[title="重新生成"]')).toBeNull();
		expect(host.textContent).not.toContain('手动生成');
	});

	test('does not misreport a failed status read as an ungenerated image', async () => {
		api.mockRejectedValue({ code: 'NO_SUCH_SESSION' });
		const { host } = await mountMessage();

		expect(host.textContent).toContain('图片状态读取失败');
		expect(host.textContent).not.toContain('该图片尚未自动生成');
		expect(host.textContent).not.toContain('手动生成');
		expect(host.querySelector('button[title="重新生成"]')).toBeNull();
	});

	test('does not expose blocked images or regeneration controls', async () => {
		api.mockResolvedValue({ ...drawResult, status: 'blocked', isBlocked: true, file: null, url: null } as never);
		const { host } = await mountMessage();

		expect(host.textContent).toContain('图片已被审核封禁');
		expect(host.querySelector('img')).toBeNull();
		expect(host.querySelector('button[title="重新生成"]')).toBeNull();
	});

	test('preserves manual generation in the user session', async () => {
		api.mockResolvedValueOnce(null as never).mockResolvedValueOnce(drawResult as never);
		const { host } = await mountMessage({ review: false });
		const button = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.includes('手动生成'));
		expect(button).toBeDefined();
		button!.click();
		await settle();

		expect(api.mock.calls.map(([endpoint]) => endpoint)).toEqual(['agents/images/placeholder-status', 'agents/images/generate-placeholder']);
		expect(host.querySelector('img[data-file-id="file1"]')).not.toBeNull();
	});

	test('preserves automatic generation only for new messages in the user session', async () => {
		api.mockResolvedValue(drawResult as never);
		await mountMessage({ review: false, liveArrived: true });
		expect(api.mock.calls.map(([endpoint]) => endpoint)).toEqual(['agents/images/generate-placeholder']);
	});

	test('maps only status reads, never generation writes', () => {
		expect(resolveAgentSessionReviewCall('agents/images/placeholder-status', { sessionId: 'session1' }, 'session1')?.endpoint).toBe(statusEndpoint);
		expect(resolveAgentSessionReviewCall('agents/images/generate-placeholder', { sessionId: 'session1' }, 'session1')).toBeNull();
	});
});
