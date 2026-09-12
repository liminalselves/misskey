/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentExternalAuditLogsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { AgentService } from '@/core/AgentService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		additionalProperties: true,
	},
	errors: {
		noSuchLog: {
			message: 'No such external audit log.',
			code: 'NO_SUCH_AGENT_EXTERNAL_AUDIT_LOG',
			id: '6d4d2b4d-4457-4cd9-b64e-9f2919171100',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
	},
	required: ['id'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentExternalAuditLogsRepository)
		private agentExternalAuditLogsRepository: AgentExternalAuditLogsRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps) => {
			this.agentService.assertAgentsEnabled();
			const r = await this.agentExternalAuditLogsRepository.findOne({
				where: { id: ps.id },
				relations: ['session', 'character', 'dialogueStyle'],
			});
			if (!r) throw new ApiError(meta.errors.noSuchLog);
			return {
				id: r.id,
				createdAt: r.createdAt.toISOString(),
				completedAt: r.completedAt?.toISOString() ?? null,
				durationMs: r.durationMs,
				userId: r.userId,
				sessionId: r.sessionId,
				sessionName: r.session?.name ?? null,
				characterId: r.characterId,
				characterName: r.character?.name ?? '',
				dialogueStyleId: r.dialogueStyleId,
				dialogueStyleName: r.dialogueStyle?.name ?? '',
				modelId: r.modelId,
				modelName: r.modelName,
				apiModelName: r.apiModelName,
				baseUrl: r.baseUrl,
				priority: r.priority,
				attemptIndex: r.attemptIndex,
				status: r.status,
				blockCode: r.blockCode,
				category: r.category,
				reason: r.reason,
				confidence: r.confidence,
				userText: r.userText,
				assistantText: r.assistantText,
				responseText: r.responseText,
				failureKind: r.failureKind,
				errorCode: r.errorCode,
				errorMessage: r.errorMessage,
			};
		});
	}
}
