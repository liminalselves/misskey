/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { $i } from '@/i.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';

export type AgentModelAnnouncement = {
	id: string;
	createdAt: string;
	scope: 'all' | 'chat' | 'image';
	title: string;
	text: string;
	changes: {
		kind: 'chat' | 'image';
		modelId: string;
		modelName: string;
		type: 'added' | 'relisted' | 'removed' | 'modified';
		fields: { label: string; before: string; after: string }[];
	}[];
};

const pendingUsers = new Set<string>();

export async function showUnreadAgentModelAnnouncements(isActive: () => boolean): Promise<void> {
	const userId = $i?.id;
	if (!userId || pendingUsers.has(userId) || !isActive()) return;
	pendingUsers.add(userId);
	let opened = false;
	try {
		const announcements = await (misskeyApi as unknown as (endpoint: string, data: Record<string, never>) => Promise<AgentModelAnnouncement[]>)(
			'agents/model-announcements/unread', {},
		);
		if (announcements.length === 0) return;
		const { default: dialog } = await import('@/components/MkAgentModelAnnouncementDialog.vue');
		if ($i?.id !== userId || !isActive()) return;
		const { dispose } = os.popup(dialog, { announcements, userId }, {
			closed: () => {
				dispose();
				pendingUsers.delete(userId);
			},
		});
		opened = true;
	} catch (error) {
		console.warn('Failed to load agent model announcements', error);
	} finally {
		if (!opened) pendingUsers.delete(userId);
	}
}
