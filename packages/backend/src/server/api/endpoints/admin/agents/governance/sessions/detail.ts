/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCharactersRepository, AgentMessagesRepository, AgentSessionsRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { QueryService } from '@/core/QueryService.js';
import { AgentService } from '@/core/AgentService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { packSessionGovernanceRow } from '../_utils.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 180 },
	res: { type: 'object', optional: false, nullable: false, additionalProperties: true },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 200, default: 80 },
		offset: { type: 'integer', minimum: 0, default: 0 },
		untilId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: ['sessionId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private queryService: QueryService,
		private agentService: AgentService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session) throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'bb721ecf-1376-4c70-9bc6-2a5d18e23362' });
			const [user, character] = await Promise.all([
				this.usersRepository.findOneBy({ id: session.userId }),
				this.agentCharactersRepository.findOne({ where: { id: session.characterId }, select: ['id', 'name'] }),
			]);
			const packedUser = user ? await this.userEntityService.pack(user, me, { schema: 'UserLite' }) : null;
			const limit = ps.limit ?? 80;
			const offset = ps.offset ?? 0;
			const packMessage = (m: { id: string; role: string; content: string; createdAt: Date }) => ({
				id: m.id,
				role: m.role,
				content: m.content,
				createdAt: m.createdAt.toISOString(),
			});

			if (ps.untilId) {
				// 兼容旧的游标式"加载更早"：返回比 untilId 更早的一页（新→旧）
				const [messages, totalCount] = await Promise.all([
					this.queryService.makePaginationQuery(
						this.agentMessagesRepository.createQueryBuilder('m')
							.where('m.sessionId = :sessionId', { sessionId: session.id })
							.select(['m.id', 'm.role', 'm.content', 'm.createdAt']),
						null,
						ps.untilId,
					).take(limit).getMany(),
					this.agentMessagesRepository.countBy({ sessionId: session.id }),
				]);

				return {
					session: packSessionGovernanceRow(session, packedUser, character?.name ?? '', totalCount),
					messages: messages.map(packMessage),
					totalCount,
					hasMore: messages.length >= limit,
				};
			}

			// 页码式翻页：按时间倒序返回，第 0 页为最新消息
			const [messages, totalCount] = await Promise.all([
				this.agentMessagesRepository.createQueryBuilder('m')
					.where('m.sessionId = :sessionId', { sessionId: session.id })
					.select(['m.id', 'm.role', 'm.content', 'm.createdAt'])
					.orderBy('m.id', 'DESC')
					.skip(offset)
					.take(limit)
					.getMany(),
				this.agentMessagesRepository.countBy({ sessionId: session.id }),
			]);

			return {
				session: packSessionGovernanceRow(session, packedUser, character?.name ?? '', totalCount),
				messages: messages.map(packMessage),
				totalCount,
				hasMore: offset + messages.length < totalCount,
			};
		});
	}
}
