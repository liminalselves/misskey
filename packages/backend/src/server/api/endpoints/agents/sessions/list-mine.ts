/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { AgentSessionsRepository, AgentCharactersRepository, AgentMessagesRepository } from '@/models/_.js';
import type { MiAgentCharacter } from '@/models/AgentCharacter.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { IsNull, Not } from 'typeorm';

function previewText(s: string, max = 220): string {
	const t = s.replace(/\s+/g, ' ').trim();
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
				characterId: { type: 'string', format: 'misskey:id' },
				dialogueStyleId: { type: 'string', format: 'misskey:id' },
				sessionKind: { type: 'string', enum: ['draft_test', 'community'] },
				lastMessageAt: { type: 'string', format: 'date-time' },
				characterName: { type: 'string' },
				characterSummary: { type: 'string', nullable: true },
				characterAvatar: { type: 'object', ref: 'DriveFile', nullable: true },
				lastMessagePreview: { type: 'string' },
				lastMessageRole: { type: 'string', enum: ['user', 'assistant', 'system'] },
			},
		},
	},
} as const;

export const paramDef = { type: 'object', properties: {}, required: [] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		private agentService: AgentService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const rows = await this.agentSessionsRepository.find({
				where: {
					userId: me.id,
					lastMessageAt: Not(IsNull()),
				},
				order: { lastMessageAt: 'DESC' },
				select: ['id', 'name', 'characterId', 'dialogueStyleId', 'sessionKind', 'lastMessageAt'],
				take: 100,
			});
			if (rows.length === 0) return [];

			const charIds = [...new Set(rows.map(r => r.characterId))];
			const chars = await this.agentCharactersRepository.find({
				where: { id: In(charIds) },
				select: ['id', 'name', 'summary', 'avatarFileId', 'publishedSnapshot', 'publishedVersion'],
			});
			const charMap = new Map(chars.map(c => [c.id, c]));

			const sessionIds = rows.map(r => r.id);
			const lastRows = await this.agentMessagesRepository.query(
				`SELECT DISTINCT ON ("sessionId") "sessionId", "content", "role"
				 FROM "agent_message"
				 WHERE "sessionId" = ANY($1)
				 ORDER BY "sessionId", "id" DESC`,
				[sessionIds],
			) as { sessionId: string; content: string; role: 'user' | 'assistant' | 'system' }[];
			const lastMap = new Map(lastRows.map(r => [r.sessionId, r]));

			const avatarIds = [...new Set(chars.map(c => c.avatarFileId).filter((id): id is string => id != null))];
			const avatarPacked = avatarIds.length > 0
				? await this.driveFileEntityService.packManyByIdsMap(avatarIds, {})
				: new Map();

			return rows.map(r => {
				const ch = charMap.get(r.characterId);
				const last = lastMap.get(r.id);
				const usePlaza = r.sessionKind === 'community' && ch != null && this.agentService.isListedOnPlazaCharacter(ch as MiAgentCharacter);
				const d = ch && usePlaza
					? this.agentService.characterPlazaDisplayFields(ch as MiAgentCharacter)
					: { name: ch?.name ?? '', summary: ch?.summary ?? null, avatarFileId: ch?.avatarFileId ?? null };
				const avatarFileId = d.avatarFileId;
				return {
					id: r.id,
					name: r.name,
					characterId: r.characterId,
					dialogueStyleId: r.dialogueStyleId,
					sessionKind: r.sessionKind,
					lastMessageAt: r.lastMessageAt!.toISOString(),
					characterName: d.name,
					characterSummary: d.summary,
					characterAvatar: avatarFileId ? avatarPacked.get(avatarFileId) ?? null : null,
					lastMessagePreview: last ? previewText(last.content) : '',
					lastMessageRole: last?.role ?? 'assistant',
				};
			});
		});
	}
}
