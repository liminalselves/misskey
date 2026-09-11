/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { AgentStickerService } from '@/core/AgentStickerService.js';
import { normalizeCharacterStickerList, AGENT_STICKER_DESCRIPTION_MAX } from '@/core/agent-sticker-utils.js';
import type { AgentStickerReplyContext } from '@/core/AgentStickerService.js';
// 依存チェーン上の ESM-only パッケージ（node-fetch / nanoid 等）は jest.config.unit.cjs の
// moduleNameMapper で共通スタブに解決される（本テストは純粋ロジックのみ対象）

describe('AgentStickerService prompt/reply helpers', () => {
	// enforceReplyLimits / convertUserTextForLlm 不触碰 DI，可安全用空依赖构造
	const service = new AgentStickerService(undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never);

	function ctx(partial: Partial<AgentStickerReplyContext> = {}): AgentStickerReplyContext {
		return {
			enabled: true,
			max: 3,
			emojiNames: new Set(['happy', 'cry']),
			stickerKeys: new Set(['smug']),
			...partial,
		};
	}

	describe('enforceReplyLimits', () => {
		test('keeps the first N hits in order and removes the rest', () => {
			const text = 'a :happy: b :cry: c [[agent_sticker key=smug]] d :happy: e';
			// 命中顺序：:happy:(2) :cry:(1) sticker(3) :happy:(4)；上限 3 → 第 4 个 :happy: 被移除
			expect(service.enforceReplyLimits(text, ctx({ max: 3 })))
				.toBe('a :happy: b :cry: c [[agent_sticker key=smug]] d  e');
		});

		test('keeps everything when under the limit', () => {
			const text = 'x :happy: y [[agent_sticker key=smug]] z';
			expect(service.enforceReplyLimits(text, ctx({ max: 3 }))).toBe(text);
		});

		test('strips unknown sticker tags and unknown emoji names stay as plain text', () => {
			const text = ':happy: [[agent_sticker key=fake]] :not_in_list: [[agent_sticker key=smug]]';
			// fake key 不在列表 → 剥标签；:not_in_list: 不在注入集合 → 视为普通文本保留
			expect(service.enforceReplyLimits(text, ctx()))
				.toBe(':happy:  :not_in_list: [[agent_sticker key=smug]]');
		});

		test('disabled feature strips all sticker tags and keeps emoji text untouched', () => {
			const text = ':happy: [[agent_sticker key=smug]] :cry:';
			expect(service.enforceReplyLimits(text, ctx({ enabled: false })))
				.toBe(':happy:  :cry:');
		});

		test('max 0 removes every known hit and any sticker tag', () => {
			const text = ':happy: mid [[agent_sticker key=smug]] end';
			expect(service.enforceReplyLimits(text, ctx({ max: 0 }))).toBe(' mid  end');
		});

		test('empty and no-hit inputs pass through', () => {
			expect(service.enforceReplyLimits('', ctx())).toBe('');
			expect(service.enforceReplyLimits('普通文本 12:30:45', ctx())).toBe('普通文本 12:30:45');
		});
	});

	describe('convertUserTextForLlm', () => {
		const emojiList = [
			{ name: 'happy', description: '开心猫' },
			{ name: 'cry', description: '大哭' },
		];

		test('replaces described emoji codes with bracketed descriptions', () => {
			expect(service.convertUserTextForLlm('今天真:happy:啊', emojiList))
				.toBe('今天真（表情 happy：开心猫）啊');
		});

		test('leaves unknown names and non-emoji colons untouched', () => {
			expect(service.convertUserTextForLlm('时间 12:30:45 与 :unknown:', emojiList))
				.toBe('时间 12:30:45 与 :unknown:');
		});

		test('empty emoji list keeps text as-is', () => {
			expect(service.convertUserTextForLlm(':happy:', [])).toBe(':happy:');
		});
	});
});

describe('normalizeCharacterStickerList', () => {
	test('drops invalid entries and keeps valid ones in order', () => {
		const out = normalizeCharacterStickerList([
			{ key: 'smug', fileId: 'file1', description: '得意' },
			null,
			{ key: '', fileId: 'f', description: 'd' },
			{ key: 'bad key!', fileId: 'f', description: 'd' },
			{ key: 'ok2', fileId: '', description: 'd' },
			{ key: 'ok3', fileId: 'f3', description: '   ' },
			'junk',
			{ key: 'ok4', fileId: 'f4', description: 'x'.repeat(500) },
		]);
		expect(out).toHaveLength(2);
		expect(out[0]).toEqual({ key: 'smug', fileId: 'file1', description: '得意' });
		expect(out[1].key).toBe('ok4');
		expect(out[1].description.length).toBe(AGENT_STICKER_DESCRIPTION_MAX);
	});

	test('non-array input returns empty list', () => {
		expect(normalizeCharacterStickerList(undefined)).toEqual([]);
		expect(normalizeCharacterStickerList('nope')).toEqual([]);
	});
});
