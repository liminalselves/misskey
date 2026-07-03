/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { DriveService } from '@/core/DriveService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	kind: 'write:drive',
	errors: {
		protectedFolder: {
			message: 'This operation is not allowed for the AI-generated image folder.',
			code: 'PROTECTED_AGENT_IMAGE_FOLDER',
			id: '962b909c-369f-46e4-8ac9-4e5c73fe5a48',
		},
		noFreeSpace: {
			message: 'Cannot move the files because you have no free space of drive.',
			code: 'NO_FREE_SPACE',
			id: '0244831c-663e-421b-98d6-3e463a87883a',
		},
	},

} as const;

export const paramDef = {
	type: 'object',
	properties: {
		fileIds: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 100, items: { type: 'string', format: 'misskey:id' } },
		folderId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: ['fileIds'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private driveService: DriveService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				await this.driveService.moveFiles(ps.fileIds, ps.folderId ?? null, me.id);
			} catch (e) {
				if (e instanceof DriveService.ProtectedFolderError) {
					throw new ApiError(meta.errors.protectedFolder);
				}
				if (e instanceof IdentifiableError && e.id === 'c6244ed2-a39a-4e1c-bf93-f0fbd7764fa6') {
					throw new ApiError(meta.errors.noFreeSpace);
				}
				throw e;
			}
		});
	}
}
