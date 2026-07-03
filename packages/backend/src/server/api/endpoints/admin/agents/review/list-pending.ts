/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { AgentCharactersRepository, AgentDialogueStylesRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 60 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			characters: {
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
						personality: { type: 'string' },
						background: { type: 'string' },
						speakingStyle: { type: 'string' },
						greeting: { type: 'string' },
						exampleTurns: {
							type: 'array',
							items: {
								type: 'object',
								optional: false, nullable: false,
								properties: {
									role: { type: 'string', enum: ['user', 'assistant'] },
									content: { type: 'string' },
								},
								required: ['role', 'content'],
							},
						},
						forbiddenBehavior: { type: 'string' },
						worldbook: {
							type: 'array',
							items: {
								type: 'object',
								optional: false, nullable: false,
								properties: {
									id: { type: 'string' },
									title: { type: 'string' },
									content: { type: 'string' },
									keywords: { type: 'array', items: { type: 'string' } },
									triggerMode: { type: 'string', enum: ['keyword', 'manual', 'always'] },
									priority: { type: 'integer' },
									enabled: { type: 'boolean' },
									revision: { type: 'integer' },
								},
								required: ['id', 'title', 'content', 'keywords', 'triggerMode', 'priority', 'enabled', 'revision'],
							},
						},
						avatarFileId: { type: 'string', format: 'misskey:id', nullable: true },
						avatar: { type: 'object', ref: 'DriveFile', nullable: true },
						publishedVersion: { type: 'integer', nullable: true },
						reviewStatus: { type: 'string' },
						isPublished: { type: 'boolean' },
						moderationBanned: { type: 'boolean' },
						promptOpenSourced: { type: 'boolean' },
						reviewRejectReason: { type: 'string', nullable: true },
						reviewRejectMessage: { type: 'string', nullable: true },
						reviewInternalNote: { type: 'string', nullable: true },
						createdAt: { type: 'string', format: 'date-time' },
						updatedAt: { type: 'string', format: 'date-time' },
						user: { type: 'object', ref: 'UserLite' },
					},
				},
			},
			styles: {
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
						body: { type: 'string' },
						publishedVersion: { type: 'integer', nullable: true },
						reviewStatus: { type: 'string' },
						isPublished: { type: 'boolean' },
						promptOpenSourced: { type: 'boolean' },
						reviewRejectReason: { type: 'string', nullable: true },
						reviewRejectMessage: { type: 'string', nullable: true },
						reviewInternalNote: { type: 'string', nullable: true },
						createdAt: { type: 'string', format: 'date-time' },
						updatedAt: { type: 'string', format: 'date-time' },
						user: { type: 'object', ref: 'UserLite' },
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		kind: { type: 'string', enum: ['all', 'character', 'style'], default: 'all' },
		status: { type: 'string', enum: ['pending', 'published', 'rejected', 'draft', 'all'], default: 'pending' },
		userId: { type: 'string', format: 'misskey:id', nullable: true },
		query: { type: 'string', minLength: 1, maxLength: 256, nullable: true },
		limit: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private agentService: AgentService,
		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const kind = ps.kind ?? 'all';
			const status = ps.status ?? 'pending';
			const limit = ps.limit ?? 100;
			const orderDir = status === 'pending' ? 'ASC' : 'DESC';
			const query = ps.query?.trim();

			const characters = kind === 'style' ? [] : await (async () => {
				const qb = this.agentCharactersRepository.createQueryBuilder('c')
					.select([
						'c.id', 'c.userId', 'c.name', 'c.summary', 'c.personality', 'c.background', 'c.speakingStyle',
						'c.greeting', 'c.exampleDialogue', 'c.forbiddenBehavior', 'c.avatarFileId', 'c.publishedVersion',
						'c.worldbook', 'c.reviewStatus', 'c.isPublished', 'c.moderationBanned', 'c.promptOpenSourced',
						'c.reviewRejectReason', 'c.reviewRejectMessage', 'c.reviewInternalNote',
						'c.createdAt', 'c.updatedAt',
					])
					.orderBy('c.updatedAt', orderDir)
					.take(limit);
				if (status !== 'all') qb.andWhere('c.reviewStatus = :status', { status });
				if (ps.userId) qb.andWhere('c.userId = :userId', { userId: ps.userId });
				if (query) {
					qb.andWhere('(c.name ILIKE :q OR c.summary ILIKE :q OR c.personality ILIKE :q OR c.background ILIKE :q OR c.speakingStyle ILIKE :q OR c.greeting ILIKE :q OR c.forbiddenBehavior ILIKE :q OR c.worldbook::text ILIKE :q)', { q: `%${query.replace(/[%_\\]/g, '\\$&')}%` });
				}
				return await qb.getMany();
			})();
			const styles = kind === 'character' ? [] : await (async () => {
				const qb = this.agentDialogueStylesRepository.createQueryBuilder('s')
					.select([
						's.id', 's.userId', 's.name', 's.summary', 's.body', 's.publishedVersion',
						's.reviewStatus', 's.isPublished', 's.promptOpenSourced',
						's.reviewRejectReason', 's.reviewRejectMessage', 's.reviewInternalNote',
						's.createdAt', 's.updatedAt',
					])
					.orderBy('s.updatedAt', orderDir)
					.take(limit);
				if (status !== 'all') qb.andWhere('s.reviewStatus = :status', { status });
				if (ps.userId) qb.andWhere('s.userId = :userId', { userId: ps.userId });
				if (query) {
					qb.andWhere('(s.name ILIKE :q OR s.summary ILIKE :q OR s.body ILIKE :q)', { q: `%${query.replace(/[%_\\]/g, '\\$&')}%` });
				}
				return await qb.getMany();
			})();
			const userIds = [...new Set([
				...characters.map(c => c.userId),
				...styles.map(s => s.userId),
			])];
			const users = userIds.length > 0 ? await this.usersRepository.findBy({ id: In(userIds) }) : [];
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));

			const avatarIds = [...new Set(characters.map(c => c.avatarFileId).filter((id): id is string => id != null))];
			const avatarMap = avatarIds.length > 0
				? await this.driveFileEntityService.packManyByIdsMap(avatarIds, {})
				: new Map();

			return {
				characters: characters.map(c => ({
					id: c.id,
					userId: c.userId,
					name: c.name,
					summary: c.summary,
					personality: c.personality,
					background: c.background,
					speakingStyle: c.speakingStyle,
					greeting: c.greeting,
					exampleTurns: this.agentService.exampleTurnsFromStored(c.exampleDialogue),
					forbiddenBehavior: c.forbiddenBehavior,
					worldbook: this.agentService.normalizeWorldbookEntries(c.worldbook),
					avatarFileId: c.avatarFileId,
					avatar: c.avatarFileId ? avatarMap.get(c.avatarFileId) ?? null : null,
					publishedVersion: c.publishedVersion,
					reviewStatus: c.reviewStatus,
					isPublished: c.isPublished,
					moderationBanned: c.moderationBanned,
					promptOpenSourced: c.promptOpenSourced,
					reviewRejectReason: c.reviewRejectReason,
					reviewRejectMessage: c.reviewRejectMessage,
					reviewInternalNote: c.reviewInternalNote,
					createdAt: c.createdAt.toISOString(),
					updatedAt: c.updatedAt.toISOString(),
					user: userById.get(c.userId)!,
				})),
				styles: styles.map(s => ({
					id: s.id,
					userId: s.userId,
					name: s.name,
					summary: s.summary,
					body: s.body,
					publishedVersion: s.publishedVersion,
					reviewStatus: s.reviewStatus,
					isPublished: s.isPublished,
					promptOpenSourced: s.promptOpenSourced,
					reviewRejectReason: s.reviewRejectReason,
					reviewRejectMessage: s.reviewRejectMessage,
					reviewInternalNote: s.reviewInternalNote,
					createdAt: s.createdAt.toISOString(),
					updatedAt: s.updatedAt.toISOString(),
					user: userById.get(s.userId)!,
				})),
			};
		});
	}
}
