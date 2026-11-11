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
import { buildUserUsageReport, userUsageReportParamProperties, userUsageReportResSchema } from './_user-usage-report.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:account',
	limit: { duration: ms('5min'), max: 120 },
	res: userUsageReportResSchema,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		...userUsageReportParamProperties,
	},
	required: [],
} as const;

/** The signed-in user's own usage report ("我的用量"). */
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
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			return await buildUserUsageReport({
				userProfilesRepository: this.userProfilesRepository,
				agentUserModelsRepository: this.agentUserModelsRepository,
				agentCharactersRepository: this.agentCharactersRepository,
				agentDialogueStylesRepository: this.agentDialogueStylesRepository,
				metaService: this.metaService,
				agentModelReportService: this.agentModelReportService,
			}, me.id, ps);
		});
	}
}
