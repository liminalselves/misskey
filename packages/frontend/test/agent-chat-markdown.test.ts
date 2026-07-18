/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test } from 'vitest';
import { renderAgentChatMarkdown } from '@/utility/agent-chat-markdown.js';
import { agentI18nTextFromLocale } from '@/utility/agent-i18n.js';

describe('agent chat markdown sanitization', () => {
	test('keeps allowed Markdown while removing executable markup and unsafe URLs', () => {
		const html = renderAgentChatMarkdown([
			'[safe](https://example.com/path)',
			'<script>alert(1)</script>',
			'<img src="javascript:alert(1)" onerror="alert(2)">',
			'<a href="javascript:alert(3)" onclick="alert(4)">unsafe</a>',
		].join('\n'));

		assert.match(html, /href="https:\/\/example\.com\/path"/);
		assert.match(html, /rel="nofollow noopener noreferrer"/);
		assert.match(html, /target="_blank"/);
		assert.isFalse(/<script|onerror=|onclick=|javascript:/i.test(html));
	});

	test('reads a missing cached locale key without invoking the development i18n proxy', () => {
		assert.equal(agentI18nTextFromLocale({ _agents: { proactiveMessages: 'Proactive messages' } }, '_agents.proactiveMessages', 'fallback'), 'Proactive messages');
		assert.equal(agentI18nTextFromLocale({ _agents: {} }, '_agents.proactiveMessages', 'fallback'), 'fallback');
	});
});
