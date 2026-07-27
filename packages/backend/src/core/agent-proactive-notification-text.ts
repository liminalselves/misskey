/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { agentPreviewText } from '@/core/agent-preview-text.js';

const MAX_NOTIFICATION_TEXT_LENGTH = 200;

/**
 * Builds a safe notification preview from an agent reply. Rich message
 * rendering remains unchanged in the chat; this is only for notification text.
 * Line breaks are preserved so proactive messages read naturally.
 */
export function buildAgentProactiveNotificationText(text: string): string {
	return agentPreviewText(text, { preserveNewlines: true, maxLength: MAX_NOTIFICATION_TEXT_LENGTH });
}
