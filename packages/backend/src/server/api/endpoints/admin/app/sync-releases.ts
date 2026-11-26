/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AppReleaseService } from '@/core/AppReleaseService.js';

export const meta = {
	tags: ['admin', 'meta'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:meta',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			ok: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			repo: {
				type: 'string',
				optional: false, nullable: false,
			},
			autoFetchGithub: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			syncedAt: {
				type: 'string',
				optional: false, nullable: true,
			},
			error: {
				type: 'string',
				optional: false, nullable: true,
			},
			latestAndroidVersion: {
				type: 'string',
				optional: false, nullable: true,
			},
			latestIosVersion: {
				type: 'string',
				optional: false, nullable: true,
			},
			releaseCount: {
				type: 'number',
				optional: false, nullable: false,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private appReleaseService: AppReleaseService,
	) {
		super(meta, paramDef, async () => {
			return await this.appReleaseService.syncNow({ force: true });
		});
	}
}
