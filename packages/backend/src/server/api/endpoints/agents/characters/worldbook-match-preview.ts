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
	kind: 'read:chat',
	limit: { duration: ms('1hour'), max: 300 },
	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: { type: 'string', minLength: 1, maxLength: 128 },
				title: { type: 'string' },
				triggerMode: { type: 'string' },
				priority: { type: 'integer' },
				revision: { type: 'integer' },
				matchedBy: { type: 'string' },
				matchedKeywords: {
					type: 'array',
					items: { type: 'string' },
				},
			},
			required: ['id', 'title', 'triggerMode', 'priority', 'revision', 'matchedBy', 'matchedKeywords'],
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		characterId: { type: 'string', format: 'misskey:id' },
		text: { type: 'string', maxLength: 16000 },
		maxItems: { type: 'integer', minimum: 1, maximum: 24, nullable: true },
		// Optional draft worldbook from the editor; when omitted, preview uses the persisted worldbook.
		worldbook: {
			type: 'array',
			nullable: true,
			items: {
				type: 'object',
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
				required: ['id'],
			},
		},
	},
	required: ['characterId', 'text'],
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
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: 'df84df7f-7f0d-4f80-8ece-96c14ab89cc9' });
			}
			const source = ps.worldbook != null ? { worldbook: ps.worldbook } : { worldbook: row.worldbook };
			const entries = this.agentService.selectWorldbookEntriesForPrompt(source, ps.text, {
				maxTotal: ps.maxItems ?? 12,
			});
			return entries.map(entry => ({
				id: entry.id,
				title: entry.title,
				triggerMode: entry.triggerMode,
				priority: entry.priority,
				revision: entry.revision,
				matchedBy: entry.matchedBy,
				matchedKeywords: entry.matchedKeywords,
			}));
		});
	}
}
