/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCharactersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 60 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: { type: 'string', format: 'misskey:id' },
			isPublished: { type: 'boolean' },
			reviewStatus: { type: 'string' },
			publishedVersion: { type: 'integer', nullable: true },
			updatedAt: { type: 'string', format: 'date-time' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: { characterId: { type: 'string', format: 'misskey:id' } },
	required: ['characterId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentCharactersRepository.findOneBy({ id: ps.characterId });
			if (!row || row.userId !== me.id) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: '6728c360-15aa-4802-9082-2f148a355842' });
			}
			if (row.reviewStatus === 'pending') {
				throw new ApiError({
					message: 'This character is already pending review.',
					code: 'AGENT_REVIEW_PENDING',
					id: 'f0a1b2c3-d4e5-6789-0123-456789abcdef',
				});
			}
			if (row.publishedVersion != null && this.agentService.isCharacterContentUnchangedFromPublished(row)) {
				throw new ApiError({
					message: 'Character content is unchanged from the published version; nothing to submit for update.',
					code: 'AGENT_PUBLISH_NO_CONTENT_CHANGE',
					id: 'a7b8c9d0-e1f2-3456-789a-bcdef0123456',
				});
			}
			row.reviewStatus = 'pending';
			row.draftRevision = (row.draftRevision ?? 1) + 1;
			// 审核中不覆盖已批准的 publishedSnapshot：广场卡片与社区会话在审核期间应继续使用上一已上线快照，
			// 待审内容（当前 row 的草稿字段）由管理端 review/resolve 在通过时再重建快照。首次发布时 publishedVersion 为 null、
			// isPublished 为 false，草稿不会进入广场或社区，因此无需提前写入快照。
			row.updatedAt = new Date();
			this.agentService.syncCharacterListedFlag(row);
			await this.agentCharactersRepository.save(row);
			return {
				id: row.id,
				isPublished: row.isPublished,
				reviewStatus: row.reviewStatus,
				publishedVersion: row.publishedVersion,
				updatedAt: row.updatedAt.toISOString(),
			};
		});
	}
}
