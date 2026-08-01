/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { AgentImageGenerationsRepository, AgentMessagesRepository, AgentSessionsRepository, DriveFilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import type { MiAgentImageGeneration } from '@/models/AgentImageGeneration.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:chat',
	res: {
		type: 'object',
		optional: false, nullable: true,
		properties: {
			id: { type: 'string', format: 'misskey:id' },
			messageId: { type: 'string', format: 'misskey:id' },
			placeholderIndex: { type: 'integer' },
			status: { type: 'string' },
			fileId: { type: 'string', nullable: true },
			url: { type: 'string', nullable: true },
			file: { type: 'object', nullable: true, ref: 'DriveFile' },
			errorCode: { type: 'string', nullable: true },
			errorMessage: { type: 'string', nullable: true },
			tag: { type: 'string' },
			size: { type: 'string' },
			isBlocked: { type: 'boolean' },
			autoCleanedAt: { type: 'string', format: 'date-time', nullable: true },
			autoCleanedReason: { type: 'string', nullable: true },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		messageId: { type: 'string', format: 'misskey:id' },
		placeholderIndex: { type: 'integer', minimum: 0, maximum: 99 },
	},
	required: ['sessionId', 'messageId', 'placeholderIndex'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		@Inject(DI.agentImageGenerationsRepository)
		private agentImageGenerationsRepository: AgentImageGenerationsRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private agentService: AgentService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'c3a2f1e0-8b4d-4f6a-9e7d-1a2b3c4d5e6f' });
			}
			const message = await this.agentMessagesRepository.findOneBy({ id: ps.messageId, sessionId: session.id });
			if (!message || message.role !== 'assistant') {
				throw new ApiError({ message: 'No such message.', code: 'NO_SUCH_AGENT_MESSAGE', id: 'd4b3e2f1-9c5a-4b7c-8f6e-2b3c4d5e6f7a' });
			}

			const existing = await this.agentImageGenerationsRepository.findOne({
				where: {
					messageId: message.id,
					placeholderIndex: ps.placeholderIndex,
				},
				order: { createdAt: 'DESC' },
			});
			if (!existing) return null;

			return await this.pack(existing);
		});
	}

	private async pack(row: MiAgentImageGeneration) {
		if (row.messageId == null) return null;
		let file = null;
		const rawFile = row.fileId == null ? null : await this.driveFilesRepository.findOneBy({ id: row.fileId });
		const isAutoCleaned = row.status === 'auto_cleaned' || row.autoCleanedAt != null;
		const isBlocked = !isAutoCleaned && (row.isBlocked || rawFile?.isAgentImageBlocked === true);
		if (!isAutoCleaned && !isBlocked && row.status === 'succeeded' && row.fileId != null) {
			try {
				file = await this.driveFileEntityService.pack(row.fileId, { self: true });
			} catch {
				file = null;
			}
		}
		return {
			id: row.id,
			messageId: row.messageId,
			placeholderIndex: row.placeholderIndex,
			status: isAutoCleaned ? 'auto_cleaned' : isBlocked ? 'blocked' : row.status,
			fileId: row.fileId,
			url: isAutoCleaned || isBlocked ? null : row.url,
			file,
			errorCode: isAutoCleaned || isBlocked ? null : row.errorCode,
			errorMessage: isAutoCleaned || isBlocked ? null : row.errorMessage,
			tag: row.tag,
			size: row.size,
			isBlocked: isAutoCleaned ? false : isBlocked,
			autoCleanedAt: row.autoCleanedAt?.toISOString() ?? null,
			autoCleanedReason: row.autoCleanedReason,
		};
	}
}
