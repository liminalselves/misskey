/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const AGENT_EXTERNAL_AUDIT_PROVIDER_IDS = ['openai', 'aliyun-decision'] as const;

export type AgentExternalAuditProvider = typeof AGENT_EXTERNAL_AUDIT_PROVIDER_IDS[number];

export function isAgentExternalAuditProvider(value: unknown): value is AgentExternalAuditProvider {
	return typeof value === 'string' && (AGENT_EXTERNAL_AUDIT_PROVIDER_IDS as readonly string[]).includes(value);
}
