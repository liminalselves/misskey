/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentModelAnnouncementService } from '@/core/AgentModelAnnouncementService.js';
import { agentModelAnnouncementScopes } from '@/models/AgentModelAnnouncement.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:account',
	res: {
		type: 'array', optional: false, nullable: false,
		items: {
			type: 'object',
			properties: {
				id: { type: 'string', format: 'misskey:id' },
				createdAt: { type: 'string', format: 'date-time' },
				scope: { type: 'string', enum: agentModelAnnouncementScopes },
				title: { type: 'string' },
				text: { type: 'string' },
				changes: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							kind: { type: 'string', enum: ['chat', 'image'] },
							modelId: { type: 'string' },
							modelName: { type: 'string' },
							type: { type: 'string', enum: ['added', 'relisted', 'removed', 'modified'] },
							fields: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										label: { type: 'string' },
										before: { type: 'string' },
										after: { type: 'string' },
									},
									required: ['label', 'before', 'after'],
								},
							},
						},
						required: ['kind', 'modelId', 'modelName', 'type', 'fields'],
					},
				},
			},
			required: ['id', 'createdAt', 'scope', 'title', 'text', 'changes'],
		},
	},
} as const;

export const paramDef = { type: 'object', properties: {}, required: [] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private agentModelAnnouncementService: AgentModelAnnouncementService) {
		super(meta, paramDef, async (ps, me) => this.agentModelAnnouncementService.getUnread(me.id));
	}
}
