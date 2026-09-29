/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DataSource, EntityManager } from 'typeorm';
import { MiAgentCharacter } from '@/models/AgentCharacter.js';
import { MiAgentDialogueStyle } from '@/models/AgentDialogueStyle.js';

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
