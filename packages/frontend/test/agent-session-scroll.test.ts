/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { transpileModule } from 'typescript';
import { agentSegmentDelayMs } from '../src/utility/agent-message-segments.js';

const source = readFileSync(resolve(process.cwd(), 'src/pages/chat/agent-session.vue'), 'utf8');
const scrolling = source.slice(source.indexOf('async function scrollToLatest()'), source.indexOf('\nasync function loadSession()'));
const playback = source.slice(
	source.indexOf('const segmentPlayback = ref<'),
	source.indexOf('\n/** 与后端 send 中 safeAgentMemEveryNRounds'),
);
const script = transpileModule(`${scrolling}\n${playback}\nreturn { playSegmentedReply };`, {}).outputText;

function setup(scrollTop: number) {
	const container = {
		scrollTop,
		scrollTo: vi.fn((options: { top: number }) => {
			container.scrollTop = options.top;
		}),
	};
	const state = {
		timelineEl: { value: {} },
		getScrollContainer: () => container,
		nextTick,
		ref,
		session: ref({ segmentedOutputEnabled: true }),
		splitAgentMessageIntoSegments: (content: string) => [content],
		stripAgentCueTokens: (content: string) => content,
		agentSegmentDelayMs,
		window,
	};
	const actions = new Function(...Object.keys(state), script)(...Object.values(state)) as {
		playSegmentedReply: (message: { id: string; content: string }, segments?: string[]) => Promise<boolean>;
	};
	return { ...actions, container };
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('Agent chat segmented playback scrolling', () => {
	test.each([0, -500])('keeps only the initial scroll and never pulls the reader during or after playback (initial scrollTop: %i)', async initialScrollTop => {
		vi.useFakeTimers();
		vi.spyOn(window.document, 'hidden', 'get').mockReturnValue(false);
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => window.setTimeout(() => callback(0), 0));
		const state = setup(initialScrollTop);
		const promise = state.playSegmentedReply({ id: 'message1', content: '' }, ['一', '二', '三']);
		await nextTick();
		expect(state.container.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, behavior: 'instant' });

		// 用户随后上翻阅读时，后续段与播放结束都不得再次滚动。
		state.container.scrollTop = -500;
		state.container.scrollTo.mockClear();
		await vi.advanceTimersByTimeAsync(10_000);

		await expect(promise).resolves.toBe(true);
		expect(state.container.scrollTo).not.toHaveBeenCalled();
		expect(state.container.scrollTop).toBe(-500);
	});
});
