/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { jest } from '@jest/globals';
import type { MiAgentImageGeneration } from '@/models/AgentImageGeneration.js';

jest.unstable_mockModule('../../src/core/AgentService.js', () => ({ AgentService: class {} }));
jest.unstable_mockModule('../../src/core/entities/DriveFileEntityService.js', () => ({ DriveFileEntityService: class {} }));

const { default: ReviewImageStatus, meta } = await import('../../src/server/api/endpoints/admin/agents/governance/session-review/image-placeholder-status.js');
const { default: UserImageStatus } = await import('../../src/server/api/endpoints/agents/images/placeholder-status.js');

const params = { sessionId: 'session1', messageId: 'message1', placeholderIndex: 0 };
const moderator = { id: 'moderator1' };
const owner = { id: 'owner1' };
const file = { id: 'file1', url: 'https://example.com/image.png', isAgentImageBlocked: false };

function generation(overrides: Partial<MiAgentImageGeneration> = {}): MiAgentImageGeneration {
	return {
		id: 'generation1',
		messageId: 'message1',
		placeholderIndex: 0,
		status: 'succeeded',
		fileId: 'file1',
		url: file.url,
		errorCode: null,
		errorMessage: null,
		tag: 'test image',
		size: 'portrait',
		isBlocked: false,
		autoCleanedAt: null,
		autoCleanedReason: null,
		...overrides,
	} as MiAgentImageGeneration;
}

function harness(row: MiAgentImageGeneration | null = generation()) {
	const sessions = {
		findOneBy: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'session1', userId: 'owner1', sessionModerationBanned: true }),
	};
	const messages = {
		findOneBy: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'message1', sessionId: 'session1', role: 'assistant' }),
	};
	const generations = {
		findOne: jest.fn<() => Promise<unknown>>().mockResolvedValue(row),
	};
	const files = {
		findOneBy: jest.fn<() => Promise<unknown>>().mockResolvedValue(file),
	};
	const agentService = { assertAgentsEnabled: jest.fn() };
	const fileService = { pack: jest.fn<() => Promise<unknown>>().mockResolvedValue(file) };
	const review = new ReviewImageStatus(sessions as never, messages as never, generations as never, files as never, agentService as never, fileService as never);
	const user = new UserImageStatus(sessions as never, messages as never, generations as never, files as never, agentService as never, fileService as never);
	return { review, user, sessions, messages, generations, files, fileService };
}

describe('Agent session review image status', () => {
	test('requires moderator credentials and is a read-only admin endpoint', () => {
		expect(meta).toMatchObject({ requireCredential: true, requireModerator: true, secure: true, kind: 'read:admin' });
	});

	test('returns the same generated image to the reviewer and owner, including banned sessions', async () => {
		const h = harness();
		const reviewed = await h.review.exec(params, moderator as never, null);
		const owned = await h.user.exec(params, owner as never, null);

		expect(reviewed).toEqual(owned);
		expect(reviewed).toMatchObject({ status: 'succeeded', url: file.url, file });
		expect(h.messages.findOneBy).toHaveBeenCalledWith({ id: 'message1', sessionId: 'session1' });
		expect(h.generations.findOne).toHaveBeenCalledWith({
			where: { messageId: 'message1', placeholderIndex: 0 },
			order: { createdAt: 'DESC' },
		});
		expect(h.fileService.pack).toHaveBeenCalledWith('file1', { self: true, withDeleted: true });
		await expect(h.user.exec(params, moderator as never, null)).rejects.toMatchObject({ code: 'NO_SUCH_SESSION' });
	});

	test('returns null when the placeholder has no generation record', async () => {
		const h = harness(null);
		await expect(h.review.exec(params, moderator as never, null)).resolves.toBeNull();
		expect(h.fileService.pack).not.toHaveBeenCalled();
	});

	test('rejects a missing session without reading message or image records', async () => {
		const h = harness();
		h.sessions.findOneBy.mockResolvedValue(null);
		await expect(h.review.exec(params, moderator as never, null)).rejects.toMatchObject({ code: 'NO_SUCH_SESSION' });
		expect(h.messages.findOneBy).not.toHaveBeenCalled();
		expect(h.generations.findOne).not.toHaveBeenCalled();
	});

	test('rejects a message outside the session', async () => {
		const h = harness();
		h.messages.findOneBy.mockResolvedValue(null);
		await expect(h.review.exec(params, moderator as never, null)).rejects.toMatchObject({ code: 'NO_SUCH_AGENT_MESSAGE' });
		expect(h.generations.findOne).not.toHaveBeenCalled();
	});

	test('rejects non-assistant messages', async () => {
		const h = harness();
		h.messages.findOneBy.mockResolvedValue({ id: 'message1', role: 'user' });
		await expect(h.review.exec(params, moderator as never, null)).rejects.toMatchObject({ code: 'NO_SUCH_AGENT_MESSAGE' });
		expect(h.generations.findOne).not.toHaveBeenCalled();
	});

	test.each(['generation', 'file'])('does not expose an image blocked on the %s record', async source => {
		const h = harness(generation({ isBlocked: source === 'generation' }));
		if (source === 'file') h.files.findOneBy.mockResolvedValue({ ...file, isAgentImageBlocked: true });
		await expect(h.review.exec(params, moderator as never, null)).resolves.toMatchObject({ status: 'blocked', url: null, file: null, isBlocked: true });
		expect(h.fileService.pack).not.toHaveBeenCalled();
	});

	test('preserves cleaned image status without packing a file', async () => {
		const h = harness(generation({ autoCleanedAt: new Date('2026-10-07T00:00:00Z'), autoCleanedReason: 'retention' }));
		await expect(h.review.exec(params, moderator as never, null)).resolves.toMatchObject({ status: 'auto_cleaned', url: null, file: null });
		expect(h.fileService.pack).not.toHaveBeenCalled();
	});

	test('preserves file tombstones in generated image records', async () => {
		const h = harness();
		h.files.findOneBy.mockResolvedValue(null);
		h.fileService.pack.mockResolvedValue({ id: 'file1', isDeleted: true, url: null });
		await expect(h.review.exec(params, moderator as never, null)).resolves.toMatchObject({ status: 'succeeded', file: { id: 'file1', isDeleted: true } });
	});

	test('reports an in-progress generation without trying to finish or repair it', async () => {
		const h = harness(generation({ status: 'generating', fileId: null, url: null }));
		await expect(h.review.exec(params, moderator as never, null)).resolves.toMatchObject({ status: 'generating', file: null, url: null });
		expect(h.fileService.pack).not.toHaveBeenCalled();
	});
});
