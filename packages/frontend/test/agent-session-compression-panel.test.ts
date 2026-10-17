/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import type { App } from 'vue';
import CompressionPanel from '@/pages/chat/agent-session.compression.vue';
import type { CompressionOverviewPayload } from '@/pages/chat/agent-session.compression.vue';
import { misskeyApi } from '@/utility/misskey-api.js';

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn(), formatApiError: String }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { _agents: {}, reload: '刷新' } } }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/os.js', () => ({}));
vi.mock('@/components/global/MkLoading.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/agents/control-embed-loading.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkTextarea.vue', () => ({ default: { render: () => null } }));

let app: App | undefined;
let host: HTMLElement | undefined;

function overview(preview: CompressionOverviewPayload['injectionPreview']): CompressionOverviewPayload {
	return {
		historyBudgetTokens: 1000, t1Tokens: 800, t2Tokens: 900, t1Ratio: 0.8, t2Ratio: 0.9,
		messages: [], stickies: [], injectionPreview: preview,
	};
}

async function settle() {
	await nextTick();
	await nextTick();
	await nextTick();
}

beforeEach(() => { vi.mocked(misskeyApi).mockReset(); });
afterEach(() => {
	app?.unmount();
	host?.remove();
	app = undefined;
	host = undefined;
});

describe('Compression injection preview panel', () => {
	test.each([false, true])('renders and refreshes the server preview with review=%s', async review => {
		vi.mocked(misskeyApi).mockResolvedValue(overview({
			maxChars: 4000, eligibleCount: 12, eligibleChars: 15000, willInjectCount: 4, willInjectChars: 3998,
		}) as never);
		host = document.createElement('div');
		document.body.append(host);
		app = createApp(CompressionPanel, { sessionId: 's1', moderationLocked: review, review });
		app.mount(host);
		await settle();
		expect(misskeyApi).toHaveBeenCalledExactlyOnceWith(
			review ? 'admin/agents/governance/session-review/compression-overview' : 'agents/sessions/compression-overview',
			{ sessionId: 's1' },
		);
		host.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click();
		await settle();
		expect(host.textContent).toContain('预计注入 4/12 条 · 3998/4000 字符');
		expect(host.textContent).toContain('首条可能只保留部分');

		vi.mocked(misskeyApi).mockResolvedValue(overview(null) as never);
		host.querySelector<HTMLButtonElement>('button[title="刷新"]')!.click();
		await settle();
		expect(host.textContent).not.toContain('预计注入');
		expect(vi.mocked(misskeyApi).mock.calls.every(([endpoint]) => endpoint.endsWith('compression-overview'))).toBe(true);
	});
});
