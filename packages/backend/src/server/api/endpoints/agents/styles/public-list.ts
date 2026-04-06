/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { AgentDialogueStylesRepository, UsersRepository } from '@/models/_.js';
import type { MiAgentDialogueStyle } from '@/models/AgentDialogueStyle.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
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
				userId: { type: 'string', format: 'misskey:id' },
				name: { type: 'string' },
				summary: { type: 'string', nullable: true },
				bodyPreview: { type: 'string' },
				createdAt: { type: 'string', format: 'date-time' },
				updatedAt: { type: 'string', format: 'date-time' },
				publishedVersion: { type: 'integer', nullable: true },
				user: { type: 'object', ref: 'UserLite' },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		sinceId: { type: 'string', format: 'misskey:id', nullable: true },
		untilId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private queryService: QueryService,
		private agentService: AgentService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const q = this.queryService.makePaginationQuery(
				this.agentDialogueStylesRepository.createQueryBuilder('s')
					.where('s.isPublished = true')
					.select(['s.id', 's.userId', 's.name', 's.body', 's.summary', 's.publishedSnapshot', 's.publishedVersion', 's.createdAt', 's.updatedAt']),
				ps.sinceId ?? null,
				ps.untilId ?? null,
			).take(ps.limit ?? 30);

			const rows = await q.getMany();
			if (rows.length === 0) return [];

			const userIds = [...new Set(rows.map(r => r.userId))];
			const users = await this.usersRepository.findBy({ id: In(userIds) });
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));

			return rows.map(r => {
				const d = this.agentService.stylePlazaDisplayFields(r as MiAgentDialogueStyle);
				return {
					id: r.id,
					userId: r.userId,
					name: d.name,
					summary: d.summary,
					bodyPreview: previewBody(d.body),
					createdAt: r.createdAt.toISOString(),
					updatedAt: r.updatedAt.toISOString(),
					publishedVersion: r.publishedVersion,
					user: userById.get(r.userId)!,
				};
			});
		});
	}
}
