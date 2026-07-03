/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentImageGenerationsRepository, AgentSessionsRepository, AgentCharactersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentImageService, agentImageErrors } from '@/core/AgentImageService.js';
import { AgentExternalAuditService } from '@/core/AgentExternalAuditService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';

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
			fileId: { type: 'string', format: 'misskey:id' },
			url: { type: 'string' },
			file: { type: 'object', ref: 'DriveFile' },
		},
	},
	errors: {
		promptAuditBlocked: {
			message: 'Image prompt was blocked by safety audit.',
			code: 'AGENT_IMAGE_PROMPT_AUDIT_BLOCKED',
			id: 'd9a4a361-0707-4da8-89d3-2dcfc8521678',
			kind: 'permission',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		tag: { type: 'string', minLength: 1, maxLength: 4000 },
		size: { type: 'string', enum: ['portrait', 'landscape', 'square'], default: 'portrait' },
	},
	required: ['sessionId', 'tag'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.agentImageGenerationsRepository)
		private agentImageGenerationsRepository: AgentImageGenerationsRepository,

		private agentService: AgentService,
		private agentImageService: AgentImageService,
		private agentExternalAuditService: AgentExternalAuditService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const session = await this.agentSessionsRepository.findOneBy({ id: ps.sessionId });
			if (!session || session.userId !== me.id) {
				throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'b6e4b066-e00e-4484-a67e-0a18ad0f80ab' });
			}
			const character = await this.agentCharactersRepository.findOneBy({ id: session.characterId });
			if (character) this.agentService.assertAgentUserSessionChatAllowed(character, session);

			const instance = await this.agentImageService.fetchMetaForImageGeneration();
			const imageModel = this.agentImageService.resolveImageModel(instance, session.agentImageModelId);
			if (!imageModel) throw new ApiError(agentImageErrors.disabled);

			const audit = await this.agentExternalAuditService.auditImagePrompt({
				instance,
				user: me,
				session,
				tag: ps.tag,
			});
			if (audit.blocked) {
				throw new ApiError(meta.errors.promptAuditBlocked, {
					blockCode: audit.blockCode,
					category: audit.category,
					reason: audit.reason,
				});
			}

			const now = new Date();
			const row = await this.agentImageGenerationsRepository.insertOne({
				id: this.agentService.newId(),
				createdAt: now,
				updatedAt: now,
				userId: me.id,
				sessionId: session.id,
				messageId: null,
				characterId: session.characterId,
				dialogueStyleId: session.dialogueStyleId,
				placeholderIndex: -1,
				tag: ps.tag,
				size: ps.size,
				provider: imageModel.provider,
				imageModelId: imageModel.id,
				status: 'generating',
				fileId: null,
				url: null,
				errorCode: null,
				cost: 0,
				regenerationOfId: null,
				isBlocked: false,
				blockedReason: null,
				blockedByUserId: null,
				blockedAt: null,
			});

			try {
				const generated = await this.agentImageService.generateToDrive({
					user: me,
					sessionId: session.id,
					characterId: session.characterId,
					dialogueStyleId: session.dialogueStyleId,
					tag: ps.tag,
					size: ps.size,
					imageModelId: imageModel.id,
					imageSettings: session.agentImageSettings ?? null,
				});
				row.status = 'succeeded';
				row.fileId = generated.fileId;
				row.url = generated.url;
				row.cost = generated.cost;
				row.updatedAt = new Date();
				await this.agentImageGenerationsRepository.save(row);
				const file = await this.driveFileEntityService.pack(generated.fileId, { self: true });
				return {
					fileId: generated.fileId,
					url: generated.url,
					file,
				};
			} catch (err) {
				row.status = 'failed';
				row.errorCode = err instanceof ApiError ? err.code : 'AGENT_IMAGE_FAILED';
				row.updatedAt = new Date();
				await this.agentImageGenerationsRepository.save(row);
				throw err;
			}
		});
	}
}
