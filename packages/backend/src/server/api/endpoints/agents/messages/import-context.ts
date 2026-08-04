/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AgentSessionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { ChatService } from '@/core/ChatService.js';
import { MiAgentMessage } from '@/models/AgentMessage.js';
import { MiAgentSession } from '@/models/AgentSession.js';

const MAX_IMPORT_MESSAGES = 10_000;
const IMPORT_INSERT_CHUNK_SIZE = 500;
const IMPORT_BODY_LIMIT_BYTES = 256 * 1024 * 1024;

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
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		messages: {
			type: 'array',
			minItems: 1,
			maxItems: MAX_IMPORT_MESSAGES,
			items: {
				type: 'object',
				properties: {
					role: { type: 'string', enum: ['user', 'assistant'] },
					content: { type: 'string', minLength: 1, maxLength: 16000 },
					// v5 新增：图片附件与识别结果
					imageFileId: { type: 'string', nullable: true, maxLength: 128 },
					imageRecognitionStatus: { type: 'string', nullable: true },
					imageRecognitionDescription: { type: 'string', nullable: true, maxLength: 50000 },
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

			const now = new Date();
			let createdAtMs = now.getTime();
			const rows: Array<{
				id: string;
				createdAt: Date;
				sessionId: string;
				role: 'user' | 'assistant';
				content: string;
				imageFileId: string | null;
				imageRecognitionStatus: 'succeeded' | 'failed' | null;
				imageRecognitionDescription: string | null;
				statsDialogueStyleId: string | null;
				promptTokens: null;
				completionTokens: null;
			}> = [];
			for (const msg of ps.messages) {
				createdAtMs += 1;
				// v5: 验证并规范化图片识别状态
				const imageRecognitionStatus = msg.imageRecognitionStatus === 'succeeded' || msg.imageRecognitionStatus === 'failed'
					? msg.imageRecognitionStatus
					: null;
				rows.push({
					id: this.agentService.newId(),
					createdAt: new Date(createdAtMs),
					sessionId: session.id,
					role: msg.role,
					content: msg.content,
					// v5: 保存图片附件与识别结果
					imageFileId: msg.imageFileId ?? null,
					imageRecognitionStatus,
					imageRecognitionDescription: msg.imageRecognitionDescription ?? null,
					statsDialogueStyleId: session.dialogueStyleId ?? null,
					promptTokens: null,
					completionTokens: null,
				});
			}

			session.agentReplyPending = false;
			session.updatedAt = now;
			session.lastMessageAt = new Date(createdAtMs);
			await this.db.transaction(async transactionalEntityManager => {
				await transactionalEntityManager.delete(MiAgentMessage, { sessionId: session.id });

				for (let i = 0; i < rows.length; i += IMPORT_INSERT_CHUNK_SIZE) {
					await transactionalEntityManager.insert(MiAgentMessage, rows.slice(i, i + IMPORT_INSERT_CHUNK_SIZE));
				}

				await transactionalEntityManager.save(MiAgentSession, session);
			});

			return { importedCount: ps.messages.length };
		});
	}
}
