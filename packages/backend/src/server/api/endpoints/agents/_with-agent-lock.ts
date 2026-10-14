/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DataSource, EntityManager } from 'typeorm';
import { MiAgentCharacter } from '@/models/AgentCharacter.js';
import { MiAgentDialogueStyle } from '@/models/AgentDialogueStyle.js';
import { MiAgentSession } from '@/models/AgentSession.js';
import { ApiError } from '@/server/api/error.js';

export function withWritableAgentSession<T>(
	db: DataSource,
	id: string,
	userId: string,
	callback: (row: MiAgentSession, manager: EntityManager) => Promise<T>,
): Promise<T> {
	return db.transaction(async manager => {
		const row = await manager.findOne(MiAgentSession, {
			where: { id, userId },
			lock: { mode: 'pessimistic_write' },
		});
		if (!row) throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: '6986b7e5-4ca4-4929-ae23-d55b8e73ff55' });
		if (row.agentReplyPending) throw new ApiError({ message: 'A reply is still being generated for this session.', code: 'AGENT_REPLY_PENDING', id: '25d8df7d-49ac-49e5-9602-a739548ec00c', kind: 'client', httpStatusCode: 409 });
		return callback(row, manager);
	});
}

export function withLockedAgentCharacter<T>(
	db: DataSource,
	id: string,
	callback: (row: MiAgentCharacter | null, manager: EntityManager) => Promise<T>,
): Promise<T> {
	return db.transaction(async manager => {
		const row = await manager.findOne(MiAgentCharacter, {
			where: { id },
			lock: { mode: 'pessimistic_write' },
		});
		return callback(row, manager);
	});
}

export function withLockedAgentStyle<T>(
	db: DataSource,
	id: string,
	callback: (row: MiAgentDialogueStyle | null, manager: EntityManager) => Promise<T>,
): Promise<T> {
	return db.transaction(async manager => {
		const row = await manager.findOne(MiAgentDialogueStyle, {
			where: { id },
			lock: { mode: 'pessimistic_write' },
		});
		return callback(row, manager);
	});
}
