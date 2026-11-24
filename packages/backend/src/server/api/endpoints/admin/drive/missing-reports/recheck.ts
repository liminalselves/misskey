/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DriveMissingObjectService, MISSING_BATCH_MAX } from '@/core/DriveMissingObjectService.js';

export const meta = {
	tags: ['admin', 'drive'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:drive',

	limit: { duration: ms('1min'), max: 20 },

	description: 'Re-verify reported missing drive files against the object storage. Files whose object exists again are removed from the list.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			aborted: { type: 'boolean', optional: false, nullable: false },
			items: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						id: { type: 'string', optional: false, nullable: false },
						result: { type: 'string', optional: false, nullable: false, enum: ['deleted', 'present', 'missing', 'unknown', 'gone'] },
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		ids: { type: 'array', items: { type: 'string', format: 'misskey:id' }, minItems: 1, maxItems: MISSING_BATCH_MAX },
	},
	required: ['ids'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private driveMissingObjectService: DriveMissingObjectService,
	) {
		super(meta, paramDef, async (ps) => {
			return await this.driveMissingObjectService.recheck(ps.ids);
		});
	}
}
