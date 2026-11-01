/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, expect, vi, test } from 'vitest';
import { ApiError } from '@/server/api/error.js';
import SendMessage from './send.js';

const SESSION_ID = '9g6d4b3a2c1e0f8h';
const USER_ID = '9g6d4b3a2c1e0f8i';
const STYLE_ID = '9g6d4b3a2c1e0f8j';

function createHarness(opts: {
	styleRow?: unknown;
	assertError?: unknown;
	sessionFields?: Record<string, unknown>;
} = {}) {
	const session = {
		id: SESSION_ID,
		userId: USER_ID,
		characterId: 'char1',
		sessionKind: 'community',
		dialogueStyleId: STYLE_ID,
		...(opts.sessionFields ?? {}),
	};
	const query = {
		update: vi.fn(), set: vi.fn(), where: vi.fn(),
		execute: vi.fn(async () => ({ affected: 1 })),
	};
	for (const key of ['update', 'set', 'where'] as const) query[key].mockReturnValue(query);
	const sessions = {
		findOneBy: vi.fn(async () => session),
		createQueryBuilder: vi.fn(() => query),
	};
	const characters = { findOneByOrFail: vi.fn(async () => ({ id: 'char1' })) };
	const styles = {
		findOneBy: vi.fn(async () => opts.styleRow === undefined ? { id: STYLE_ID, userId: 'author1' } : opts.styleRow),
	};
	const agentService = {
		assertAgentsEnabled: vi.fn(),
		assertAgentUserSessionChatAllowed: vi.fn(),
		newId: vi.fn(() => 'newClientRequestId'),
		assertCanUseDialogueStyle: vi.fn(async () => {
			if (opts.assertError) throw opts.assertError;
		}),
	};
	const chatService = { checkChatAvailability: vi.fn(async () => {}) };
	const endpoint = new SendMessage(
		sessions as never,
		characters as never,
		styles as never,
		{ findOneBy: vi.fn() } as never,
		{} as never,
		agentService as never,
		{} as never,
		{} as never,
		chatService as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
	);
	const run = () => endpoint.exec({ sessionId: SESSION_ID, text: 'hi' }, { id: USER_ID } as never, null);
	return { run, query, styles, agentService };
}

describe('api:agents/messages/send dead dialogue style', () => {
	test('clears the session style and throws STYLE_NOT_AVAILABLE when the style row is gone', async () => {
		const { run, query } = createHarness({ styleRow: null });
		await expect(run()).rejects.toMatchObject({ code: 'STYLE_NOT_AVAILABLE' });
		expect(query.set).toHaveBeenCalledWith({ dialogueStyleId: null });
		expect(query.where).toHaveBeenCalledWith(
			'id = :id AND "dialogueStyleId" = :deadStyleId',
			{ id: SESSION_ID, deadStyleId: STYLE_ID },
		);
		expect(query.execute).toHaveBeenCalledTimes(1);
	});

	test('clears the session style when the style became unavailable since selection', async () => {
		const { run, query } = createHarness({
			assertError: new ApiError({ message: 'This dialogue style is not available.', code: 'STYLE_NOT_AVAILABLE', id: 'test-style-gone' }),
		});
		await expect(run()).rejects.toMatchObject({ code: 'STYLE_NOT_AVAILABLE', id: 'test-style-gone' });
		expect(query.set).toHaveBeenCalledWith({ dialogueStyleId: null });
		expect(query.execute).toHaveBeenCalledTimes(1);
	});

	test.each([
		new Error('unexpected failure'),
		new ApiError({ message: 'sub required', code: 'STYLE_NOT_SUBSCRIBED', id: 'test-sub' }),
	])('leaves the session style untouched for unrelated assertion failures', async assertError => {
		const { run, query } = createHarness({ assertError });
		await expect(run()).rejects.toBe(assertError);
		expect(query.execute).not.toHaveBeenCalled();
	});

	test('requires a dialogue style before sending', async () => {
		const { run, styles } = createHarness({ sessionFields: { dialogueStyleId: null } });
		await expect(run()).rejects.toMatchObject({ code: 'AGENT_DIALOGUE_STYLE_REQUIRED' });
		expect(styles.findOneBy).not.toHaveBeenCalled();
	});
});
