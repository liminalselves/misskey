/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCharactersRepository, AgentDialogueStylesRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { packCharacterGovernanceDetail, packStyleGovernanceDetail } from '../_utils.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 240 },
	res: { type: 'object', optional: false, nullable: false, additionalProperties: true },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		kind: { type: 'string', enum: ['character', 'style'] },
		id: { type: 'string', format: 'misskey:id' },
	},
	required: ['kind', 'id'],
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
			if (ps.kind === 'character') {
				const row = await this.agentCharactersRepository.findOneBy({ id: ps.id });
				if (!row) throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: 'f26c01d5-64c2-4384-b4b2-8261e2c47342' });
				const user = await this.usersRepository.findOneBy({ id: row.userId });
				const packedUser = user ? await this.userEntityService.pack(user, me, { schema: 'UserLite' }) : null;
				const avatar = row.avatarFileId ? (await this.driveFileEntityService.packManyByIdsMap([row.avatarFileId], {})).get(row.avatarFileId) ?? null : null;
				const stickerIds = Array.isArray(row.stickers) ? row.stickers.map(sticker => sticker?.fileId).filter((id): id is string => typeof id === 'string') : [];
				const stickerFiles = stickerIds.length > 0 ? await this.driveFileEntityService.packManyByIdsMap(stickerIds, {}) : new Map<string, unknown>();
				return packCharacterGovernanceDetail(this.agentService, row, packedUser, avatar, stickerFiles);
			}

			const row = await this.agentDialogueStylesRepository.findOneBy({ id: ps.id });
			if (!row) throw new ApiError({ message: 'No such style.', code: 'NO_SUCH_STYLE', id: 'bb2a811f-45bb-450a-ac5d-40ee2281f647' });
			const user = await this.usersRepository.findOneBy({ id: row.userId });
			const packedUser = user ? await this.userEntityService.pack(user, me, { schema: 'UserLite' }) : null;
			return packStyleGovernanceDetail(this.agentService, row, packedUser);
		});
	}
}
