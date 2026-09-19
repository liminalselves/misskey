/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const AGENT_IMAGE_PROVIDER_IDS = ['aurora', 'openai', 'tiptotip', 'qwen'] as const;

export type AgentImageProvider = typeof AGENT_IMAGE_PROVIDER_IDS[number];

export function isAgentImageProvider(value: unknown): value is AgentImageProvider {
	return typeof value === 'string' && (AGENT_IMAGE_PROVIDER_IDS as readonly string[]).includes(value);
}
