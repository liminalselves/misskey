/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	AGENT_LLM_MISSING_ASSISTANT_REPLY_MARKER,
	AGENT_LLM_PROACTIVE_CONTINUATION_MARKER,
	normalizeAgentLlmTurns,
} from '@/core/AgentService.js';

describe('normalizeAgentLlmTurns', () => {
	test('keeps legacy adjacent assistant turns separate with a server-only proactive marker', () => {
		expect(normalizeAgentLlmTurns([
			{ role: 'user', content: 'first question' },
			{ role: 'assistant', content: 'first answer' },
			{ role: 'assistant', content: 'proactive follow-up' },
			{ role: 'user', content: 'next question' },
		])).toEqual([
			{ role: 'user', content: 'first question' },
			{ role: 'assistant', content: 'first answer' },
			{ role: 'user', content: AGENT_LLM_PROACTIVE_CONTINUATION_MARKER },
			{ role: 'assistant', content: 'proactive follow-up' },
			{ role: 'user', content: 'next question' },
		]);
	});

	test('keeps adjacent user turns separate with a server-only missing-reply marker', () => {
		expect(normalizeAgentLlmTurns([
			{ role: 'user', content: 'unfinished request' },
			{ role: 'user', content: 'latest request' },
		])).toEqual([
			{ role: 'user', content: 'unfinished request' },
			{ role: 'assistant', content: AGENT_LLM_MISSING_ASSISTANT_REPLY_MARKER },
			{ role: 'user', content: 'latest request' },
		]);
	});
});
