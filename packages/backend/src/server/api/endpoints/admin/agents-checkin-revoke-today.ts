/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { MiAgentCheckinRecord } from '@/models/AgentCheckinRecord.js';
import { MiAgentModelUsageLog } from '@/models/AgentModelUsageLog.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { IdService } from '@/core/IdService.js';

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
		@Inject(DI.db)
		private db: DataSource,

		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const now = new Date();
			const today = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

				const { revokedCount, totalRewardReversed } = await this.db.transaction(async em => {
					// DELETE RETURNING claims each reward once, including concurrent revocations.
					const deleted = await em.createQueryBuilder().delete().from(MiAgentCheckinRecord)
						.where('date = :date AND "isMakeup" = false', { date: today })
						.returning(['id', 'userId', 'reward']).execute();
					const records = deleted.raw as Pick<MiAgentCheckinRecord, 'id' | 'userId' | 'reward'>[];

				let reversed = 0;
				for (const r of records) {
					if (r.reward > 0) {
						// 现行规则保留：撤销允许把余额扣成负数
						await em.decrement(MiUserProfile, { userId: r.userId }, 'agentCreditBalance', r.reward);
						// 冲账流水（usageKind='checkin'，cost 为正数表示支出）：
						// 与签到入账日志（cost=-reward）对冲，账单合计与余额变动保持一致
						await em.insert(MiAgentModelUsageLog, {
							id: this.idService.gen(),
							requestedAt: now,
							completedAt: now,
							durationMs: 0,
							userId: r.userId,
							sessionId: null,
							characterId: null,
							dialogueStyleId: null,
							modelId: null,
							modelApiName: null,
							usageKind: 'checkin',
							status: 'success',
							errorCode: 'checkin_revoked',
							cost: r.reward,
							promptTokens: null,
							completionTokens: null,
						});
						reversed += r.reward;
					}
				}

				return { revokedCount: records.length, totalRewardReversed: reversed };
			});

			return {
				revokedCount,
				totalRewardReversed: Math.round(totalRewardReversed * 100) / 100,
			};
		});
	}
}
