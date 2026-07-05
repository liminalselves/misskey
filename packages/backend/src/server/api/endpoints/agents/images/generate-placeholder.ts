/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { AgentImageGenerationsRepository, AgentMessagesRepository, AgentSessionsRepository, AgentCharactersRepository, DriveFilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentImageService } from '@/core/AgentImageService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import type { MiAgentImageGeneration } from '@/models/AgentImageGeneration.js';

const noSuchMessageError = {
	message: 'No such message.',
	code: 'NO_SUCH_AGENT_MESSAGE',
	id: 'a44266f8-a65b-4147-95f9-c42ef7a963c7',
};

const noSuchPlaceholderError = {
	message: 'No such image placeholder.',
	code: 'NO_SUCH_AGENT_IMAGE_PLACEHOLDER',
	id: 'dbb305d5-98c9-47bd-a97a-ddb8a5f6c278',
};

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
			messageId: { type: 'string', format: 'misskey:id' },
			placeholderIndex: { type: 'integer' },
			status: { type: 'string' },
			fileId: { type: 'string', nullable: true },
			url: { type: 'string', nullable: true },
			file: { type: 'object', nullable: true, ref: 'DriveFile' },
			errorCode: { type: 'string', nullable: true },
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
		placeholderIndex: { type: 'integer', minimum: 0, maximum: 11 },
		regenerate: { type: 'boolean', default: false },
		regenerationOfId: { type: 'string', nullable: true, format: 'misskey:id' },
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

		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private agentService: AgentService,
		private agentImageService: AgentImageService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: '5886f91e-145f-42e8-b202-856356f6810d' });
			}
			const message = await this.agentMessagesRepository.findOneBy({ id: ps.messageId, sessionId: session.id });
			if (!message || message.role !== 'assistant') throw new ApiError(noSuchMessageError);
			const character = await this.agentCharactersRepository.findOneBy({ id: session.characterId });
			if (character) this.agentService.assertAgentUserSessionChatAllowed(character, session);

			const placeholders = this.agentImageService.parseDrawPlaceholders(message.content);
			const placeholder = placeholders[ps.placeholderIndex];
			if (!placeholder) throw new ApiError(noSuchPlaceholderError);

			if (!ps.regenerate) {
				const existing = await this.agentImageGenerationsRepository.findOne({
					where: {
						messageId: message.id,
						placeholderIndex: ps.placeholderIndex,
					},
					order: { createdAt: 'DESC' },
				});
				if (existing) return await this.pack(await this.waitForExistingGeneration(existing));
			}

			const instance = await this.agentImageService.fetchMetaForImageGeneration();
			const imageModel = this.agentImageService.resolveImageModel(instance, session.agentImageModelId);
			if (!imageModel) throw new ApiError({ message: 'Agent image generation is disabled.', code: 'AGENT_IMAGE_DISABLED', id: '20fb60fa-e9cf-4f8f-af52-f3782cb7faaf' });

			let regenerationOfId: MiAgentImageGeneration['id'] | null = null;
			if (ps.regenerate) {
				const source = ps.regenerationOfId
					? await this.agentImageGenerationsRepository.findOneBy({
						id: ps.regenerationOfId,
						sessionId: session.id,
						messageId: message.id,
						placeholderIndex: ps.placeholderIndex,
					})
					: await this.agentImageGenerationsRepository.findOne({
						where: {
							sessionId: session.id,
							messageId: message.id,
							placeholderIndex: ps.placeholderIndex,
						},
						order: { createdAt: 'DESC' },
					});
				regenerationOfId = source?.id ?? null;
			}
			const isInitialGeneration = regenerationOfId == null;
			const now = new Date();
			let row: MiAgentImageGeneration;
			try {
				row = await this.agentImageGenerationsRepository.insertOne({
					id: this.agentService.newId(),
					createdAt: now,
					updatedAt: now,
					userId: me.id,
					sessionId: session.id,
					messageId: message.id,
					characterId: session.characterId,
					dialogueStyleId: session.dialogueStyleId,
					placeholderIndex: ps.placeholderIndex,
					tag: placeholder.tag,
					size: placeholder.size,
					provider: imageModel.provider,
					imageModelId: imageModel.id,
					status: 'generating',
					fileId: null,
					url: null,
					errorCode: null,
					cost: 0,
					regenerationOfId,
					isBlocked: false,
					blockedReason: null,
					blockedByUserId: null,
					blockedAt: null,
				});
			} catch (err) {
				if (isInitialGeneration && this.isUniqueViolation(err)) {
					const existing = await this.agentImageGenerationsRepository.findOne({
						where: {
							messageId: message.id,
							placeholderIndex: ps.placeholderIndex,
						},
						order: { createdAt: 'DESC' },
					});
					if (existing) return await this.pack(await this.waitForExistingGeneration(existing));
				}
				if (this.isForeignKeyViolation(err)) {
					throw new ApiError(noSuchMessageError);
				}
				throw err;
			}

			try {
				const generated = await this.agentImageService.generateToDrive({
					user: me,
					sessionId: session.id,
					characterId: session.characterId,
					dialogueStyleId: session.dialogueStyleId,
					tag: placeholder.tag,
					size: placeholder.size,
					imageModelId: imageModel.id,
					imageSettings: session.agentImageSettings ?? null,
					insertMessage: false,
				});
				row.status = 'succeeded';
				row.fileId = generated.fileId;
				row.url = generated.url;
				row.cost = generated.cost;
				row.updatedAt = new Date();
				await this.agentImageGenerationsRepository.save(row);
				return await this.pack(row);
			} catch (err) {
				row.status = 'failed';
				row.errorCode = err instanceof ApiError ? err.code : 'AGENT_IMAGE_FAILED';
				row.updatedAt = new Date();
				await this.agentImageGenerationsRepository.save(row);
				return await this.pack(row);
			}
		});
	}

	private isUniqueViolation(err: unknown): boolean {
		return err instanceof QueryFailedError && (err.driverError as { code?: string } | undefined)?.code === '23505';
	}

	private isForeignKeyViolation(err: unknown): boolean {
		return err instanceof QueryFailedError && (err.driverError as { code?: string } | undefined)?.code === '23503';
	}

	private async waitForExistingGeneration(row: MiAgentImageGeneration): Promise<MiAgentImageGeneration> {
		const deadline = Date.now() + 210_000;
		let current = row;
		while (current.status === 'generating' && Date.now() < deadline) {
			await new Promise(resolve => setTimeout(resolve, 1000));
			current = await this.agentImageGenerationsRepository.findOneBy({ id: row.id }) ?? current;
		}
		if (current.status !== 'generating') return current;

		await this.agentImageGenerationsRepository.update(
			{ id: current.id, status: 'generating' },
			{
				status: 'failed',
				errorCode: 'AGENT_IMAGE_GENERATION_INTERRUPTED',
				updatedAt: new Date(),
			},
		);
		return await this.agentImageGenerationsRepository.findOneBy({ id: current.id }) ?? {
			...current,
			status: 'failed',
			errorCode: 'AGENT_IMAGE_GENERATION_INTERRUPTED',
			updatedAt: new Date(),
		};
	}

	private async pack(row: MiAgentImageGeneration) {
		if (row.messageId == null) throw new ApiError(noSuchMessageError);
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
			tag: row.tag,
			size: row.size,
			isBlocked: isAutoCleaned ? false : isBlocked,
			autoCleanedAt: row.autoCleanedAt?.toISOString() ?? null,
			autoCleanedReason: row.autoCleanedReason,
		};
	}
}
