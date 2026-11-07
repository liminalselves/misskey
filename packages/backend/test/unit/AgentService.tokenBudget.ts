/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { AgentService, agentsErrors } from '@/core/AgentService.js';
import { AgentTokenService, AGENT_MESSAGE_ENVELOPE_TOKENS } from '@/core/AgentTokenService.js';

function service(): AgentService {
	const svc = Object.create(AgentService.prototype) as AgentService;
	Object.assign(svc, { agentTokenService: new AgentTokenService() });
	return svc;
}

describe('AgentService final prompt token budget', () => {
	test('drops the oldest complete turn before the current user message', () => {
		const svc = service();
		const current = 'current user';
		const base = svc.fitAgentPromptToTokenBudget({ system: '', messages: [], userText: current, maxContextTokens: 1000, maxOutputTokensPerCall: 1 });
		const required = new AgentTokenService().countUnifiedTokens(current) + AGENT_MESSAGE_ENVELOPE_TOKENS + 1;
		const result = svc.fitAgentPromptToTokenBudget({
			system: '',
			messages: [{ role: 'user', content: 'old user' }, { role: 'assistant', content: 'old assistant' }, { role: 'user', content: 'newer user' }, { role: 'assistant', content: 'newer assistant' }],
			userText: current,
			maxContextTokens: required,
			maxOutputTokensPerCall: 1,
		});
		expect(result).toEqual(base);
	});

	test('does not truncate the current user input when even required content is over budget', () => {
		const svc = service();
		const current = 'x'.repeat(300);
		expect(() => svc.fitAgentPromptToTokenBudget({ system: '', messages: [], userText: current, maxContextTokens: 1, maxOutputTokensPerCall: 1 }))
			.toThrowError(expect.objectContaining({ code: agentsErrors.contextBudgetExceeded.code }));
	});
});
