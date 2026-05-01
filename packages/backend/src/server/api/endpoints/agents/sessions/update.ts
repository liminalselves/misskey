/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentDialogueStylesRepository, AgentSessionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { MetaService } from '@/core/MetaService.js';
import { agentLongMemoryProviderIds } from '@/core/AgentCompressionMemoryService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: { type: 'string', format: 'misskey:id' },
			name: { type: 'string' },
			dialogueStyleId: { type: 'string', format: 'misskey:id', nullable: true },
			agentModelId: { type: 'string', nullable: true },
			agentLongMemoryEnabled: { type: 'boolean' },
			agentLongMemoryTopK: { type: 'number' },
			agentLongMemoryMinScore: { type: 'number', nullable: true },
			agentLongMemoryInjectMaxChars: { type: 'number' },
			agentLongMemoryAddMaxRounds: { type: 'integer', nullable: true },
			agentLongMemoryAddEveryNRounds: { type: 'integer', nullable: true },
			agentLongMemoryProvider: { type: 'string' },
			agentCompressionModelId: { type: 'string', nullable: true },
			compressionCacheInvalidated: { type: 'boolean' },
			updatedAt: { type: 'string', format: 'date-time' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1, maxLength: 256, nullable: true },
		dialogueStyleId: { type: 'string', format: 'misskey:id', nullable: true },
		agentModelId: { type: 'string', nullable: true, maxLength: 64 },
		agentLongMemoryEnabled: { type: 'boolean', nullable: true },
		agentLongMemoryTopK: { type: 'integer', minimum: 1, maximum: 100, nullable: true },
		agentLongMemoryMinScore: { type: 'number', minimum: 0, maximum: 1, nullable: true },
		agentLongMemoryInjectMaxChars: { type: 'integer', minimum: 200, maximum: 50000, nullable: true },
		agentLongMemoryAddMaxRounds: { type: 'integer', minimum: 1, maximum: 24, nullable: true },
		agentLongMemoryAddEveryNRounds: { type: 'integer', minimum: 1, maximum: 48, nullable: true },
		agentLongMemoryProvider: { type: 'string', enum: [...agentLongMemoryProviderIds] },
		agentCompressionModelId: { type: 'string', nullable: true, maxLength: 64 },
	},
	required: ['sessionId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		private agentService: AgentService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!row || row.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'f4a5b6c7-d8e9-0123-7890-234567890123' });
			}
			const characterRow = await this.agentService.loadCharacterForAgentSessionOrThrow(row);
			this.agentService.assertAgentUserSessionChatAllowed(characterRow, row);
			const instanceMeta = await this.metaService.fetch(true);

			if (ps.name !== undefined && ps.name !== null) {
				row.name = ps.name.slice(0, 256);
			}
			if (ps.dialogueStyleId !== undefined) {
				if (ps.dialogueStyleId === null) {
					row.dialogueStyleId = null;
				} else {
					const style = await this.agentDialogueStylesRepository.findOneBy({ id: ps.dialogueStyleId });
					if (!style) {
						throw new ApiError({ message: 'No such style.', code: 'NO_SUCH_STYLE', id: 'b4c5d6e7-f8a9-0123-4567-890123456789' });
					}
					await this.agentService.assertCanUseDialogueStyle(me.id, style, { forNewSession: true });
					if (row.sessionKind === 'community' && !this.agentService.isListedOnPlazaStyle(style)) {
						throw new ApiError({ message: 'Style is not published.', code: 'STYLE_NOT_PUBLISHED', id: 'f5a6b7c8-d9e0-1234-8901-456789012345' });
					}
					row.dialogueStyleId = style.id;
					if (row.plazaStatsDialogueStyleId == null) {
						row.plazaStatsDialogueStyleId = style.id;
					}
				}
			}
			if (ps.agentModelId !== undefined) {
				const mid = ps.agentModelId === '' ? null : ps.agentModelId;
				if (mid) {
					this.agentService.resolveModelApiName(instanceMeta, mid);
				}
				row.agentModelId = mid;
			}
			if (ps.agentLongMemoryEnabled !== undefined && ps.agentLongMemoryEnabled !== null) {
				row.agentLongMemoryEnabled = ps.agentLongMemoryEnabled;
			}
			if (ps.agentLongMemoryTopK !== undefined && ps.agentLongMemoryTopK !== null) {
				row.agentLongMemoryTopK = Math.max(1, Math.min(100, ps.agentLongMemoryTopK));
			}
			if (ps.agentLongMemoryMinScore !== undefined) {
				if (ps.agentLongMemoryMinScore === null) {
					row.agentLongMemoryMinScore = null;
				} else {
					row.agentLongMemoryMinScore = Math.max(0, Math.min(1, ps.agentLongMemoryMinScore));
				}
			}
			if (ps.agentLongMemoryInjectMaxChars !== undefined && ps.agentLongMemoryInjectMaxChars !== null) {
				row.agentLongMemoryInjectMaxChars = Math.max(200, Math.min(50000, ps.agentLongMemoryInjectMaxChars));
			}
			if (ps.agentLongMemoryAddMaxRounds !== undefined) {
				if (ps.agentLongMemoryAddMaxRounds === null) {
					row.agentLongMemoryAddMaxRounds = null;
				} else {
					row.agentLongMemoryAddMaxRounds = Math.max(1, Math.min(24, ps.agentLongMemoryAddMaxRounds));
				}
			}
			if (ps.agentLongMemoryAddEveryNRounds !== undefined) {
				if (ps.agentLongMemoryAddEveryNRounds === null) {
					row.agentLongMemoryAddEveryNRounds = null;
				} else {
					row.agentLongMemoryAddEveryNRounds = Math.max(1, Math.min(48, ps.agentLongMemoryAddEveryNRounds));
				}
			}
			if (ps.agentLongMemoryProvider !== undefined) {
				row.agentLongMemoryProvider = ps.agentLongMemoryProvider;
			}
			if (ps.agentCompressionModelId !== undefined) {
				if (ps.agentCompressionModelId === null || ps.agentCompressionModelId === '') {
					row.agentCompressionModelId = null;
				} else {
					this.agentService.resolveModelApiName(instanceMeta, ps.agentCompressionModelId.trim());
					row.agentCompressionModelId = ps.agentCompressionModelId.trim();
				}
			}

			row.updatedAt = new Date();
			await this.agentSessionsRepository.save(row);
			return {
				id: row.id,
				name: row.name,
				dialogueStyleId: row.dialogueStyleId,
				agentModelId: row.agentModelId,
				agentLongMemoryEnabled: row.agentLongMemoryEnabled,
				agentLongMemoryTopK: row.agentLongMemoryTopK,
				agentLongMemoryMinScore: row.agentLongMemoryMinScore,
				agentLongMemoryInjectMaxChars: row.agentLongMemoryInjectMaxChars,
				agentLongMemoryAddMaxRounds: row.agentLongMemoryAddMaxRounds,
				agentLongMemoryAddEveryNRounds: row.agentLongMemoryAddEveryNRounds,
				agentLongMemoryProvider: row.agentLongMemoryProvider,
				agentCompressionModelId: row.agentCompressionModelId,
				compressionCacheInvalidated: false,
				updatedAt: row.updatedAt.toISOString(),
			};
		});
	}
}
