/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { UserProfilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:account',
	limit: { duration: ms('1min'), max: 60 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			creditBalance: { type: 'number' },
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
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (_ps, me) => {
			this.agentService.assertAgentsEnabled();
			const profile = await this.userProfilesRepository.findOneBy({ userId: me.id });
			return { creditBalance: profile?.agentCreditBalance ?? 0 };
		});
	}
}
