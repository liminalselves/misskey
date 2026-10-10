/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { AgentModelAnnouncementService } from '@/core/AgentModelAnnouncementService.js';
import { agentModelAnnouncementScopes } from '@/models/AgentModelAnnouncement.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	requireAdmin: true,
	secure: true,
	kind: 'write:admin',
	errors: {
		emptyAnnouncement: {
			message: 'Announcement title and text must not be blank.',
			code: 'EMPTY_MODEL_ANNOUNCEMENT',
			id: 'a1d7ba04-4a25-4f55-b224-e2175c0864a5',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		scope: { type: 'string', enum: agentModelAnnouncementScopes, default: 'all' },
		title: { type: 'string', minLength: 1, maxLength: 256 },
		text: { type: 'string', minLength: 1, maxLength: 10000 },
	},
	required: ['title', 'text'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private agentModelAnnouncementService: AgentModelAnnouncementService) {
		super(meta, paramDef, async ps => {
			const title = ps.title.trim();
			const text = ps.text.trim();
			if (!title || !text) throw new ApiError(meta.errors.emptyAnnouncement);
			await this.agentModelAnnouncementService.publish(ps.scope, title, text);
		});
	}
}
