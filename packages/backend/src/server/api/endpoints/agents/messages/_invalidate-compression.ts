/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { In, type EntityManager } from 'typeorm';
import { MiAgentMessage } from '@/models/AgentMessage.js';
import { MiAgentSessionCompressionSticky } from '@/models/AgentSessionCompressionSticky.js';

type MessageBoundary = Pick<MiAgentMessage, 'id' | 'createdAt'>;

export async function invalidateMessageCompression(
	manager: EntityManager,
	sessionId: string,
	from: MessageBoundary,
	to: MessageBoundary | null = from,
): Promise<void> {
	// Resolve source boundaries before deleting messages; null means rollback through the end.
	const stickies = await manager.find(MiAgentSessionCompressionSticky, {
		where: { sessionId, userOverridden: false }, select: ['id', 'fromMessageId', 'toMessageId'],
	});
	if (stickies.length === 0) return;
	const boundaryIds = [...new Set(stickies.flatMap(sticky => [sticky.fromMessageId, sticky.toMessageId]))];
	const messages = await manager.find(MiAgentMessage, {
		where: { sessionId, id: In(boundaryIds) }, select: ['id', 'createdAt'],
	});
	const boundaries = new Map(messages.map(message => [message.id, message]));
	const compare = (a: MessageBoundary, b: MessageBoundary): number => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
	const affectedIds = stickies.filter(sticky => {
		const first = boundaries.get(sticky.fromMessageId);
		const last = boundaries.get(sticky.toMessageId);
		if (!first || !last) return false;
		const [lo, hi] = compare(first, last) <= 0 ? [first, last] : [last, first];
		return compare(hi, from) >= 0 && (to == null || compare(lo, to) <= 0);
	}).map(sticky => sticky.id);
	if (affectedIds.length === 0) return;
	await manager.update(MiAgentSessionCompressionSticky, { sessionId, id: In(affectedIds), userOverridden: false }, {
		state: 'stale', sourceFingerprint: null, updatedAt: new Date(),
	});
}
