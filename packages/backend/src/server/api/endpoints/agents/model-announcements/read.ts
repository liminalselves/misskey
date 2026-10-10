/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { AgentModelAnnouncementService } from '@/core/AgentModelAnnouncementService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'write:account',
	errors: {
		noSuchAnnouncement: {
			message: 'No such model announcement.',
			code: 'NO_SUCH_MODEL_ANNOUNCEMENT',
			id: 'cbe4c006-2d70-45dd-8541-3726748d004b',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { announcementId: { type: 'string', format: 'misskey:id' } },
	required: ['announcementId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private agentModelAnnouncementService: AgentModelAnnouncementService) {
		super(meta, paramDef, async (ps, me) => {
			if (!(await this.agentModelAnnouncementService.read(me.id, ps.announcementId))) {
				throw new ApiError(meta.errors.noSuchAnnouncement);
			}
		});
	}
}
