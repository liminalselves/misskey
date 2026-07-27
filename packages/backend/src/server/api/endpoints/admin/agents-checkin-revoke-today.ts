/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { AgentCheckinRecordsRepository, UserProfilesRepository } from '@/models/_.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireAdmin: true,
	secure: true,
	kind: 'write:admin',
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			revokedCount: { type: 'integer' },
			totalRewardReversed: { type: 'number' },
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
		@Inject(DI.agentCheckinRecordsRepository)
		private agentCheckinRecordsRepository: AgentCheckinRecordsRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			const now = new Date();
			const today = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

			// 查找当日所有签到记录（非补签）
			const records = await this.agentCheckinRecordsRepository.findBy({ date: today, isMakeup: false });

			let totalRewardReversed = 0;
			for (const r of records) {
				if (r.reward > 0) {
					await this.userProfilesRepository.decrement({ userId: r.userId }, 'agentCreditBalance', r.reward);
					totalRewardReversed += r.reward;
				}
			}

			// 删除当日签到记录（非补签），使用户可重新签到
			if (records.length > 0) {
				await this.agentCheckinRecordsRepository.delete({ date: today, isMakeup: false });
			}

			return {
				revokedCount: records.length,
				totalRewardReversed: Math.round(totalRewardReversed * 100) / 100,
			};
		});
	}
}
