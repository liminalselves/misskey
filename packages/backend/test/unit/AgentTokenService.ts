/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect } from 'vitest';

import { AgentTokenService, AGENT_UNIFIED_TOKENIZER_ENCODING } from '@/core/AgentTokenService.js';

describe('AgentTokenService', () => {
	const svc = new AgentTokenService();

	describe('countTokensExact', () => {
		test('Gemini 空文本直接返回 0，不初始化本地分词器', async () => {
			await expect(svc.countTokensExact('', 'gemini:gemini-2.0-flash-001')).resolves.toBe(0);
		});

		test('统一分词器把正文里的特殊 token 串当普通文本计数，不回退估算', async () => {
			const n = await svc.countTokensExact('hi <|endoftext|> there', AGENT_UNIFIED_TOKENIZER_ENCODING);
			expect(n).not.toBeNull();
			expect(n!).toBeGreaterThan(3);
		});

		test('统一分词器对同一长文本重复计数结果一致（缓存命中）', async () => {
			const text = '她把围巾往上拉了拉，轻声说今晚的风有点冷。'.repeat(8);
			const first = await svc.countTokensExact(text, AGENT_UNIFIED_TOKENIZER_ENCODING);
			const second = await svc.countTokensExact(text, AGENT_UNIFIED_TOKENIZER_ENCODING);
			expect(first).toBeGreaterThan(0);
			expect(second).toBe(first);
		});
	});

	describe('computeMessageWeights（精确计数窗口边界）', () => {
		test('累计超出预算的那条起改用估算，D 单调递增', async () => {
			const rows = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, text: 'x'.repeat(30) }));
			const counter = () => 10;
			const w = await svc.computeMessageWeights(rows, { formatFn: m => m.text, counter, budgetForExact: 25 });
			expect([...w.dMap.values()]).toEqual([10, 20, 30, 40, 50, 60]);
			expect(rows.map(r => w.estimatedById.get(r.id))).toEqual([false, false, true, true, true, true]);
		});

		test('精确超窗后估算不能把消息重新放回窗内', async () => {
			const rows = [{ id: 'newest', text: 'x'.repeat(99) }, { id: 'older', text: 'x'.repeat(99) }];
			const weights = await svc.computeMessageWeights(rows, { formatFn: m => m.text, counter: () => 100, budgetForExact: 90 });
			expect(weights.exactFirstOutIndex).toBe(0);
			expect([...weights.dMap.values()].every(d => d > 90)).toBe(true);
			const bands = svc.computeWindowAndBands(rows, weights.dMap, { historyBudgetTokens: 90, t1Ratio: 0.8, t2Ratio: 0.9, exactFirstOutIndex: weights.exactFirstOutIndex });
			expect([...bands.bandById.values()]).toEqual(['out', 'out']);
			expect(bands.windowBoundaryId).toBeNull();
		});

		test('零预算不伪造最新一条在窗内', async () => {
			const rows = [{ id: 'newest', text: 'x'.repeat(99) }];
			const weights = await svc.computeMessageWeights(rows, { formatFn: m => m.text, counter: () => 100, budgetForExact: 0 });
			const bands = svc.computeWindowAndBands(rows, weights.dMap, { historyBudgetTokens: 0, t1Ratio: 0.8, t2Ratio: 0.9, exactFirstOutIndex: weights.exactFirstOutIndex });
			expect(bands.bandBudget).toBe(0);
			expect(bands.bandById.get('newest')).toBe('out');
		});
	});

	describe('resolveTokenConfig（全站统一分词器）', () => {
		test('BYOK 的旧字符比率字段不再影响计数配置', async () => {
			const byok = new AgentTokenService({ resolveConnection: async () => ({ charsPerToken: 1, tokenizerEncoding: 'cl100k_base' }) } as never);
			expect(await byok.resolveTokenConfigForUser({} as never, 'u0123456789', 'owner')).toEqual({ encoding: AGENT_UNIFIED_TOKENIZER_ENCODING, tokenMode: 'exact' });
		});

		test('Token 裁剪不破坏代理对，保留尾部时仍不超过上限', () => {
			const text = '😀'.repeat(100);
			const start = svc.truncateTextToTokenLimit(text, 10);
			const end = svc.truncateTextToTokenLimit(text, 10, 'end');
			expect(svc.countUnifiedTokens(start)).toBeLessThanOrEqual(10);
			expect(svc.countUnifiedTokens(end)).toBeLessThanOrEqual(10);
			expect(start.endsWith('\uD800')).toBe(false);
			expect(end.startsWith('\uDC00')).toBe(false);
		});

		test('无论模型配置何种编码，上下文计数恒用统一编码', () => {
			const meta = {
				agentDefaultModelId: 'm1',
				agentLlmModels: [{ id: 'm1', name: 'M1', tokenizerEncoding: 'glm:glm-4-plus', charsPerToken: 2 }],
			} as never;
			const config = svc.resolveTokenConfig(meta, 'm1');
			expect(config.encoding).toBe(AGENT_UNIFIED_TOKENIZER_ENCODING);
			expect(config.tokenMode).toBe('exact');
			expect(svc.resolveTokenConfig(meta, null).encoding).toBe(AGENT_UNIFIED_TOKENIZER_ENCODING);
		});
	});

	describe('estimateTokens（唯一估算实现：Math.round(chars / charsPerToken)）', () => {
		test('默认比率 3，四舍五入', () => {
			expect(svc.estimateTokens(9)).toBe(3);
			expect(svc.estimateTokens(10)).toBe(3); // 3.33 → 3
			expect(svc.estimateTokens(11)).toBe(4); // 3.67 → 4
		});

		test('自定义比率', () => {
			expect(svc.estimateTokens(10, 2)).toBe(5);
			expect(svc.estimateTokens(7, 2)).toBe(4); // 3.5 → 4（四舍五入）
		});

		test('非正数与非法输入回退', () => {
			expect(svc.estimateTokens(0)).toBe(0);
			expect(svc.estimateTokens(-5)).toBe(0);
			expect(svc.estimateTokens(Number.NaN)).toBe(0);
			expect(svc.estimateTokens(9, 0)).toBe(3); // 非法比率回退默认 3
		});
	});

	describe('resolveHistoryBudgets（统一 Token 预算）', () => {
		test('预算 = maxContext - 已知文本与固定槽预留 - 输出预留', () => {
			const b = svc.resolveHistoryBudgets({ maxContextTokens: 1000, maxOutputTokensPerCall: 100, overheadTokens: 100 });
			expect(b).toMatchObject({ historyBudgetTokens: 800, tokenMode: 'exact' });
		});

		test('非法或负的 overhead 按 0 计，预算不为负', () => {
			expect(svc.resolveHistoryBudgets({ maxContextTokens: 1000, maxOutputTokensPerCall: 1, overheadTokens: -100 }).historyBudgetTokens).toBe(999);
			expect(svc.resolveHistoryBudgets({ maxContextTokens: 10, maxOutputTokensPerCall: 100, overheadTokens: 100000 }).historyBudgetTokens).toBe(0);
		});
	});

	describe('computeWindowAndBands 核心不变量：windowBoundaryId == 首个 out 的前一条', () => {
		const ratios = { historyBudgetTokens: 100, t1Ratio: 0.8, t2Ratio: 0.9 };

		test('estimate 模式（字符估算 D）', async () => {
			// 每条 30 chars → 10 tokens；D 累计 10,20,...,120。H=100 → 第 11 条 out
			const rows = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, content: 'x'.repeat(30) }));
			const w = await svc.computeMessageWeights(rows, { formatFn: m => m.content });
			const bands = svc.computeWindowAndBands(rows, w.dMap, ratios);
			expect(w.useExactD).toBe(false);
			expect(bands.firstOutId).toBe('m10');
			expect(bands.windowBoundaryId).toBe('m9');
			expect(bands.truncated).toBe(true);
			// 结构恒等：窗口边界恰为首个 out 的前一条
			const idx = rows.findIndex(r => r.id === bands.firstOutId);
			expect(bands.windowBoundaryId).toBe(rows[idx - 1]!.id);
		});

		test('exact 模式（精确计数 D）', async () => {
			// counter 恒返回 25 token/条；D 累计 25,50,75,100,125。H=100 → 第 5 条 out
			const rows = Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, content: `msg${i}` }));
			const counter = () => 25;
			const w = await svc.computeMessageWeights(rows, { formatFn: m => m.content, counter, budgetForExact: 100 });
			const bands = svc.computeWindowAndBands(rows, w.dMap, ratios);
			expect(w.useExactD).toBe(true);
			expect(bands.firstOutId).toBe('e4');
			expect(bands.windowBoundaryId).toBe('e3');
			const idx = rows.findIndex(r => r.id === bands.firstOutId);
			expect(bands.windowBoundaryId).toBe(rows[idx - 1]!.id);
		});

		test('exact 模式超预算后回退估算，estimatedById 逐条标记（窗外一律估算）', async () => {
			// counter 恒返回 60 token/条，budgetForExact=100：按条判断窗口边界。
			// x0：累计 60 ≤ 100 → 精确；x1：累计将达 120 > 100（滑出窗口）→ 自此条起全部估算。
			const rows = Array.from({ length: 70 }, (_, i) => ({ id: `x${i}`, content: `c${i}` }));
			const counter = () => 60;
			const w = await svc.computeMessageWeights(rows, { formatFn: m => m.content, counter, budgetForExact: 100 });
			// 窗内（x0）精确计数：estimatedById 为 false
			expect(w.estimatedById.get('x0')).toBe(false);
			// 自滑出窗口的 x1 起（含跨块 x64…x69）全部估算：estimatedById 为 true
			expect(w.estimatedById.get('x1')).toBe(true);
			expect(w.estimatedById.get('x63')).toBe(true);
			expect(w.estimatedById.get('x64')).toBe(true);
			expect(w.estimatedById.get('x69')).toBe(true);
			expect(w.useExactD).toBe(true);
		});

		test('estimate 模式（无 counter）所有消息均为估算', async () => {
			const rows = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, content: 'abc' }));
			const w = await svc.computeMessageWeights(rows, { formatFn: m => m.content });
			expect(w.useExactD).toBe(false);
			for (const r of rows) expect(w.estimatedById.get(r.id)).toBe(true);
		});

		test('exact 模式计数器返回 null 时该条回退估算', async () => {
			const rows = [{ id: 'q0', content: 'hello' }, { id: 'q1', content: 'world' }];
			const counter = (t: string) => (t === 'hello' ? 10 : null);
			const w = await svc.computeMessageWeights(rows, { formatFn: m => m.content, counter, budgetForExact: 1000 });
			expect(w.estimatedById.get('q0')).toBe(false); // 精确
			expect(w.estimatedById.get('q1')).toBe(true); // null 回退估算
		});

		test('恰好等于预算仍算窗内（d == H 非 out）', async () => {
			const rows = [
				{ id: 'a', content: 'x'.repeat(150) }, // 50 tokens
				{ id: 'b', content: 'x'.repeat(150) }, // D=100 == H → 仍窗内（staged）
			];
			const w = await svc.computeMessageWeights(rows, { formatFn: m => m.content });
			const bands = svc.computeWindowAndBands(rows, w.dMap, ratios);
			expect(bands.truncated).toBe(false);
			expect(bands.firstOutId).toBeNull();
			expect(bands.windowBoundaryId).toBe('b'); // 无 out → 最旧包含条
			expect(bands.bandById.get('b')).toBe('staged'); // t2=90 < 100 <= H
		});

		test('超预算 1 token 即 out', async () => {
			const rows = [
				{ id: 'a', content: 'x'.repeat(150) }, // 50
				{ id: 'b', content: 'x'.repeat(150) }, // 100
				{ id: 'c', content: 'x'.repeat(3) }, // D=101 > H → out
			];
			const w = await svc.computeMessageWeights(rows, { formatFn: m => m.content });
			const bands = svc.computeWindowAndBands(rows, w.dMap, ratios);
			expect(bands.firstOutId).toBe('c');
			expect(bands.windowBoundaryId).toBe('b');
			expect(bands.truncated).toBe(true);
		});

		test('无 out 时 windowBoundaryId 为最旧条', async () => {
			const rows = [
				{ id: 'n1', content: 'x'.repeat(30) },
				{ id: 'n2', content: 'x'.repeat(30) },
			];
			const w = await svc.computeMessageWeights(rows, { formatFn: m => m.content });
			const bands = svc.computeWindowAndBands(rows, w.dMap, ratios);
			expect(bands.truncated).toBe(false);
			expect(bands.windowBoundaryId).toBe('n2');
			expect(bands.firstOutId).toBeNull();
		});

		test('区带阈值 t1/t2 正确分层', async () => {
			// H=100, t1=80, t2=90；每条 25 token → D: 25(new),50(new),75(new),100(staged 因 >t2)
			const rows = Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, content: `m${i}` }));
			const w = await svc.computeMessageWeights(rows, { formatFn: m => m.content, counter: () => 25, budgetForExact: 100 });
			const bands = svc.computeWindowAndBands(rows, w.dMap, ratios);
			expect(bands.t1Band).toBe(80);
			expect(bands.t2Band).toBe(90);
			expect(bands.bandById.get('s0')).toBe('new'); // D=25
			expect(bands.bandById.get('s3')).toBe('staged'); // D=100 > t2=90, == H 非 out
		});
	});

	describe('filterRowsForChatHistoryD', () => {
		test('仅保留 user/assistant', () => {
			const rows = [
				{ role: 'user' }, { role: 'system' }, { role: 'assistant' }, { role: 'tool' },
			];
			expect(svc.filterRowsForChatHistoryD(rows).map(r => r.role)).toEqual(['user', 'assistant']);
		});
	});
});
