/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { AgentModelReportsRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { QueryService } from '@/core/QueryService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { agentModelReportKinds, agentModelReportReasonTypes } from '@/models/AgentModelReport.js';
import { escapeIlikePattern, resolveUserIdFromAcctOrId } from '../_utils.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: { type: 'array', optional: false, nullable: false, items: { type: 'object', additionalProperties: true } },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		modelKind: { type: 'string', enum: [null, ...agentModelReportKinds], nullable: true },
		reasonType: { type: 'string', enum: [null, ...agentModelReportReasonTypes], nullable: true },
		modelId: { type: 'string', nullable: true },
		userId: { type: 'string', minLength: 1, maxLength: 256, nullable: true },
		query: { type: 'string', minLength: 1, maxLength: 512, nullable: true },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 40 },
		sinceId: { type: 'string', format: 'misskey:id', nullable: true },
		untilId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentModelReportsRepository)
		private agentModelReportsRepository: AgentModelReportsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private agentService: AgentService,
		private queryService: QueryService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const userId = await resolveUserIdFromAcctOrId(this.usersRepository, ps.userId);
			let q = this.agentModelReportsRepository.createQueryBuilder('report');
			if (userId) q = q.andWhere('report.userId = :userId', { userId });
			if (ps.modelKind) q = q.andWhere('report.modelKind = :modelKind', { modelKind: ps.modelKind });
			if (ps.reasonType) q = q.andWhere('report.reasonType = :reasonType', { reasonType: ps.reasonType });
			if (ps.modelId) q = q.andWhere('report.modelId = :modelId', { modelId: ps.modelId.trim() });
			if (ps.query) {
				const pattern = `%${escapeIlikePattern(ps.query)}%`;
				q = q.andWhere('(report.comment ILIKE :pattern ESCAPE \'\\\' OR report.modelName ILIKE :pattern ESCAPE \'\\\')', { pattern });
			}
			q = this.queryService.makePaginationQuery(q, ps.sinceId ?? null, ps.untilId ?? null);
			const rows = await q.take(ps.limit ?? 40).getMany();
			const userIds = [...new Set(rows.map(r => r.userId))];
			const users = userIds.length > 0 ? await this.usersRepository.findBy({ id: In(userIds) }) : [];
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));
			return rows.map(r => ({
				id: r.id,
				createdAt: r.createdAt.toISOString(),
				userId: r.userId,
				user: userById.get(r.userId) ?? null,
				modelKind: r.modelKind,
				modelId: r.modelId,
				modelName: r.modelName,
				reasonType: r.reasonType,
				comment: r.comment,
				resolvedAt: r.resolvedAt?.toISOString() ?? null,
				resolvedByUserId: r.resolvedByUserId,
				resolutionMessage: r.resolutionMessage,
			}));
		});
	}
}
