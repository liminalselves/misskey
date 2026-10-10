/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { showUnreadAgentModelAnnouncements } from '@/utility/agent-model-announcements.js';
import type { AgentModelAnnouncement } from '@/utility/agent-model-announcements.js';

const { api, popup, dispose, account } = vi.hoisted(() => ({
	api: vi.fn(),
	popup: vi.fn(),
	dispose: vi.fn(),
	account: { id: 'user' },
}));
vi.mock('@/i.js', () => ({ $i: account }));
vi.mock('@/os.js', () => ({ popup }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: api }));
vi.mock('@/components/MkAgentModelAnnouncementDialog.vue', () => ({ default: {} }));

const announcements: AgentModelAnnouncement[] = [{
	id: '002', createdAt: '2026-10-09T00:00:00.000Z', scope: 'chat', title: '模型更新', text: '', changes: [],
}];

beforeEach(() => {
	api.mockReset();
	popup.mockReset().mockReturnValue({ dispose });
	dispose.mockReset();
});

describe('agent model announcement entry checks', () => {
	test('deduplicates overlapping entry checks and keeps the dialog unique until closed', async () => {
		api.mockResolvedValue(announcements);
		await Promise.all([showUnreadAgentModelAnnouncements(() => true), showUnreadAgentModelAnnouncements(() => true)]);
		expect(api).toHaveBeenCalledTimes(1);
		expect(popup).toHaveBeenCalledTimes(1);
		expect(popup.mock.calls[0][1]).toEqual({ announcements, userId: 'user' });
		await showUnreadAgentModelAnnouncements(() => true);
		expect(api).toHaveBeenCalledTimes(1);
		popup.mock.calls[0][2].closed();
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	test('does not open a late response after leaving the conversation', async () => {
		let resolve!: (value: AgentModelAnnouncement[]) => void;
		api.mockReturnValue(new Promise<AgentModelAnnouncement[]>(done => { resolve = done; }));
		let active = true;
		const pending = showUnreadAgentModelAnnouncements(() => active);
		active = false;
		resolve(announcements);
		await pending;
		expect(popup).not.toHaveBeenCalled();
	});

	test('skips inactive pages and empty unread results without marking anything read', async () => {
		await showUnreadAgentModelAnnouncements(() => false);
		expect(api).not.toHaveBeenCalled();
		api.mockResolvedValue([]);
		await showUnreadAgentModelAnnouncements(() => true);
		expect(api).toHaveBeenCalledWith('agents/model-announcements/unread', {});
		expect(api).toHaveBeenCalledTimes(1);
		expect(popup).not.toHaveBeenCalled();
	});
});
