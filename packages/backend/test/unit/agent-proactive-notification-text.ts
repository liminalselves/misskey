/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { buildAgentProactiveNotificationText } from '@/core/agent-proactive-notification-text.js';

describe('buildAgentProactiveNotificationText', () => {
	test('removes agent image syntax and rich text markers from proactive notifications', () => {
		const result = buildAgentProactiveNotificationText([
			'**嘿，欢迎回来！** $[jelly 现在精神十足] :sparkle:',
			'[[agent_draw size=portrait tag=1girl, solo, smiling]]',
			'[看看这个](https://example.com) 和 `一小段代码`。',
			'[[wb:greeting]]',
		].join('\n'));

		// 主动消息通知保留换行；指令标签行整体移除后不产生空行
		expect(result).toBe('嘿，欢迎回来！ 现在精神十足\n看看这个 和 一小段代码。');
	});
});
