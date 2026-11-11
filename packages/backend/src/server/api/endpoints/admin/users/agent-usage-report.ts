/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCharactersRepository, AgentDialogueStylesRepository, AgentUserModelsRepository, UserProfilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { MetaService } from '@/core/MetaService.js';
import { AgentModelReportService } from '@/core/AgentModelReportService.js';
import { buildUserUsageReport, userUsageReportParamProperties, userUsageReportResSchema } from '@/server/api/endpoints/agents/usage/_user-usage-report.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('5min'), max: 120 },
	res: userUsageReportResSchema,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		...userUsageReportParamProperties,
	},
	required: ['userId'],
} as const;

/** One user's usage report on the moderator user page (模型用量 tab). Same shape as agents/usage/report. */
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.agentUserModelsRepository)
		private agentUserModelsRepository: AgentUserModelsRepository,

		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		private agentService: AgentService,
		private metaService: MetaService,
		private agentModelReportService: AgentModelReportService,
	) {
		super(meta, paramDef, async (ps) => {
			this.agentService.assertAgentsEnabled();
			return await buildUserUsageReport({
				userProfilesRepository: this.userProfilesRepository,
				agentUserModelsRepository: this.agentUserModelsRepository,
				agentCharactersRepository: this.agentCharactersRepository,
				agentDialogueStylesRepository: this.agentDialogueStylesRepository,
				metaService: this.metaService,
				agentModelReportService: this.agentModelReportService,
			}, ps.userId, ps);
		});
	}
}
