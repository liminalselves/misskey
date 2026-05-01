/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository } from '@/models/_.js';
import { UserSuspendService } from '@/core/UserSuspendService.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:suspend-user',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		/** 指定時はその時刻で凍結が自動解除される。未指定は従来どおり無期限。 */
		expiresAt: { type: 'integer', nullable: true },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private userSuspendService: UserSuspendService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });

			if (user == null) {
				throw new Error('user not found');
			}

			if (await this.roleService.isModerator(user)) {
				throw new Error('cannot suspend moderator account');
			}

			if (ps.expiresAt != null && ps.expiresAt <= Date.now()) {
				return;
			}

			await this.userSuspendService.suspend(user, me, {
				expiresAt: ps.expiresAt != null ? new Date(ps.expiresAt) : null,
			});
		});
	}
}
