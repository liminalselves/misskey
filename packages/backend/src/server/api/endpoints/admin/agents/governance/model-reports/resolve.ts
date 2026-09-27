/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { AgentModelReportsRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { getAcctByUserId } from '../_utils.js';

const DEFAULT_RESOLUTION_MESSAGE = '上报的模型已恢复';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'write:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: { type: 'object', optional: false, nullable: false, additionalProperties: true },
	errors: {
		noSuchReport: {
			message: 'No such model report.',
			code: 'NO_SUCH_AGENT_MODEL_REPORT',
			id: '733b9b4f-34ce-43ee-af20-19c7c33a35b1',
		},
		alreadyResolved: {
			message: 'This model report has already been resolved.',
			code: 'AGENT_MODEL_REPORT_ALREADY_RESOLVED',
			id: 'e20ac583-c21a-4767-bac6-392cdbb1003e',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
		message: { type: 'string', maxLength: 2000, nullable: true },
	},
	required: ['id'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentModelReportsRepository)
		private agentModelReportsRepository: AgentModelReportsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private agentService: AgentService,
		private moderationLogService: ModerationLogService,
		private notificationService: NotificationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentModelReportsRepository.findOneBy({ id: ps.id });
			if (!row) throw new ApiError(meta.errors.noSuchReport);
			if (row.resolvedAt != null) throw new ApiError(meta.errors.alreadyResolved);

			const message = ps.message?.trim() || DEFAULT_RESOLUTION_MESSAGE;
			const resolvedAt = new Date();
			const updateResult = await this.agentModelReportsRepository.update({ id: row.id, resolvedAt: IsNull() }, {
				resolvedAt,
				resolvedByUserId: me.id,
				resolutionMessage: message,
				updatedAt: resolvedAt,
			});
			if (updateResult.affected !== 1) throw new ApiError(meta.errors.alreadyResolved);

			const reporterAcct = await getAcctByUserId(this.usersRepository, row.userId);
			await this.moderationLogService.log(me, 'resolveAgentModelReport', {
				reportId: row.id,
				reporterUserId: row.userId,
				reporterAcct,
				modelKind: row.modelKind,
				modelId: row.modelId,
				modelName: row.modelName,
				reasonType: row.reasonType,
				message,
			});
			this.notificationService.createNotification(row.userId, 'agentModelReportResolved', {
				reportId: row.id,
				modelName: row.modelName,
				message,
			});

			return {
				id: row.id,
				resolvedAt: resolvedAt.toISOString(),
				resolutionMessage: message,
			};
		});
	}
}
