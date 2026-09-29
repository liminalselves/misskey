/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { MiAgentCharacter } from '@/models/AgentCharacter.js';
import { MiAgentDialogueStyle } from '@/models/AgentDialogueStyle.js';
import { MiAgentPublishedVersion } from '@/models/AgentPublishedVersion.js';
import { resolveAgentReview } from '@/server/api/endpoints/admin/agents/_resolve-review.js';

type ReviewRow = MiAgentCharacter | MiAgentDialogueStyle;
type ArchivedRow = MiAgentPublishedVersion;

function createReviewHarness(initialRow: ReviewRow, initialHistory: ArchivedRow[] = []) {
	let committedRow = structuredClone(initialRow);
	let committedHistory = structuredClone(initialHistory);
	let queue = Promise.resolve();
	let failArchiveSave = false;
	const lockOptions: unknown[] = [];

	const db = {
		transaction: jest.fn(async (callback: (manager: any) => Promise<unknown>) => {
			const run = queue.then(async () => {
				let workingRow = structuredClone(committedRow);
				const workingHistory = structuredClone(committedHistory);
				const manager = {
					findOne: jest.fn(async (_entity: unknown, options: unknown) => {
						lockOptions.push(options);
						return workingRow;
					}),
					createQueryBuilder: jest.fn(() => {
						const query = {
							select: jest.fn(),
							where: jest.fn(),
							andWhere: jest.fn(),
							getRawOne: jest.fn(async () => ({
								max: workingHistory.length === 0 ? null : Math.max(...workingHistory.map(row => row.version)),
							})),
						};
						query.select.mockReturnValue(query);
						query.where.mockReturnValue(query);
						query.andWhere.mockReturnValue(query);
						return query;
					}),
					save: jest.fn(async (entity: unknown, row: ReviewRow | ArchivedRow) => {
						if (entity === MiAgentPublishedVersion) {
							if (failArchiveSave) throw new Error('archive failed');
							workingHistory.push(structuredClone(row as ArchivedRow));
						} else {
							workingRow = structuredClone(row as ReviewRow);
						}
						return row;
					}),
				};
				const result = await callback(manager);
				committedRow = workingRow;
				committedHistory = workingHistory;
				return result;
			});
			const result = run.finally(() => undefined);
			queue = result.then(() => undefined, () => undefined);
			return run;
		}),
	};
	const agentService = {
		buildCharacterSnapshotFromRow: jest.fn(() => ({ name: 'new character', draftRevision: 2 })),
		buildStyleSnapshotFromRow: jest.fn(() => ({ name: 'new style', body: 'body', summary: null, draftRevision: 2 })),
		syncCharacterListedFlag: jest.fn((row: MiAgentCharacter) => {
			row.isPublished = row.publishedVersion != null;
		}),
		syncStyleListedFlag: jest.fn((row: MiAgentDialogueStyle) => {
			row.isPublished = row.publishedVersion != null;
		}),
	};
	const idService = { gen: jest.fn(() => `archive-${committedHistory.length + 1}`) };

	return {
		db,
		agentService,
		idService,
		lockOptions,
		get row() { return committedRow; },
		get history() { return committedHistory; },
		setFailArchiveSave(value: boolean) { failArchiveSave = value; },
	};
}

function characterRow(): MiAgentCharacter {
	return {
		id: 'character-id',
		userId: 'user-id',
		name: 'character',
		reviewStatus: 'pending',
		publishedVersion: null,
		publishedSnapshot: null,
		isPublished: false,
		reviewRejectReason: null,
		reviewRejectMessage: null,
		reviewInternalNote: null,
		updatedAt: new Date('2026-09-28T00:00:00.000Z'),
	} as MiAgentCharacter;
}

function styleRow(): MiAgentDialogueStyle {
	return {
		id: 'style-id',
		userId: 'user-id',
		name: 'style',
		reviewStatus: 'pending',
		publishedVersion: null,
		publishedSnapshot: null,
		isPublished: false,
		reviewRejectReason: null,
		reviewRejectMessage: null,
		reviewInternalNote: null,
		updatedAt: new Date('2026-09-28T00:00:00.000Z'),
	} as MiAgentDialogueStyle;
}

const approveParams = {
	decision: 'approve' as const,
	rejectReason: null,
	rejectMessage: null,
	internalNote: null,
	noSuchCharacterReviewId: 'character-review-error',
	noSuchStyleReviewId: 'style-review-error',
};

describe('resolveAgentReview', () => {
	test('continues character versions after an unpublish instead of reusing version zero', async () => {
		const oldVersion = new MiAgentPublishedVersion({
			id: 'old-version',
			createdAt: new Date('2026-09-01T00:00:00.000Z'),
			kind: 'character',
			targetId: 'character-id',
			userId: 'user-id',
			version: 0,
			snapshot: { name: 'old character', draftRevision: 1 },
		});
		const harness = createReviewHarness(characterRow(), [oldVersion]);

		await resolveAgentReview(harness.db as never, harness.agentService as never, harness.idService as never, {
			kind: 'character', id: 'character-id', ...approveParams,
		});

		expect(harness.row).toMatchObject({ reviewStatus: 'published', publishedVersion: 1, isPublished: true });
		expect(harness.history.map(row => row.version)).toEqual([0, 1]);
		expect(harness.lockOptions[0]).toMatchObject({ lock: { mode: 'pessimistic_write' } });
	});

	test('uses the archived maximum for styles as well', async () => {
		const history = [0, 2].map(version => new MiAgentPublishedVersion({
			id: `style-version-${version}`,
			createdAt: new Date('2026-09-01T00:00:00.000Z'),
			kind: 'style',
			targetId: 'style-id',
			userId: 'user-id',
			version,
			snapshot: { name: 'old style', body: 'old', summary: null, draftRevision: version + 1 },
		}));
		const harness = createReviewHarness(styleRow(), history);

		await resolveAgentReview(harness.db as never, harness.agentService as never, harness.idService as never, {
			kind: 'style', id: 'style-id', ...approveParams,
		});

		expect(harness.row).toMatchObject({ reviewStatus: 'published', publishedVersion: 3, isPublished: true });
		expect(harness.history.map(row => row.version)).toEqual([0, 2, 3]);
	});

	test('rolls back the main row when archiving fails', async () => {
		const harness = createReviewHarness(characterRow());
		harness.setFailArchiveSave(true);

		await expect(resolveAgentReview(harness.db as never, harness.agentService as never, harness.idService as never, {
			kind: 'character', id: 'character-id', ...approveParams,
		})).rejects.toThrow('archive failed');

		expect(harness.row).toMatchObject({ reviewStatus: 'pending', publishedVersion: null, isPublished: false });
		expect(harness.history).toHaveLength(0);
	});

	test('rejects a first publication without creating an archived version', async () => {
		const harness = createReviewHarness(characterRow());

		await resolveAgentReview(harness.db as never, harness.agentService as never, harness.idService as never, {
			kind: 'character',
			id: 'character-id',
			decision: 'reject',
			rejectReason: 'policy',
			rejectMessage: 'Please revise the content.',
			internalNote: 'review note',
			noSuchCharacterReviewId: 'character-review-error',
			noSuchStyleReviewId: 'style-review-error',
		});

		expect(harness.row).toMatchObject({
			reviewStatus: 'rejected',
			publishedVersion: null,
			isPublished: false,
			reviewRejectReason: 'policy',
			reviewRejectMessage: 'Please revise the content.',
			reviewInternalNote: 'review note',
		});
		expect(harness.history).toHaveLength(0);
	});

	test('keeps the previous publication online when an update is rejected', async () => {
		const row = characterRow();
		row.publishedVersion = 4;
		row.publishedSnapshot = { name: 'published character' };
		row.isPublished = true;
		const harness = createReviewHarness(row);

		await resolveAgentReview(harness.db as never, harness.agentService as never, harness.idService as never, {
			kind: 'character',
			id: 'character-id',
			decision: 'reject',
			rejectReason: 'policy',
			rejectMessage: 'Please revise the update.',
			internalNote: null,
			noSuchCharacterReviewId: 'character-review-error',
			noSuchStyleReviewId: 'style-review-error',
		});

		expect(harness.row).toMatchObject({ reviewStatus: 'published', publishedVersion: 4, isPublished: true });
		expect(harness.history).toHaveLength(0);
	});

	test('serializes concurrent decisions and rejects the second one after the first commits', async () => {
		const harness = createReviewHarness(characterRow());

		const first = resolveAgentReview(harness.db as never, harness.agentService as never, harness.idService as never, {
			kind: 'character', id: 'character-id', ...approveParams,
		});
		const second = resolveAgentReview(harness.db as never, harness.agentService as never, harness.idService as never, {
			kind: 'character', id: 'character-id', ...approveParams,
		});

		await expect(first).resolves.toMatchObject({ kind: 'character' });
		await expect(second).rejects.toMatchObject({ code: 'NO_SUCH_REVIEW' });
		expect(harness.history).toHaveLength(1);
	});
});
