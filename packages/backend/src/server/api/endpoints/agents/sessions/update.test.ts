/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, expect, vi, test } from 'vitest';
import { ApiError } from '@/server/api/error.js';
import UpdateSession from './update.js';

const SESSION_ID = '9g6d4b3a2c1e0f8h';
const USER_ID = '9g6d4b3a2c1e0f8i';

function unavailable(code: string) {
	return new ApiError({ code, message: code, id: 'test-error' });
}

function createHarness() {
	const row = {
		id: SESSION_ID,
		userId: USER_ID,
		name: 'Existing session',
		sessionKind: 'community',
		dialogueStyleId: 'previousStyle',
		plazaStatsDialogueStyleId: 'previousStatsStyle',
		agentModelId: 'previousModel',
		agentCompressionModelId: 'previousCompression',
		agentImageModelId: 'previousImage',
		agentVisionModelId: 'previousVision',
		agentImageSettings: { artistPresetId: 'previousArtist' },
		timeAwarenessEnabled: true,
		randomProactiveEnabled: false,
		scheduledProactiveEnabled: false,
	};
	const query = {
		update: vi.fn(), set: vi.fn(), where: vi.fn(), setParameter: vi.fn(),
		execute: vi.fn(async () => ({ affected: 1 })),
	};
	for (const key of ['update', 'set', 'where', 'setParameter'] as const) query[key].mockReturnValue(query);
	const sessions = {
		findOneBy: vi.fn(async () => row),
		createQueryBuilder: vi.fn(() => query),
	};
	const styles = {
		findOneBy: vi.fn(async ({ id }: { id: string }) => id === 'missingStyle' ? null : { id, userId: USER_ID }),
	};
	const agentService = {
		assertAgentsEnabled: vi.fn(),
		loadCharacterForAgentSessionOrThrow: vi.fn(async () => ({})),
		assertAgentUserSessionChatAllowed: vi.fn(),
		assertCanUseDialogueStyle: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
		assertSessionStylePolicy: vi.fn(),
		resolveModelApiNameForUser: vi.fn(async (_meta: unknown, id: string) => {
			if (id === 'missingModel') throw unavailable('AGENTS_MODEL_UNAVAILABLE');
			return id;
		}),
	};
	const imageService = { resolveImageModel: vi.fn((_meta: unknown, id: string) => id === 'missingImage' ? null : { id }) };
	const visionService = { resolveVisionModel: vi.fn(async (_meta: unknown, id: string) => id === 'missingVision' ? null : { id }) };
	const endpoint = new UpdateSession(
		sessions as never,
		styles as never,
		agentService as never,
		{ fetch: async () => ({ agentImageArtistPresets: [{ id: 'validArtist' }], agentProactiveMaxChainLength: 7 }) } as never,
		imageService as never,
		visionService as never,
		{ pauseAll: vi.fn(), resumeAll: vi.fn() } as never,
	);
	const run = (settings: Record<string, unknown>) => endpoint.exec({ sessionId: SESSION_ID, ...settings }, { id: USER_ID } as never, null);
	return { run, row, query, styles, agentService };
}

describe('api:agents/sessions/update import settings', () => {
	test('resets all unavailable references instead of retaining the target session values', async () => {
		const { run, query } = createHarness();
		const result = await run({
			importSettings: true,
			dialogueStyleId: 'missingStyle',
			plazaStatsDialogueStyleId: 'missingStyle',
			agentModelId: 'missingModel',
			agentCompressionModelId: 'missingModel',
			agentImageModelId: 'missingImage',
			agentVisionModelId: 'missingVision',
			agentImageSettings: { artistPresetId: 'missingArtist', size: 'portrait', autoDraw: true },
			segmentedOutputEnabled: true,
		});
		expect(result.defaultedFields).toEqual(['对话文风', '广场统计文风', '对话模型', '压缩模型', '生图模型（默认关闭）', '视觉模型', '生图画师预设']);
		expect(query.set).toHaveBeenCalledWith(expect.objectContaining({
			dialogueStyleId: null,
			plazaStatsDialogueStyleId: null,
			agentModelId: null,
			agentCompressionModelId: null,
			agentImageModelId: null,
			agentVisionModelId: null,
			segmentedOutputEnabled: true,
		}));
		expect(query.setParameter).toHaveBeenCalledWith('agentImageSettings', { size: 'portrait', autoDraw: true });
		expect(query.execute).toHaveBeenCalledTimes(1);
	});

	test.each(['STYLE_NOT_AVAILABLE', 'STYLE_NOT_SUBSCRIBED', 'STYLE_NOT_PUBLISHED'])(
		'resets each style independently for %s', async code => {
			const { run, query, agentService } = createHarness();
			agentService.assertCanUseDialogueStyle.mockRejectedValue(unavailable(code));
			const result = await run({ importSettings: true, dialogueStyleId: 'unavailableStyle', plazaStatsDialogueStyleId: 'unavailableStyle' });
			expect(result.defaultedFields).toEqual(['对话文风', '广场统计文风']);
			expect(query.set).toHaveBeenCalledWith(expect.objectContaining({ dialogueStyleId: null, plazaStatsDialogueStyleId: null }));
		},
	);

	test.each(['AGENTS_MODEL_NOT_CONFIGURED', 'NO_SUCH_AGENT_USER_MODEL', 'AGENT_USER_MODEL_DISABLED', 'AGENT_USER_MODEL_MISCONFIGURED', 'AGENT_BYOK_DISABLED'])(
		'resets official or BYOK models for %s even if no default is currently available', async code => {
			const { run, query, agentService } = createHarness();
			agentService.resolveModelApiNameForUser.mockRejectedValue(unavailable(code));
			const result = await run({ importSettings: true, agentModelId: 'oldModel', agentCompressionModelId: 'oldCompression' });
			expect(result.defaultedFields).toEqual(['对话模型', '压缩模型']);
			expect(query.set).toHaveBeenCalledWith(expect.objectContaining({ agentModelId: null, agentCompressionModelId: null }));
		},
	);

	test('keeps available references and only reports the invalid compression model', async () => {
		const { run, query } = createHarness();
		const result = await run({
			importSettings: true,
			dialogueStyleId: 'validStyle', plazaStatsDialogueStyleId: 'validStatsStyle',
			agentModelId: 'validModel', agentCompressionModelId: 'missingModel',
			agentImageModelId: 'validImage', agentVisionModelId: 'validVision',
			agentImageSettings: { artistPresetId: 'validArtist' },
		});
		expect(result.defaultedFields).toEqual(['压缩模型']);
		expect(query.set).toHaveBeenCalledWith(expect.objectContaining({
			dialogueStyleId: 'validStyle', plazaStatsDialogueStyleId: 'validStatsStyle',
			agentModelId: 'validModel', agentCompressionModelId: null,
			agentImageModelId: 'validImage', agentVisionModelId: 'validVision',
		}));
		expect(query.setParameter).toHaveBeenCalledWith('agentImageSettings', { artistPresetId: 'validArtist' });
	});

	test('does not treat explicit defaults or omitted settings as unavailable references', async () => {
		const { run, query, styles, agentService } = createHarness();
		const result = await run({ importSettings: true, dialogueStyleId: null, agentModelId: null });
		expect(result.defaultedFields).toEqual([]);
		expect(styles.findOneBy).not.toHaveBeenCalled();
		expect(agentService.resolveModelApiNameForUser).not.toHaveBeenCalled();
		expect(query.set).toHaveBeenCalledWith(expect.objectContaining({
			dialogueStyleId: null, agentModelId: null, agentCompressionModelId: 'previousCompression',
		}));
	});

	test.each([
		[{ dialogueStyleId: 'missingStyle' }, 'NO_SUCH_STYLE'],
		[{ agentModelId: 'missingModel' }, 'AGENTS_MODEL_UNAVAILABLE'],
		[{ agentImageModelId: 'missingImage' }, 'NO_SUCH_AGENT_IMAGE_MODEL'],
		[{ agentVisionModelId: 'missingVision' }, 'NO_SUCH_AGENT_VISION_MODEL'],
	])('retains strict validation for normal updates: %j', async (settings, code) => {
		const { run, query } = createHarness();
		await expect(run(settings)).rejects.toMatchObject({ code });
		expect(query.execute).not.toHaveBeenCalled();
	});

	test.each([new Error('database unavailable'), unavailable('INVALID_PARAM')])('does not hide unexpected errors: %s', async error => {
		const { run, query, agentService } = createHarness();
		agentService.resolveModelApiNameForUser.mockRejectedValue(error);
		await expect(run({ importSettings: true, agentModelId: 'validModel' })).rejects.toBe(error);
		expect(query.execute).not.toHaveBeenCalled();
	});

	test('still rejects malformed non-reference settings during imports', async () => {
		const { run, query } = createHarness();
		await expect(run({ importSettings: true, agentLongMemoryTopK: -1 })).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(query.execute).not.toHaveBeenCalled();
	});
});
