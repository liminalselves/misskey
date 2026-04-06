/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentDialogueStylesRepository, AgentUserStyleSubscriptionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			success: { type: 'boolean' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { styleId: { type: 'string', format: 'misskey:id' } },
	required: ['styleId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		@Inject(DI.agentUserStyleSubscriptionsRepository)
		private agentUserStyleSubscriptionsRepository: AgentUserStyleSubscriptionsRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const style = await this.agentDialogueStylesRepository.findOneBy({ id: ps.styleId });
			if (!style || !this.agentService.isListedOnPlazaStyle(style)) {
				throw new ApiError({ message: 'No such style.', code: 'NO_SUCH_STYLE', id: 'c5d6e7f8-a9b0-1234-5678-901234567890' });
			}
			if (style.userId === me.id) {
				return { success: true };
			}
			const existing = await this.agentUserStyleSubscriptionsRepository.findOneBy({ userId: me.id, styleId: style.id });
			if (existing) {
				return { success: true };
			}
			await this.agentUserStyleSubscriptionsRepository.insert({
				userId: me.id,
				styleId: style.id,
				createdAt: new Date(),
			});
			return { success: true };
		});
	}
}
