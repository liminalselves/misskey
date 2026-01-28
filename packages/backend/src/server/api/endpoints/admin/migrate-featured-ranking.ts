/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { FeaturedService } from '@/core/FeaturedService.js';

export const meta = {
	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:meta',

	tags: ['admin'],

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			migratedCount: {
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
		private featuredService: FeaturedService,
	) {
		super(meta, paramDef, async () => {
			const migratedCount = await this.featuredService.migrateFromWindowedKeys();
			return { migratedCount };
		});
	}
}
