/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AgentImageGenerationsRepository, DriveFilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { S3Service } from '@/core/S3Service.js';
import type { MiMeta } from '@/models/Meta.js';
import { setAgentImageGenerationBlocked } from './_set-blocked-core.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'write:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		properties: {
			id: { type: 'string', format: 'misskey:id' },
			isBlocked: { type: 'boolean' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
		blocked: { type: 'boolean' },
		reason: { type: 'string', nullable: true, maxLength: 256 },
	},
	required: ['id', 'blocked'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.agentImageGenerationsRepository)
		private agentImageGenerationsRepository: AgentImageGenerationsRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private agentService: AgentService,
		private s3Service: S3Service,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			return await setAgentImageGenerationBlocked({
				db: this.db,
				agentImageGenerationsRepository: this.agentImageGenerationsRepository,
				driveFilesRepository: this.driveFilesRepository,
				serverSettings: this.serverSettings,
				s3Service: this.s3Service,
			}, ps, me.id, {
				noSuchGeneration: { message: 'No such image generation.', code: 'NO_SUCH_AGENT_IMAGE_GENERATION', id: '24c2254b-6cd7-4a89-91db-e724360cf63e' },
				objectStorageAclFailed: { message: 'Failed to update the object storage ACL.', code: 'AGENT_IMAGE_OBJECT_STORAGE_ACL_FAILED', id: '74b8acdc-1d73-4dfd-9019-3a3bbb84aa01' },
			});
		});
	}
}
