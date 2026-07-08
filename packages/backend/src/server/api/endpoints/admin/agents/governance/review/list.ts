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
import { escapeIlikePattern, packCharacterGovernanceRow, packStyleGovernanceRow } from '../_utils.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: { type: 'object', optional: false, nullable: false, additionalProperties: true },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		kind: { type: 'string', enum: ['all', 'character', 'style'], default: 'all' },
		status: { type: 'string', enum: ['pending', 'published', 'rejected', 'draft', 'all'], default: 'pending' },
		userId: { type: 'string', format: 'misskey:id', nullable: true },
		query: { type: 'string', minLength: 1, maxLength: 256, nullable: true },
		limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
		untilId: { type: 'string', format: 'misskey:id', nullable: true },
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
			const limit = ps.limit ?? 50;
			const query = ps.query?.trim();
			const orderDir = status === 'pending' ? 'ASC' : 'DESC';
			const cursor = ps.untilId == null ? null : (await this.agentCharactersRepository.findOne({
				where: { id: ps.untilId },
				select: ['id', 'updatedAt'],
			}) ?? await this.agentDialogueStylesRepository.findOne({
				where: { id: ps.untilId },
				select: ['id', 'updatedAt'],
			}));

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
				if (cursor) {
					qb.andWhere(orderDir === 'ASC'
						? '(c.updatedAt > :cursorUpdatedAt OR (c.updatedAt = :cursorUpdatedAt AND c.id > :cursorId))'
						: '(c.updatedAt < :cursorUpdatedAt OR (c.updatedAt = :cursorUpdatedAt AND c.id < :cursorId))', {
						cursorUpdatedAt: cursor.updatedAt,
						cursorId: cursor.id,
					});
				}
				if (query) {
					const q = `%${escapeIlikePattern(query)}%`;
					qb.andWhere('(c.name ILIKE :q ESCAPE \'\\\' OR c.summary ILIKE :q ESCAPE \'\\\' OR c.personality ILIKE :q ESCAPE \'\\\' OR c.background ILIKE :q ESCAPE \'\\\' OR c.speakingStyle ILIKE :q ESCAPE \'\\\' OR c.greeting ILIKE :q ESCAPE \'\\\' OR c.forbiddenBehavior ILIKE :q ESCAPE \'\\\' OR c.worldbook::text ILIKE :q ESCAPE \'\\\')', { q });
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
				if (cursor) {
					qb.andWhere(orderDir === 'ASC'
						? '(s.updatedAt > :cursorUpdatedAt OR (s.updatedAt = :cursorUpdatedAt AND s.id > :cursorId))'
						: '(s.updatedAt < :cursorUpdatedAt OR (s.updatedAt = :cursorUpdatedAt AND s.id < :cursorId))', {
						cursorUpdatedAt: cursor.updatedAt,
						cursorId: cursor.id,
					});
				}
				if (query) {
					const q = `%${escapeIlikePattern(query)}%`;
					qb.andWhere('(s.name ILIKE :q ESCAPE \'\\\' OR s.summary ILIKE :q ESCAPE \'\\\' OR s.body ILIKE :q ESCAPE \'\\\')', { q });
				}
				return await qb.getMany();
			})();

			const userIds = [...new Set([...characters.map(c => c.userId), ...styles.map(s => s.userId)])];
			const users = userIds.length > 0 ? await this.usersRepository.findBy({ id: In(userIds) }) : [];
			const packedUsers = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
			const userById = new Map(packedUsers.map(u => [u.id, u]));

			const avatarIds = [...new Set(characters.map(c => c.avatarFileId).filter((id): id is string => id != null))];
			const avatarMap = avatarIds.length > 0 ? await this.driveFileEntityService.packManyByIdsMap(avatarIds, {}) : new Map();

			return [
				...characters.map(c => packCharacterGovernanceRow(this.agentService, c, userById.get(c.userId) ?? null, c.avatarFileId ? avatarMap.get(c.avatarFileId) ?? null : null)),
				...styles.map(s => packStyleGovernanceRow(s, userById.get(s.userId) ?? null)),
			].sort((a, b) => status === 'pending'
				? a.updatedAt.localeCompare(b.updatedAt)
				: b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
		});
	}
}
