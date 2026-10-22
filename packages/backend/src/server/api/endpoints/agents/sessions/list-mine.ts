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
import { AgentMessageNotifyService } from '@/core/AgentMessageNotifyService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { agentPreviewText } from '@/core/agent-preview-text.js';

function previewText(s: string, max = 220): string {
	return agentPreviewText(s, { maxLength: max });
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
				dialogueStyleId: { type: 'string', format: 'misskey:id', nullable: true },
				sessionKind: { type: 'string', enum: ['draft_test', 'community'] },
				lastMessageAt: { type: 'string', format: 'date-time' },
				characterName: { type: 'string' },
				characterSummary: { type: 'string', nullable: true },
				characterAvatar: { type: 'object', ref: 'DriveFile', nullable: true },
				lastMessagePreview: { type: 'string' },
				lastMessageRole: { type: 'string', enum: ['user', 'assistant', 'system'] },
				hasUnread: { type: 'boolean' },
				// 未读条数：已读为 0；有未读但条数未知（存量数据无计数）为 null
				unreadCount: { type: 'number', nullable: true },
				sessionModerationBanned: { type: 'boolean' },
				characterModerationBanned: { type: 'boolean' },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
		untilId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
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

		private agentService: AgentService,
		private agentMessageNotifyService: AgentMessageNotifyService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const limit = ps.limit ?? 100;
			const qb = this.agentSessionsRepository.createQueryBuilder('s')
				.where('s.userId = :userId', { userId: me.id })
				.andWhere('s.lastMessageAt IS NOT NULL')
				.select(['s.id', 's.name', 's.characterId', 's.dialogueStyleId', 's.sessionKind', 's.lastMessageAt', 's.moderationBanned'])
				.orderBy('s.lastMessageAt', 'DESC')
				.addOrderBy('s.id', 'DESC')
				.take(limit);
			if (ps.untilId != null) {
				// (lastMessageAt, id) 复合游标：列表按最近消息时间排序，同刻并列按 id 决胜
				const cursor = await this.agentSessionsRepository.findOne({
					where: { id: ps.untilId, userId: me.id },
					select: { id: true, lastMessageAt: true },
				});
				if (cursor?.lastMessageAt == null) return [];
				qb.andWhere('(s.lastMessageAt < :cursorAt OR (s.lastMessageAt = :cursorAt AND s.id < :cursorId))', {
					cursorAt: cursor.lastMessageAt,
					cursorId: cursor.id,
				});
			}
			const rows = await qb.getMany();
			if (rows.length === 0) return [];

			const charIds = [...new Set(rows.map(r => r.characterId))];
			const chars = await this.agentCharactersRepository.find({
				where: { id: In(charIds) },
				select: { id: true, name: true, summary: true, avatarFileId: true, publishedSnapshot: true, publishedVersion: true, moderationBanned: true },
			});
			const charMap = new Map(chars.map(c => [c.id, c]));

			const sessionIds = rows.map(r => r.id);
			const lastRows = await this.agentMessagesRepository.query(
				`SELECT DISTINCT ON ("sessionId") "sessionId", "content", "role"
				 FROM "agent_message"
				 WHERE "sessionId" = ANY($1) AND "isInternal" = false
				 ORDER BY "sessionId", "id" DESC`,
				[sessionIds],
			) as { sessionId: string; content: string; role: 'user' | 'assistant' | 'system' }[];
			const lastMap = new Map(lastRows.map(r => [r.sessionId, r]));

			const avatarIds = [...new Set(chars.flatMap(c => [c.avatarFileId, this.agentService.characterPlazaDisplayFields(c as MiAgentCharacter).avatarFileId]).filter((id): id is string => id != null))];
			const avatarPacked = avatarIds.length > 0
				? await this.driveFileEntityService.packManyByIdsMap(avatarIds, {})
				: new Map();
			const unreadCounts = await this.agentMessageNotifyService.unreadCountMap(me.id);

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
					hasUnread: unreadCounts.has(r.id),
					unreadCount: unreadCounts.has(r.id) ? (unreadCounts.get(r.id) ?? null) : 0,
					sessionModerationBanned: r.moderationBanned,
					characterModerationBanned: ch?.moderationBanned ?? false,
				};
			});
		});
	}
}
