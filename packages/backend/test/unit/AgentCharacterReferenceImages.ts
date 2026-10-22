/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { vi, describe, test, expect } from 'vitest';
import { MiAgentCharacter } from '@/models/AgentCharacter.js';
import CreateCharacter from '@/server/api/endpoints/agents/characters/create.js';
import UpdateCharacter from '@/server/api/endpoints/agents/characters/update.js';

const owner = { id: 'owner1' };
const image = { id: 'image1', userId: owner.id, type: 'image/png', size: 5 * 1024 * 1024 };

function harness(files = [image]) {
	const row = Object.assign(new MiAgentCharacter(), {
		id: 'character1', userId: owner.id, name: 'Original', reviewStatus: 'draft',
		referenceImageFileIds: ['missing1'], referenceImageFileId: 'missing1', draftRevision: 1,
	});
	const findOneBy = vi.fn(async (where: { id: string; userId: string }) => files.find(file => file.id === where.id && file.userId === where.userId) ?? null);
	const save = vi.fn(async () => row);
	const manager = { findOne: async () => row, save };
	const db = { transaction: async (callback: (manager: unknown) => Promise<unknown>) => callback(manager) };
	const agent = {
		assertAgentsEnabled: () => {}, newId: () => 'created1',
		normalizeRegexRules: () => [], normalizeRules: () => [],
		serializeExampleTurns: () => '',
	};
	const stickers = { validateCharacterStickersForOwner: async () => [] };
	const insertOne = vi.fn(async (data: Partial<MiAgentCharacter>) => data as MiAgentCharacter);
	const update = new UpdateCharacter(db as never, { findOneBy } as never, agent as never, stickers as never);
	const create = new CreateCharacter({ insertOne } as never, { findOneBy } as never, agent as never, stickers as never);
	return { row, findOneBy, save, insertOne, update, create };
}

describe('character reference image updates', () => {
	test('retaining a deleted reference does not block unrelated edits', async () => {
		const h = harness();
		await h.update.exec({ characterId: h.row.id, name: 'Edited', referenceImageFileIds: ['missing1'] }, owner as never, null);
		expect(h.row.name).toBe('Edited');
		expect(h.row.referenceImageFileIds).toEqual(['missing1']);
		expect(h.findOneBy).not.toHaveBeenCalled();
		expect(h.save).toHaveBeenCalledTimes(1);
	});

	test('validates only newly added references while retaining existing ones', async () => {
		const h = harness();
		await h.update.exec({ characterId: h.row.id, referenceImageFileIds: ['missing1', image.id, image.id] }, owner as never, null);
		expect(h.findOneBy).toHaveBeenCalledTimes(1);
		expect(h.findOneBy).toHaveBeenCalledWith({ id: image.id, userId: owner.id });
		expect(h.row.referenceImageFileIds).toEqual(['missing1', image.id]);
		expect(h.row.referenceImageFileId).toBe('missing1');
	});

	test('existing single-image references can be retained', async () => {
		const h = harness();
		Object.assign(h.row, { referenceImageFileIds: undefined });
		await h.update.exec({ characterId: h.row.id, referenceImageFileId: 'missing1' }, owner as never, null);
		expect(h.row.referenceImageFileIds).toEqual(['missing1']);
		expect(h.findOneBy).not.toHaveBeenCalled();
	});

	test.each([[], null])('can clear stale references with %s', async referenceImageFileIds => {
		const h = harness();
		await h.update.exec({ characterId: h.row.id, referenceImageFileIds }, owner as never, null);
		expect(h.row.referenceImageFileIds).toEqual([]);
		expect(h.row.referenceImageFileId).toBeNull();
		expect(h.findOneBy).not.toHaveBeenCalled();
	});

	test('omitting references leaves them unchanged', async () => {
		const h = harness();
		await h.update.exec({ characterId: h.row.id, name: 'Edited' }, owner as never, null);
		expect(h.row.referenceImageFileIds).toEqual(['missing1']);
		expect(h.row.referenceImageFileId).toBe('missing1');
		expect(h.findOneBy).not.toHaveBeenCalled();
	});

	test.each([
		['missing', []],
		['another owner', [{ ...image, userId: 'other1' }]],
		['not an image', [{ ...image, type: 'text/plain' }]],
		['oversized', [{ ...image, size: image.size + 1 }]],
	] as const)('rejects a new %s reference on both create and update', async (_reason, files) => {
		const h = harness([...files]);
		await expect(h.update.exec({ characterId: h.row.id, referenceImageFileIds: ['missing1', image.id] }, owner as never, null))
			.rejects.toMatchObject({ code: 'INVALID_REFERENCE_IMAGE' });
		await expect(h.create.exec({ name: 'New', referenceImageFileIds: [image.id] }, owner as never, null))
			.rejects.toMatchObject({ code: 'INVALID_REFERENCE_IMAGE' });
		expect(h.save).not.toHaveBeenCalled();
		expect(h.insertOne).not.toHaveBeenCalled();
	});

	test('new characters accept an owned image at the size limit', async () => {
		const h = harness();
		await h.create.exec({ name: 'New', referenceImageFileIds: [image.id] }, owner as never, null);
		expect(h.insertOne).toHaveBeenCalledWith(expect.objectContaining({ referenceImageFileIds: [image.id], referenceImageFileId: image.id }));
	});

	test('an existing reference does not bypass the character owner check', async () => {
		const h = harness();
		await expect(h.update.exec({ characterId: h.row.id, referenceImageFileIds: ['missing1'] }, { id: 'other1' } as never, null))
			.rejects.toMatchObject({ code: 'NO_SUCH_CHARACTER' });
		expect(h.save).not.toHaveBeenCalled();
	});

	test('pending review still prevents edits', async () => {
		const h = harness();
		h.row.reviewStatus = 'pending';
		await expect(h.update.exec({ characterId: h.row.id, referenceImageFileIds: ['missing1'] }, owner as never, null))
			.rejects.toMatchObject({ code: 'AGENT_REVIEW_PENDING_LOCKED' });
		expect(h.save).not.toHaveBeenCalled();
	});
});
