/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import type { AgentDialogueStylesRepository, AgentSessionsRepository, DriveFilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { ChatService } from '@/core/ChatService.js';
import { MiAgentMessage } from '@/models/AgentMessage.js';
import { MiAgentSession } from '@/models/AgentSession.js';

const MAX_IMPORT_MESSAGES = 10_000;
const IMPORT_INSERT_CHUNK_SIZE = 500;
const IMPORT_BODY_LIMIT_BYTES = 32 * 1024 * 1024;

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 30 },
	bodyLimit: IMPORT_BODY_LIMIT_BYTES,
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			importedCount: { type: 'integer' },
			skippedImageCount: { type: 'integer' },
			messageIdMap: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						sourceId: { type: 'string' },
						messageId: { type: 'string', format: 'misskey:id' },
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		sessionCreatedAt: { type: 'string', nullable: true },
		messages: {
			type: 'array',
			maxItems: MAX_IMPORT_MESSAGES,
			items: {
				type: 'object',
				properties: {
					sourceId: { type: 'string', nullable: true, maxLength: 128 },
					role: { type: 'string', enum: ['user', 'assistant', 'system'] },
					content: { type: 'string' },
					createdAt: { type: 'string', nullable: true },
					timeTrusted: { type: 'boolean', nullable: true },
					imageFileId: { type: 'string', nullable: true, maxLength: 128 },
					imageRecognitionStatus: { type: 'string', nullable: true },
					imageRecognitionDescription: { type: 'string', nullable: true, maxLength: 50000 },
					rawContent: { type: 'string', nullable: true },
					proactiveScheduleControlRaw: { type: 'string', nullable: true },
					proactiveScheduleControlError: {
						type: 'object',
						nullable: true,
						properties: {
							code: { type: 'string', maxLength: 128 },
							message: { type: 'string', maxLength: 10000 },
							processedAt: { type: 'string', maxLength: 128 },
						},
						required: ['code', 'message', 'processedAt'],
					},
					isInternal: { type: 'boolean', nullable: true },
					statsDialogueStyleId: { type: 'string', nullable: true, maxLength: 128 },
					promptTokens: { type: 'integer', nullable: true, minimum: 0 },
					completionTokens: { type: 'integer', nullable: true, minimum: 0 },
				},
				required: ['role', 'content'],
			},
		},
	},
	required: ['sessionId', 'messages'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		private agentService: AgentService,
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			await this.chatService.checkChatAvailability(me.id, 'write');

			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: '8e20b6e9-6e2b-4de9-ac68-4f72f8f91e2d' });
			}

			const characterRow = await this.agentService.loadCharacterForAgentSessionOrThrow(session);
			this.agentService.assertAgentUserSessionChatAllowed(characterRow, session);

			const requestedImageIds = [...new Set(ps.messages.flatMap(message => message.imageFileId == null ? [] : [message.imageFileId]))];
			const requestedStyleIds = [...new Set(ps.messages.flatMap(message => message.statsDialogueStyleId == null ? [] : [message.statsDialogueStyleId]))];
			const [ownedImages, existingStyles] = await Promise.all([
				requestedImageIds.length === 0 ? [] : this.driveFilesRepository.findBy({ id: In(requestedImageIds), userId: me.id }),
				requestedStyleIds.length === 0 ? [] : this.agentDialogueStylesRepository.findBy({ id: In(requestedStyleIds) }),
			]);
			const ownedImageIds = new Set(ownedImages.filter(file => file.type.startsWith('image/')).map(file => file.id));
			const existingStyleIds = new Set(existingStyles.map(style => style.id));

			const now = new Date();
			let fallbackCreatedAtMs = now.getTime();
			let lastMessageAtMs = Number.NEGATIVE_INFINITY;
			let skippedImageCount = 0;
			const messageIdMap: Array<{ sourceId: string; messageId: string }> = [];
			const rows: Array<{
				id: string;
				createdAt: Date;
				sessionId: string;
				role: 'user' | 'assistant' | 'system';
				content: string;
				imageFileId: string | null;
				imageRecognitionStatus: 'succeeded' | 'failed' | null;
				imageRecognitionDescription: string | null;
				timeTrusted: boolean;
				rawContent: string | null;
				proactiveScheduleControlRaw: string | null;
				proactiveScheduleControlError: { code: string; message: string; processedAt: string } | null;
				isInternal: boolean;
				clientRequestId: null;
				statsDialogueStyleId: string | null;
				promptTokens: number | null;
				completionTokens: number | null;
			}> = [];
			for (const msg of ps.messages) {
				const importedCreatedAtMs = msg.createdAt == null ? Number.NaN : new Date(msg.createdAt).getTime();
				const hasImportedCreatedAt = Number.isFinite(importedCreatedAtMs);
				const timeTrusted = msg.timeTrusted == null ? hasImportedCreatedAt : msg.timeTrusted && hasImportedCreatedAt;
				const createdAtMs = hasImportedCreatedAt ? importedCreatedAtMs : ++fallbackCreatedAtMs;
				lastMessageAtMs = Math.max(lastMessageAtMs, createdAtMs);
				const imageRecognitionStatus = msg.imageRecognitionStatus === 'succeeded' || msg.imageRecognitionStatus === 'failed'
					? msg.imageRecognitionStatus
					: null;
				const imageFileId = msg.imageFileId != null && ownedImageIds.has(msg.imageFileId) ? msg.imageFileId : null;
				if (msg.imageFileId != null && imageFileId == null) skippedImageCount++;
				const messageId = this.agentService.newId();
				if (msg.sourceId != null) messageIdMap.push({ sourceId: msg.sourceId, messageId });
				rows.push({
					id: messageId,
					createdAt: new Date(createdAtMs),
					sessionId: session.id,
					role: msg.role,
					content: msg.content,
					imageFileId,
					imageRecognitionStatus,
					imageRecognitionDescription: msg.imageRecognitionDescription ?? null,
					timeTrusted,
					rawContent: msg.rawContent ?? null,
					proactiveScheduleControlRaw: msg.proactiveScheduleControlRaw ?? null,
					proactiveScheduleControlError: msg.proactiveScheduleControlError ?? null,
					isInternal: msg.isInternal === true,
					clientRequestId: null,
					statsDialogueStyleId: msg.statsDialogueStyleId === undefined
						? session.dialogueStyleId ?? null
						: msg.statsDialogueStyleId != null && existingStyleIds.has(msg.statsDialogueStyleId) ? msg.statsDialogueStyleId : null,
					promptTokens: msg.promptTokens ?? null,
					completionTokens: msg.completionTokens ?? null,
				});
			}

			const importedSessionCreatedAtMs = ps.sessionCreatedAt == null ? Number.NaN : new Date(ps.sessionCreatedAt).getTime();
			if (Number.isFinite(importedSessionCreatedAtMs)) session.createdAt = new Date(importedSessionCreatedAtMs);
			session.agentReplyPending = false;
			session.updatedAt = now;
			session.lastMessageAt = Number.isFinite(lastMessageAtMs) ? new Date(lastMessageAtMs) : null;
			await this.db.transaction(async transactionalEntityManager => {
				await transactionalEntityManager.delete(MiAgentMessage, { sessionId: session.id });

				for (let i = 0; i < rows.length; i += IMPORT_INSERT_CHUNK_SIZE) {
					await transactionalEntityManager.insert(MiAgentMessage, rows.slice(i, i + IMPORT_INSERT_CHUNK_SIZE));
				}

				await transactionalEntityManager.save(MiAgentSession, session);
			});

			return { importedCount: rows.length, skippedImageCount, messageIdMap };
		});
	}
}
