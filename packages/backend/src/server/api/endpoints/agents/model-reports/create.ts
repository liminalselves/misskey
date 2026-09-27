/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentModelReportsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { IdService } from '@/core/IdService.js';
import { agentModelReportKinds, agentModelReportReasonTypes } from '@/models/AgentModelReport.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 10 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			reportId: { type: 'string', format: 'misskey:id' },
		},
	},
	errors: {
		commentRequired: {
			message: 'Comment is required when reasonType is other.',
			code: 'MODEL_REPORT_COMMENT_REQUIRED',
			id: '1c2f9d3a-8b47-4e66-9a55-2f0b81d4c7e1',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		modelKind: { type: 'string', enum: [...agentModelReportKinds] },
		modelId: { type: 'string', minLength: 1, maxLength: 64 },
		modelName: { type: 'string', minLength: 1, maxLength: 256 },
		reasonType: { type: 'string', enum: [...agentModelReportReasonTypes] },
		comment: { type: 'string', minLength: 1, maxLength: 1024, nullable: true },
	},
	required: ['modelKind', 'modelId', 'modelName', 'reasonType'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentModelReportsRepository)
		private agentModelReportsRepository: AgentModelReportsRepository,

		private agentService: AgentService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();

			// 仅「其他」类型需要自定义原因，预设类型不收自定义输入
			if (ps.reasonType === 'other') {
				if (ps.comment == null || ps.comment.trim() === '') {
					throw new ApiError(meta.errors.commentRequired);
				}
			}
			const comment = ps.reasonType === 'other' ? ps.comment!.trim() : null;

			const now = new Date();
			const row = await this.agentModelReportsRepository.insertOne({
				id: this.idService.gen(),
				createdAt: now,
				updatedAt: now,
				userId: me.id,
				modelKind: ps.modelKind,
				modelId: ps.modelId.trim(),
				modelName: ps.modelName.trim(),
				reasonType: ps.reasonType,
				comment,
			});

			return { reportId: row.id };
		});
	}
}
