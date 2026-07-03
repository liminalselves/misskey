/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentDialogueStylesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

function previewBody(body: string, max = 200): string {
	const t = body.replace(/\s+/g, ' ').trim();
	if (t.length <= max) return t;
	return `${t.slice(0, max)}…`;
}

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'read:chat',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: { type: 'string', format: 'misskey:id' },
				name: { type: 'string' },
				summary: { type: 'string', nullable: true },
				isPublished: { type: 'boolean' },
				isMine: { type: 'boolean' },
				subscribed: { type: 'boolean' },
				userId: { type: 'string', format: 'misskey:id' },
				bodyPreview: { type: 'string' },
				reviewStatus: { type: 'string', optional: true },
				publishedVersion: { type: 'integer', nullable: true, optional: true },
				reviewRejectReason: { type: 'string', nullable: true, optional: true },
				reviewRejectMessage: { type: 'string', nullable: true, optional: true },
				createdAt: { type: 'string', format: 'date-time' },
				updatedAt: { type: 'string', format: 'date-time' },
				user: { type: 'object', ref: 'UserLite' },
			},
		},
	},
} as const;

export const paramDef = { type: 'object', properties: {}, required: [] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		private agentService: AgentService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const rows = await this.agentDialogueStylesRepository.find({
				where: { userId: me.id },
				order: { updatedAt: 'DESC' },
				select: ['id', 'userId', 'name', 'body', 'summary', 'isPublished', 'reviewStatus', 'publishedVersion', 'reviewRejectReason', 'reviewRejectMessage', 'createdAt', 'updatedAt'],
				take: 200,
			});
			const userLite = await this.userEntityService.pack(me, me, { schema: 'UserLite' });
			return rows.map(r => ({
				id: r.id,
				name: r.name,
				summary: r.summary,
				isPublished: r.isPublished,
				isMine: true,
				subscribed: false,
				userId: r.userId,
				bodyPreview: previewBody(r.body),
				reviewStatus: r.reviewStatus,
				publishedVersion: r.publishedVersion,
				reviewRejectReason: r.reviewRejectReason,
				reviewRejectMessage: r.reviewRejectMessage,
				createdAt: r.createdAt.toISOString(),
				updatedAt: r.updatedAt.toISOString(),
				user: userLite,
			}));
		});
	}
}
