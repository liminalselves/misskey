/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentSessionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { AgentDashscopeMemoryService } from '@/core/AgentDashscopeMemoryService.js';
import { MetaService } from '@/core/MetaService.js';
import { loadSessionForReview } from './_utils.js';

// 镜像 agents/memory/list：以会话属主的记忆命名空间读取（bailianUserId 属主+会话派生）
export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
	limit: { duration: ms('1hour'), max: 120 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			memoryNodes: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						memoryNodeId: { type: 'string' },
						content: { type: 'string' },
						createdAt: { type: 'number', nullable: true },
						updatedAt: { type: 'number', nullable: true },
					},
				},
			},
			total: { type: 'number' },
			pageNum: { type: 'number' },
			pageSize: { type: 'number' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sessionId: { type: 'string', format: 'misskey:id' },
		pageNum: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
		pageSize: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
	},
	required: ['sessionId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		private agentService: AgentService,
		private agentDashscopeMemoryService: AgentDashscopeMemoryService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, _me) => {
			this.agentService.assertAgentsEnabled();
			const session = await loadSessionForReview(this.agentSessionsRepository, ps.sessionId);
			const instanceMeta = await this.metaService.fetch(true);
			if (!this.agentDashscopeMemoryService.isRunnable(instanceMeta)) {
				throw new ApiError({ message: 'Long-term memory is not available.', code: 'MEMORY_NOT_AVAILABLE', id: '629c394d-cab3-4fa7-944e-15a4e0387a25' });
			}
			const bailianUserId = this.agentDashscopeMemoryService.bailianUserId(session.userId, session.id);
			const pageNum = ps.pageNum ?? 1;
			const pageSize = ps.pageSize ?? 20;
			const result = await this.agentDashscopeMemoryService.listMemoryNodes({
				meta: instanceMeta,
				bailianUserId,
				pageNum,
				pageSize,
			});
			if (result == null) {
				throw new ApiError({ message: 'Could not load memories from provider.', code: 'MEMORY_PROVIDER_ERROR', id: '5cd29178-7e34-4921-b55e-0cf78215b9e1' });
			}
			return {
				memoryNodes: result.memoryNodes.map(n => ({
					memoryNodeId: n.memoryNodeId,
					content: n.content,
					createdAt: n.createdAt,
					updatedAt: n.updatedAt,
				})),
				total: result.total,
				pageNum: result.pageNum,
				pageSize: result.pageSize,
			};
		});
	}
}
