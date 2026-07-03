/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

export async function confirmStartAgentSession(): Promise<boolean> {
	const { canceled } = await os.confirm({
		type: 'question',
		title: i18n.ts._agents.startAgentSessionConfirmTitle,
		text: i18n.ts._agents.startAgentSessionConfirmText,
		okText: i18n.ts._agents.startAgentSessionConfirmOk,
	});

	return !canceled;
}
