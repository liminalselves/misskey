/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { AgentExternalAuditProvider } from '@/models/AgentExternalAuditProvider.js';
import { AGENT_EXTERNAL_AUDIT_PROVIDER_IDS } from '@/models/AgentExternalAuditProvider.js';
import { normalizeChatCompletionsUrl } from '@/misc/validate-llm-endpoint-url.js';

export type AgentExternalAuditProviderDefinition = {
	id: AgentExternalAuditProvider;
	name: string;
	normalizeUrl: (url: URL) => string;
	validateUrl: (url: URL) => void;
};

const noopValidate = (): void => {};

const definitions: Record<AgentExternalAuditProvider, AgentExternalAuditProviderDefinition> = {
	openai: {
		id: 'openai',
		name: 'OpenAI 兼容 Chat Completions',
		normalizeUrl: url => normalizeChatCompletionsUrl(url.toString()),
		validateUrl: noopValidate,
	},
	'jev-decision': {
		id: 'jev-decision',
		name: 'JEV 决策模型',
		normalizeUrl: url => url.toString(),
		validateUrl: url => {
			if (!/\/v1\/systemone$/.test(url.pathname)) {
				throw new Error('JEV decision model endpoint must end with /v1/systemone.');
			}
		},
	},
	'aliyun-decision': {
		id: 'aliyun-decision',
		name: '阿里云百炼决策模型',
		normalizeUrl: url => url.toString(),
		validateUrl: url => {
			if (!/\/compatible-mode\/v1\/systemone$/.test(url.pathname)) {
				throw new Error('Aliyun decision model endpoint must end with /compatible-mode/v1/systemone.');
			}
		},
	},
};

export const AGENT_EXTERNAL_AUDIT_PROVIDERS = AGENT_EXTERNAL_AUDIT_PROVIDER_IDS.map(id => definitions[id]);

export function getAgentExternalAuditProviderDefinition(provider: AgentExternalAuditProvider): AgentExternalAuditProviderDefinition {
	return definitions[provider];
}
