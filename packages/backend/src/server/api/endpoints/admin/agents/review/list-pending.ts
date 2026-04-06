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
						avatarFileId: { type: 'string', format: 'misskey:id', nullable: true },
						avatar: { type: 'object', ref: 'DriveFile', nullable: true },
						publishedVersion: { type: 'integer', nullable: true },
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
						updatedAt: { type: 'string', format: 'date-time' },
						user: { type: 'object', ref: 'UserLite' },
					},
				},
			},
		},
	},
} as const;

export const paramDef = { type: 'object', properties: {}, required: [] } as const;

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
			const characters = await this.agentCharactersRepository.find({
				where: { reviewStatus: 'pending' },
				order: { updatedAt: 'ASC' },
				select: [
					'id', 'userId', 'name', 'summary', 'personality', 'background', 'speakingStyle',
					'greeting', 'exampleDialogue', 'forbiddenBehavior', 'avatarFileId', 'publishedVersion', 'updatedAt',
				],
				take: 200,
			});
			const styles = await this.agentDialogueStylesRepository.find({
				where: { reviewStatus: 'pending' },
				order: { updatedAt: 'ASC' },
				select: ['id', 'userId', 'name', 'summary', 'body', 'publishedVersion', 'updatedAt'],
				take: 200,
			});
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
					avatarFileId: c.avatarFileId,
					avatar: c.avatarFileId ? avatarMap.get(c.avatarFileId) ?? null : null,
					publishedVersion: c.publishedVersion,
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
					updatedAt: s.updatedAt.toISOString(),
					user: userById.get(s.userId)!,
				})),
			};
		});
	}
}
