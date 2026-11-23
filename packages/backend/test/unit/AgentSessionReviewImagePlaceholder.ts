/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { vi, describe, test, expect } from 'vitest';
import type { MiAgentImageGeneration } from '@/models/AgentImageGeneration.js';

vi.doMock('../../src/core/AgentService.js', () => ({ AgentService: class {} }));
vi.doMock('../../src/core/entities/DriveFileEntityService.js', () => ({ DriveFileEntityService: class {} }));
vi.doMock('../../src/core/MetaService.js', () => ({ MetaService: class {} }));
vi.doMock('../../src/core/entities/UserEntityService.js', () => ({ UserEntityService: class {} }));

const { default: ReviewImageStatus, meta } = await import('../../src/server/api/endpoints/admin/agents/governance/session-review/image-placeholder-status.js');
const { default: UserImageStatus } = await import('../../src/server/api/endpoints/agents/images/placeholder-status.js');
const { default: ReviewSessionShow } = await import('../../src/server/api/endpoints/admin/agents/governance/session-review/session.js');
const { default: ReviewCharacterShow } = await import('../../src/server/api/endpoints/admin/agents/governance/session-review/character.js');

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
		findOneBy: vi.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'session1', userId: 'owner1', sessionModerationBanned: true }),
	};
	const messages = {
		findOneBy: vi.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'message1', sessionId: 'session1', role: 'assistant' }),
	};
	const generations = {
		findOne: vi.fn<() => Promise<unknown>>().mockResolvedValue(row),
	};
	const files = {
		findOneBy: vi.fn<() => Promise<unknown>>().mockResolvedValue(file),
	};
	const agentService = { assertAgentsEnabled: vi.fn() };
	const fileService = { pack: vi.fn<() => Promise<unknown>>().mockResolvedValue(file) };
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

describe('Agent session review sticker tombstones', () => {
	test('session-review/session and session-review/character pack stickers with { withDeleted: true }', async () => {
		const deletedSticker = { id: 'sticker1', isDeleted: true, deletedAt: '2026-10-07T00:00:00.000Z', url: null };
		const fileService = { pack: vi.fn(async () => deletedSticker) };

		const sessionEndpoint = new ReviewSessionShow(
			{
				findOneBy: async () => ({
					id: 'session1',
					userId: 'owner1',
					characterId: 'char1',
					dialogueStyleId: null,
					sessionKind: 'draft_test',
					name: 'Session',
					lastMessageAt: null,
					createdAt: new Date('2026-10-01T00:00:00.000Z'),
					agentModelId: null,
					agentCompressionModelId: null,
					agentImageModelId: null,
					agentVisionModelId: null,
					agentImageSettings: {},
					agentLongMemoryProvider: 'none',
					agentReplyPending: false,
					segmentedOutputEnabled: false,
					timeAwarenessEnabled: false,
					randomProactiveEnabled: false,
					scheduledProactiveEnabled: false,
					randomProactiveMinSilenceMinutes: 60,
					randomProactiveMaxWindowMinutes: 180,
					randomProactiveDaytimeWeight: 1,
					randomProactiveRecencyBias: 1,
					randomProactiveChainLength: 1,
					randomProactiveLastError: null,
					scheduledProactiveLastError: null,
					moderationBanned: false,
					moderationBannedReason: null,
					ruleOverrides: {},
				}),
			} as never,
			{ findOneBy: async () => ({ id: 'owner1' }) } as never,
			{
				assertAgentsEnabled: vi.fn(),
				loadCharacterForAgentSessionOrThrow: async () => ({
					id: 'char1',
					userId: 'owner1',
					name: 'Char',
					avatarFileId: null,
					moderationBanned: false,
					stickers: [{ key: 'wave', description: 'Wave', fileId: 'sticker1' }],
				}),
			} as never,
			fileService as never,
			{ pack: async () => ({ id: 'owner1' }) } as never,
			{ fetch: async () => ({ agentImageMaxPerReply: 1 }) } as never,
		);

		const sessionResult = await sessionEndpoint.exec({ sessionId: 'session1' }, moderator as never, null);
		expect(sessionResult.characterStickers).toEqual([{ key: 'wave', file: deletedSticker }]);
		expect(fileService.pack).toHaveBeenCalledWith('sticker1', { withDeleted: true });

		fileService.pack.mockClear();

		const characterEndpoint = new ReviewCharacterShow(
			{ findOneBy: async () => ({ id: 'session1', userId: 'owner1' }) } as never,
			{
				findOneBy: async () => ({
					id: 'char1',
					userId: 'owner1',
					name: 'Char',
					summary: null,
					personality: '',
					background: '',
					speakingStyle: '',
					greeting: '',
					exampleDialogue: '',
					forbiddenBehavior: '',
					worldbook: [],
					regexRules: [],
					rules: [],
					isPublished: false,
					reviewStatus: 'draft',
					publishedVersion: null,
					reviewRejectReason: null,
					reviewRejectMessage: null,
					draftRevision: 1,
					avatarFileId: null,
					referenceImageFileIds: [],
					stickers: [{ key: 'wave', description: 'Wave', fileId: 'sticker1' }],
					promptOpenSourced: false,
					createdAt: new Date('2026-10-01T00:00:00.000Z'),
					updatedAt: new Date('2026-10-01T00:00:00.000Z'),
				}),
			} as never,
			{
				assertAgentsEnabled: vi.fn(),
				exampleTurnsFromStored: () => [],
				normalizeRegexRules: () => [],
				normalizeRules: () => [],
			} as never,
			fileService as never,
		);

		const characterResult = await characterEndpoint.exec({ sessionId: 'session1', characterId: 'char1' }, moderator as never, null);
		expect(characterResult.stickers).toEqual([{ key: 'wave', description: 'Wave', file: deletedSticker }]);
		expect(fileService.pack).toHaveBeenCalledWith('sticker1', { withDeleted: true });
	});
});
