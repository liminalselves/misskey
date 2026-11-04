/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect } from 'vitest';
import AdminDriveFolders from '@/server/api/endpoints/admin/drive/folders.js';
import AdminDriveFiles from '@/server/api/endpoints/admin/drive/files.js';
import type { MiDriveFolder } from '@/models/DriveFolder.js';

const folder = (id: string, parentId: string | null = null) => ({ id, parentId, userId: 'u1', name: id }) as unknown as MiDriveFolder;

function foldersEndpoint(rows: MiDriveFolder[]) {
	const wheres: string[] = [];
	const builder: Record<string, unknown> = {};
	for (const method of ['select', 'addSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'limit']) builder[method] = () => builder;
	builder.where = (w: string) => { wheres.push(w); return builder; };
	builder.andWhere = (w: string) => { wheres.push(w); return builder; };
	builder.getMany = async () => rows;
	const repository = { createQueryBuilder: () => builder, findOneBy: async ({ id, userId }: { id: string; userId: string }) => rows.find(r => r.id === id && r.userId === userId) ?? null };
	const entity = { pack: async (f: MiDriveFolder) => ({ id: f.id, parent: null }), packMany: async (list: MiDriveFolder[]) => list.map(f => ({ id: f.id })) };
	return { endpoint: new AdminDriveFolders(repository as never, entity as never), wheres };
}

describe('admin drive folder browsing', () => {
	test('root lists top-level folders without a folder row', async () => {
		const { endpoint, wheres } = foldersEndpoint([folder('a')]);
		const res = await endpoint.exec({ userId: 'u1', folderId: null, limit: 100 }, {} as never, null) as { folder: unknown; folders: unknown[] };
		expect(res.folder).toBeNull();
		expect(res.folders.map((f: any) => f.id)).toEqual(['a']);
		expect(wheres).toContain('folder.parentId IS NULL');
	});

	test('rejects a folder belonging to another user', async () => {
		const { endpoint } = foldersEndpoint([folder('a')]);
		await expect(endpoint.exec({ userId: 'other', folderId: 'a', limit: 100 }, {} as never, null)).rejects.toMatchObject({ code: 'NO_SUCH_FOLDER' });
	});
});

describe('admin drive files folder filter', () => {
	async function filterFor(folderId: string | null | undefined) {
		const wheres: string[] = [];
		const builder: Record<string, unknown> = {};
		for (const method of ['select', 'addSelect', 'andWhere', 'limit']) builder[method] = () => builder;
		builder.andWhere = (w: string) => { wheres.push(w); return builder; };
		builder.getMany = async () => [];
		const queryService = { makePaginationQuery: () => builder };
		const endpoint = new AdminDriveFiles({ createQueryBuilder: () => builder } as never, { packMany: async () => [] } as never, queryService as never);
		await endpoint.exec({ userId: 'u1', folderId, limit: 10 }, {} as never, null);
		return wheres;
	}

	test('undefined folderId keeps the flat listing', async () => {
		expect(await filterFor(undefined)).toEqual(['file.userId = :userId']);
	});

	test('null folderId selects root files and a value selects that folder', async () => {
		expect(await filterFor(null)).toContain('file.folderId IS NULL');
		expect(await filterFor('f1')).toContain('file.folderId = :folderId');
	});
});
