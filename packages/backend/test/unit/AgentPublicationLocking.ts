/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi, describe, test, expect } from 'vitest';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { MiAgentCharacter } from '@/models/AgentCharacter.js';
import { MiAgentDialogueStyle } from '@/models/AgentDialogueStyle.js';
import { withLockedAgentCharacter, withLockedAgentStyle } from '@/server/api/endpoints/agents/_with-agent-lock.js';

describe('agent publication lifecycle locking', () => {
	test('locks character and style rows inside their transaction', async () => {
		const character = { id: 'character-id' } as MiAgentCharacter;
		const style = { id: 'style-id' } as MiAgentDialogueStyle;
		const findOne = vi.fn(async (entity: unknown) => entity === MiAgentCharacter ? character : style);
		const manager = { findOne };
		const db = { transaction: vi.fn(async (callback: (transactionManager: typeof manager) => Promise<unknown>) => callback(manager)) };
		const characterCallback = vi.fn(async () => 'character-ok');
		const styleCallback = vi.fn(async () => 'style-ok');

		await expect(withLockedAgentCharacter(db as never, 'character-id', characterCallback as never)).resolves.toBe('character-ok');
		await expect(withLockedAgentStyle(db as never, 'style-id', styleCallback as never)).resolves.toBe('style-ok');

		expect(findOne).toHaveBeenNthCalledWith(1, MiAgentCharacter, {
			where: { id: 'character-id' },
			lock: { mode: 'pessimistic_write' },
		});
		expect(findOne).toHaveBeenNthCalledWith(2, MiAgentDialogueStyle, {
			where: { id: 'style-id' },
			lock: { mode: 'pessimistic_write' },
		});
		expect(characterCallback).toHaveBeenCalledWith(character, manager);
		expect(styleCallback).toHaveBeenCalledWith(style, manager);
	});

	test('logs moderation failures without changing a committed operation into an error response', async () => {
		const insert = vi.fn(async () => { throw new Error('database unavailable'); });
		const logError = vi.fn();
		const service = new ModerationLogService(
			{ insert } as never,
			{ gen: vi.fn(() => 'log-id') } as never,
			{ getLogger: vi.fn(() => ({ error: logError })) } as never,
		);

		await expect(service.logSafely({ id: 'moderator-id' }, 'resolveAgentReview', {} as never)).resolves.toBeUndefined();
		expect(logError).toHaveBeenCalledWith(expect.any(Error), {
			moderatorId: 'moderator-id',
			type: 'resolveAgentReview',
		});
	});
});
