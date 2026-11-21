/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';

export function formatUserDisplayName(user: Misskey.entities.UserLite | null | undefined, fallbackId?: string | null): string {
	if (user) {
		return (user.name && user.name.trim()) ? user.name : user.username;
	}
	return fallbackId ?? '';
}

export function formatRecallNoticeText(message: {
	fromUserId: string;
	fromUser?: Misskey.entities.UserLite | null;
	recalledById?: string | null;
	recalledBy?: Misskey.entities.UserLite | null;
}): string {
	const targetName = formatUserDisplayName(message.fromUser, message.fromUserId);
	if (message.recalledById == null || message.recalledById === message.fromUserId) {
		return i18n.tsx._chat.recalledMessageNotice({ user: targetName });
	}
	const actorName = formatUserDisplayName(message.recalledBy, message.recalledById);
	return i18n.tsx._chat.groupRecalledMessageNotice({ actor: actorName, target: targetName });
}
