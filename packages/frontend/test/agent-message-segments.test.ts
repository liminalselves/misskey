/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test } from 'vitest';
import { splitAgentMessageIntoSegments } from '@/utility/agent-message-segments.js';
import { instance } from '@/instance.js';
import { customEmojis } from '@/custom-emojis.js';

function enableWith(names: string[]) {
	instance.agentStickerEnabled = true;
	customEmojis.value = names.map(name => ({ aliases: [], name, category: null, url: `https://example.com/${name}.png` }));
}

describe('splitAgentMessageIntoSegments sticker tokens', () => {
	test('mid-line emoji splits into its own bubble segment', () => {
		enableWith(['smug']);
		assert.deepEqual(
			splitAgentMessageIntoSegments('哈哈:smug:再会'),
			['哈哈', ':smug:', '再会'],
		);
	});

	test('own-line emoji stays its own segment', () => {
		enableWith(['smug']);
		assert.deepEqual(
			splitAgentMessageIntoSegments('你好\n:smug:\n再见'),
			['你好', ':smug:', '再见'],
		);
	});

	test('character sticker tag splits mid-line too', () => {
		enableWith([]);
		assert.deepEqual(
			splitAgentMessageIntoSegments('开心[[agent_sticker key=joy]]完事'),
			['开心', '[[agent_sticker key=joy]]', '完事'],
		);
	});

	test('unknown emoji names and time-like colons never split', () => {
		enableWith(['smug']);
		assert.deepEqual(
			splitAgentMessageIntoSegments('时间 12:30:45 与 :not_listed:'),
			['时间 12:30:45 与 :not_listed:'],
		);
	});

	test('feature disabled keeps lines intact (pre-feature behavior)', () => {
		instance.agentStickerEnabled = false;
		customEmojis.value = [];
		assert.deepEqual(
			splitAgentMessageIntoSegments('哈哈:smug:再会\n:smug:'),
			['哈哈:smug:再会', ':smug:'],
		);
	});

	test('code fence lines are not split by tokens', () => {
		enableWith(['smug']);
		assert.deepEqual(
			splitAgentMessageIntoSegments(['```', ':smug: in code', '```'].join('\n')),
			['```\n:smug: in code\n```'],
		);
	});

	test('list lines keep markdown structure intact', () => {
		enableWith(['smug']);
		// 连续列表行原本就合并为一个分段（既有行为），且不按 token 拆分
		assert.deepEqual(
			splitAgentMessageIntoSegments('- 条目一\n- :smug: 条目二'),
			['- 条目一\n- :smug: 条目二'],
		);
	});
});
