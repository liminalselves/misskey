/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IsNull } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta, UsedUsernamesRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { localUsernameSchema } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { UtilityService } from '@/core/UtilityService.js';
import { isPreservedUsername } from '@/misc/username-reservation.js';

export const meta = {
	tags: ['users'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			available: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			reason: {
				type: 'string',
				optional: false, nullable: true,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		username: localUsernameSchema,
	},
	required: ['username'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.usedUsernamesRepository)
		private usedUsernamesRepository: UsedUsernamesRepository,

		private utilityService: UtilityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const exist = await this.usersRepository.countBy({
				host: IsNull(),
				usernameLower: ps.username.toLowerCase(),
			});

			const exist2 = await this.usedUsernamesRepository.countBy({ username: ps.username.toLowerCase() });

			const isPreserved = isPreservedUsername(ps.username, this.serverSettings.preservedUsernames);
			const hasProhibitedWords = this.utilityService.isKeyWordIncluded(ps.username.toLowerCase(), this.serverSettings.prohibitedWordsForNameOfUser);
			const reason = exist > 0 || exist2 > 0
				? 'used'
				: isPreserved
					? 'preserved'
					: hasProhibitedWords
						? 'prohibited'
						: null;

			return {
				available: reason === null,
				reason,
			};
		});
	}
}
