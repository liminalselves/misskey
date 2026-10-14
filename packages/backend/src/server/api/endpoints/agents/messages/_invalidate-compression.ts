/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { EntityManager } from 'typeorm';
import { MiAgentSessionCompressionSticky } from '@/models/AgentSessionCompressionSticky.js';

export async function invalidateMessageCompression(manager: EntityManager, sessionId: string): Promise<void> {
	// User-authored summaries are independent content, not a cache of the edited history.
	await manager.createQueryBuilder().update(MiAgentSessionCompressionSticky)
		.set({ state: 'stale', sourceFingerprint: null, updatedAt: new Date() })
		.where('"sessionId" = :sessionId AND "userOverridden" = false', { sessionId })
		.execute();
}
