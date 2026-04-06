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
				reviewStatus: { type: 'string' },
				publishedVersion: { type: 'integer', nullable: true },
				updatedAt: { type: 'string', format: 'date-time' },
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
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const rows = await this.agentDialogueStylesRepository.find({
				where: { userId: me.id },
				order: { updatedAt: 'DESC' },
				select: ['id', 'name', 'summary', 'isPublished', 'reviewStatus', 'publishedVersion', 'updatedAt'],
				take: 100,
			});
			return rows.map(r => ({
				id: r.id,
				name: r.name,
				summary: r.summary,
				isPublished: r.isPublished,
				reviewStatus: r.reviewStatus,
				publishedVersion: r.publishedVersion,
				updatedAt: r.updatedAt.toISOString(),
			}));
		});
	}
}
