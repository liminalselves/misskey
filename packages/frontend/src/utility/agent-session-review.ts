/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 会话审查模式（管理员以用户侧聊天 UI 只读查看他人会话）的端点映射。
 * 后端为每个用户侧读端点提供形状一致的 admin 镜像（admin/agents/governance/session-review/*），
 * 前端审查模式下把用户侧端点名映射过去，响应结构不变、组件零分支渲染。
 * 用户侧新增读能力时在此补一行映射 + 后端补一个镜像端点即可。
 */
export const agentSessionReviewEndpointMap: Partial<Record<string, string>> = {
	'agents/sessions/show': 'admin/agents/governance/session-review/session',
	'agents/messages/timeline': 'admin/agents/governance/session-review/messages',
	'agents/messages/show': 'admin/agents/governance/session-review/message',
	'agents/messages/search': 'admin/agents/governance/session-review/search',
	'agents/images/placeholder-status': 'admin/agents/governance/session-review/image-placeholder-status',
	'agents/sessions/context-window': 'admin/agents/governance/session-review/context-window',
	'agents/memory/list': 'admin/agents/governance/session-review/memory',
	'agents/sessions/compression-overview': 'admin/agents/governance/session-review/compression-overview',
	'agents/sessions/worldbook-list': 'admin/agents/governance/session-review/worldbook-list',
	'agents/sessions/rule-list': 'admin/agents/governance/session-review/rule-list',
	'agents/sessions/worldbook-match-preview': 'admin/agents/governance/session-review/worldbook-match-preview',
	'agents/characters/show': 'admin/agents/governance/session-review/character',
	'agents/styles/list-usable': 'admin/agents/governance/session-review/styles',
	'agents/byok/models/list': 'admin/agents/governance/session-review/byok-models',
	'agents/proactive-schedules/list': 'admin/agents/governance/session-review/proactive-schedules',
	'agents/sessions/export': 'admin/agents/governance/session-review/export',
};

/** 镜像端点 paramDef 额外要求 sessionId（用户侧按 me.id 隐式推导的端点） */
const reviewEndpointsNeedingSessionId = new Set([
	'agents/characters/show',
	'agents/styles/list-usable',
	'agents/byok/models/list',
]);

/**
 * 审查模式下的实际调用目标：未在映射表中的端点（写端点）返回 null，调用方应拒绝。
 */
export function resolveAgentSessionReviewCall(
	endpoint: string,
	data: Record<string, unknown>,
	sessionId: string,
): { endpoint: string; data: Record<string, unknown> } | null {
	const mapped = agentSessionReviewEndpointMap[endpoint];
	if (mapped == null) return null;
	return {
		endpoint: mapped,
		data: reviewEndpointsNeedingSessionId.has(endpoint) ? { ...data, sessionId } : { ...data },
	};
}
