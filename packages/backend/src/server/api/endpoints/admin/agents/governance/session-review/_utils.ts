/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { AgentSessionsRepository } from '@/models/_.js';
import type { MiAgentSession } from '@/models/AgentSession.js';
import { ApiError } from '@/server/api/error.js';

export const SESSION_REVIEW_ERRORS = {
	noSuchSession: { message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'de2f5a01-6b34-4c51-9a70-3a1c94f0e521', kind: 'client', httpStatusCode: 404 } as const,
};

/**
 * 会话审查镜像端点的共用加载器：仅校验会话存在，不做属主/策略校验
 * （审查视角必须能看到已封禁、角色已下架等异常会话）。
 */
export async function loadSessionForReview(agentSessionsRepository: AgentSessionsRepository, sessionId: string): Promise<MiAgentSession> {
	const session = await agentSessionsRepository.findOneBy({ id: sessionId });
	if (!session) {
		throw new ApiError(SESSION_REVIEW_ERRORS.noSuchSession);
	}
	return session;
}
