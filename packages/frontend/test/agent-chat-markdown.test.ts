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

describe('agent chat markdown emoji codes stay literal', () => {
	// `:name:` 不在 markdown 层渲染：由 agent-session.message 的 renderParts 切成贴纸图块。
	// markdown 工具须保持字面文本，且不产生任何 img。
	test('keeps :name: as literal text without emitting images', () => {
		const html = renderAgentChatMarkdown('你好 :agenttestsmile: 再见 与 12:30:45');
		assert.isFalse(html.includes('<img'));
		assert.match(html, /:agenttestsmile:/);
		assert.match(html, /12:30:45/);
	});
});
