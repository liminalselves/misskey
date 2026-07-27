/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Logger } from '@nestjs/common';
import { getEncoding, type Tiktoken, type TiktokenEncoding } from 'js-tiktoken';
import { bindThis } from '@/decorators.js';
import { getEffectiveLlmModels } from '@/misc/agent-llm-models.js';
import type { MiMeta } from '@/models/Meta.js';

// ─────────────────────────────────────────────────────────────
// 常量（单一出处；其它模块从此 re-export）
// ─────────────────────────────────────────────────────────────

/** 字符↔token 启发式换算比率（中文为主时偏保守） */
export const AGENT_LLM_APPROX_CHARS_PER_TOKEN = 3;

/**
 * 压缩总览与上下文窗口端点的消息扫描上限。
 * 50_000 条 × 平均 100 chars ≈ 5M chars ≈ 1.67M tokens，
 * 远超当前最大模型上下文窗口（500K tokens = 1.5M chars）。
 */
export const AGENT_OVERVIEW_SCAN_LIMIT = 50_000;

/** 发信路径（send/peek/afterAssistant）的消息扫描窗口；reconcileStickyStates 的"端点缺失即 active"启发式以此为准 */
export const AGENT_SEND_PATH_SCAN_LIMIT = 500;

/** Gemini tokenizer 前缀标识 */
export const GEMINI_ENCODING_PREFIX = 'gemini:';

// ─────────────────────────────────────────────────────────────
// 共享类型
// ─────────────────────────────────────────────────────────────

export type TokenMode = 'exact' | 'estimate';

/** 上下文区带：窗内·新 / 排队较前 / 排队较后 / 窗户外 */
export type TokenBand = 'new' | 'prep' | 'staged' | 'out';

/** 精确 token 计数器（同步或异步）；返回 null 表示该条回退估算 */
export type TokenCounter = (text: string) => Promise<number | null> | number | null;

export interface TokenConfig {
	charsPerToken: number;
	encoding?: string;
	tokenMode: TokenMode;
}

export interface HistoryBudget {
	maxContextTokens: number;
	maxOutputTokensPerCall: number;
	charsPerToken: number;
	/** 字符口径历史预算（estimate 模式权威） */
	historyBudgetChars: number;
	/** token 口径历史预算（exact 模式权威；与字符预算由同一 overhead 导出） */
	historyBudgetTokens: number;
	tokenMode: TokenMode;
}

export interface MessageWeights {
	/** 自最新条向旧累加的 token 深度（exact 模式为真实 token，estimate 模式为估算 token） */
	dMap: Map<string, number>;
	/** 每条消息自身的 token 数 */
	tokensById: Map<string, number>;
	/** 每条消息自身 token 数是否为启发式估算（精确计数器返回 null，或超出精确预算后为节省性能回退估算） */
	estimatedById: Map<string, boolean>;
	/** 是否使用了精确计数（用于展示层标注 ≈ 前缀） */
	useExactD: boolean;
}

export interface WindowBands {
	bandById: Map<string, TokenBand>;
	/** 滑窗最旧「仍被包含」的消息 ID（最后一个非 out）；无消息时为 null */
	windowBoundaryId: string | null;
	/** 首个滑出窗口（out）的消息 ID；无 out 时为 null */
	firstOutId: string | null;
	/** 提供的 rows 中是否存在 out 消息 */
	truncated: boolean;
	bandBudget: number;
	t1Band: number;
	t2Band: number;
}

// ─────────────────────────────────────────────────────────────
// 服务
// ─────────────────────────────────────────────────────────────

/**
 * 智能体统一 Token 计算权威模块。
 *
 * 所有涉及 token 计数、预算求解、D 累计、滑窗截断、区带划分的功能均经此模块，
 * 以保证「上下文边界分割线」与「消息分段区带」结构性一致（同一 D 累计 + 同一预算阈值）。
 *
 * 分层：
 * 1. 计数层：estimateTokens（O(1) 估算）/ countTokensExact（tiktoken / Gemini LocalTokenizer）
 * 2. 配置解析：resolveTokenConfig（统一模型编码解析）
 * 3. 计数器工厂：makeCounter
 * 4. 预算求解：resolveHistoryBudgets（字符/token 双视图同源导出）
 * 5. 权重计算：computeMessageWeights（D 累计，分块并发 + 超预算提前终止）
 * 6. 窗口与区带：computeWindowAndBands（唯一区带判定 + 窗口边界）
 */
@Injectable()
export class AgentTokenService {
	private readonly logger = new Logger(AgentTokenService.name);
	private encodingCache = new Map<string, Tiktoken>();
	private geminiTokenizerCache = new Map<string, { countTokens: (text: string) => Promise<{ totalTokens: number }> }>();
	private geminiInitPromises = new Map<string, Promise<void>>();
	/** 初始化失败的模型（如不受支持的型号），避免逐条重试与日志洪泛 */
	private geminiFailedModels = new Set<string>();

	// ── 1. 计数层 ──────────────────────────────────────────

	/**
	 * 快速估算 token 数（热路径用）。唯一估算实现：`Math.round(chars / charsPerToken)`。
	 */
	@bindThis
	public estimateTokens(chars: number, charsPerToken: number = AGENT_LLM_APPROX_CHARS_PER_TOKEN): number {
		if (!Number.isFinite(chars) || chars <= 0) return 0;
		const ratio = Number.isFinite(charsPerToken) && charsPerToken >= 1 ? charsPerToken : AGENT_LLM_APPROX_CHARS_PER_TOKEN;
		return Math.max(0, Math.round(chars / ratio));
	}

	/**
	 * 精确 token 计数。
	 * @param encoding tiktoken 编码名（如 "cl100k_base"）或 Gemini 模型（如 "gemini:gemini-2.0-flash-001"）
	 * @returns token 数，或 null（编码不可用时回退估算）
	 */
	@bindThis
	public async countTokensExact(text: string, encoding?: string | null): Promise<number | null> {
		if (!encoding) return null;
		if (encoding.startsWith(GEMINI_ENCODING_PREFIX)) {
			return this.countTokensGemini(text, encoding.slice(GEMINI_ENCODING_PREFIX.length));
		}
		try {
			const enc = this.getTiktokenEncoding(encoding);
			return enc.encode(text).length;
		} catch {
			return null;
		}
	}

	/** 判断编码是否可用（tiktoken 与 gemini: 前缀）。 */
	@bindThis
	public isEncodingAvailable(encoding?: string | null): boolean {
		if (!encoding) return false;
		if (encoding.startsWith(GEMINI_ENCODING_PREFIX)) {
			return encoding.length > GEMINI_ENCODING_PREFIX.length;
		}
		try {
			this.getTiktokenEncoding(encoding);
			return true;
		} catch {
			return false;
		}
	}

	/** 预热 Gemini tokenizer（首次精确计数前调用可避免延迟）。 */
	@bindThis
	public async warmupGeminiTokenizer(modelName: string): Promise<void> {
		await this.getGeminiTokenizer(modelName);
	}

	// ── 2. 配置解析 ────────────────────────────────────────

	/**
	 * 统一解析模型的 token 配置（charsPerToken / encoding / tokenMode），
	 * 收敛此前散落在各端点的 `getEffectiveLlmModels().find()?.tokenizerEncoding` 逻辑。
	 */
	@bindThis
	public resolveTokenConfig(instanceMeta: MiMeta, modelId: string | null): TokenConfig {
		const models = getEffectiveLlmModels(instanceMeta);
		const pick = modelId
			? models.find(m => m.id === modelId)
			: (models.find(m => m.id === instanceMeta.agentDefaultModelId) ?? models[0]);
		const charsPerToken = pick && Number.isFinite(pick.charsPerToken) && pick.charsPerToken! >= 1
			? pick.charsPerToken!
			: AGENT_LLM_APPROX_CHARS_PER_TOKEN;
		const encoding = pick?.tokenizerEncoding;
		const tokenMode: TokenMode = this.isEncodingAvailable(encoding) ? 'exact' : 'estimate';
		return { charsPerToken, encoding, tokenMode };
	}

	// ── 3. 计数器工厂 ──────────────────────────────────────

	/** exact 模式返回精确计数器；estimate 模式返回 undefined。 */
	@bindThis
	public makeCounter(config: TokenConfig): TokenCounter | undefined {
		if (config.tokenMode !== 'exact' || !config.encoding) return undefined;
		const encoding = config.encoding;
		return (text: string) => this.countTokensExact(text, encoding);
	}

	// ── 4. 预算求解 ────────────────────────────────────────

	/**
	 * 由同一 overhead 一致地导出字符与 token 两个口径的历史预算。
	 * - estimate 模式以 `historyBudgetChars` 为权威；
	 * - exact 模式以 `historyBudgetTokens` 为权威。
	 * 调用方负责组装 systemChars（系统提示 + 记忆预留 + 压缩预留）、directiveChars、prefixChars。
	 */
	@bindThis
	public resolveHistoryBudgets(params: {
		maxContextTokens: number;
		maxOutputTokensPerCall: number;
		charsPerToken: number;
		systemChars: number;
		directiveChars: number;
		prefixChars: number;
		tokenMode: TokenMode;
	}): HistoryBudget {
		const cpt = Number.isFinite(params.charsPerToken) && params.charsPerToken >= 1
			? params.charsPerToken
			: AGENT_LLM_APPROX_CHARS_PER_TOKEN;
		const overheadChars = Math.max(0, params.systemChars) + Math.max(0, params.directiveChars) + Math.max(0, params.prefixChars);
		// 字符视图
		const maxContextChars = Math.max(4000, params.maxContextTokens * cpt);
		const reserveReplyChars = Math.max(256, Math.min(384_000, params.maxOutputTokensPerCall * cpt));
		const historyBudgetChars = Math.max(0, maxContextChars - overheadChars - reserveReplyChars);
		// token 视图（由同一 overhead 导出）
		const overheadTokens = Math.ceil(overheadChars / cpt);
		const reserveReplyTokens = Math.max(1, params.maxOutputTokensPerCall);
		const historyBudgetTokens = Math.max(0, params.maxContextTokens - overheadTokens - reserveReplyTokens);
		return {
			maxContextTokens: params.maxContextTokens,
			maxOutputTokensPerCall: params.maxOutputTokensPerCall,
			charsPerToken: cpt,
			historyBudgetChars,
			historyBudgetTokens,
			tokenMode: params.tokenMode,
		};
	}

	// ── 5. 权重计算（D 累计，单位恒为 token） ───────────────

	/**
	 * 自最新条向旧累加 token 深度 D。
	 * - 提供 counter 时：分块并发（CHUNK=64）精确计数；**按条**判断窗口边界——某条累计将超出 budgetForExact（即滑出窗口）时，
	 *   该条及其后（更旧）全部改用启发式估算，保证「窗外一律估算」与区带边界严格对齐；
	 * - 未提供 counter 时：全程估算。
	 * 整请求统一口径，保证 D 单调一致。
	 */
	@bindThis
	public async computeMessageWeights<T extends { id: string }>(
		rowsNewestFirst: T[],
		opts: {
			formatFn: (m: T) => string;
			counter?: TokenCounter;
			charsPerToken: number;
			budgetForExact?: number;
		},
	): Promise<MessageWeights> {
		const dMap = new Map<string, number>();
		const tokensById = new Map<string, number>();
		const estimatedById = new Map<string, boolean>();
		const estimate = (text: string): number => this.estimateTokens(text.length, opts.charsPerToken);

		if (opts.counter) {
			const counter = opts.counter;
			const budget = opts.budgetForExact ?? Number.POSITIVE_INFINITY;
			const CHUNK = 64;
			let acc = 0;
			let pastBudget = false;
			for (let i = 0; i < rowsNewestFirst.length; i += CHUNK) {
				const chunk = rowsNewestFirst.slice(i, i + CHUNK);
				if (!pastBudget) {
					const texts = chunk.map(m => opts.formatFn(m));
					const counts = await Promise.all(texts.map(t => counter(t)));
					for (let j = 0; j < chunk.length; j++) {
						const m = chunk[j]!;
						const exact = counts[j];
						const tok = exact ?? estimate(texts[j]!);
						if (!pastBudget && acc + tok <= budget) {
							// 窗内（累计不超预算）：精确计数
							tokensById.set(m.id, tok);
							estimatedById.set(m.id, exact == null);
							acc += tok;
							dMap.set(m.id, acc);
						} else {
							// 本条将滑出窗口（累计超预算）：自此条起统一改用启发式估算，窗外不再精确计数
							pastBudget = true;
							const estTok = estimate(texts[j]!);
							tokensById.set(m.id, estTok);
							estimatedById.set(m.id, true);
							acc += estTok;
							dMap.set(m.id, acc);
						}
					}
				} else {
					for (const m of chunk) {
						const tok = estimate(opts.formatFn(m));
						tokensById.set(m.id, tok);
						estimatedById.set(m.id, true);
						acc += tok;
						dMap.set(m.id, acc);
					}
				}
			}
			return { dMap, tokensById, estimatedById, useExactD: true };
		}

		let acc = 0;
		for (const m of rowsNewestFirst) {
			const tok = estimate(opts.formatFn(m));
			tokensById.set(m.id, tok);
			estimatedById.set(m.id, true);
			acc += tok;
			dMap.set(m.id, acc);
		}
		return { dMap, tokensById, estimatedById, useExactD: false };
	}

	// ── 6. 窗口与区带 ──────────────────────────────────────

	/**
	 * 唯一区带判定 + 窗口边界。
	 * `windowBoundaryId`（最旧仍包含的消息）与 out 区带边界由同一 dMap + 同一 bandBudget 导出，
	 * 从而保证上下文分割线与消息分段区带结构性恒等。
	 * @param rowsNewestFirst 与 dMap 同序（自新向旧）
	 */
	@bindThis
	public computeWindowAndBands(
		rowsNewestFirst: { id: string }[],
		dMap: Map<string, number>,
		opts: { historyBudgetTokens: number; t1Ratio: number; t2Ratio: number },
	): WindowBands {
		// H<1 保护：与最新条对齐，避免「最新一条」也被判 out
		const dNewest = rowsNewestFirst.length > 0 ? (dMap.get(rowsNewestFirst[0]!.id) ?? 0) : 0;
		const bandBudget = opts.historyBudgetTokens >= 1
			? opts.historyBudgetTokens
			: Math.max(1, dNewest / opts.t1Ratio);
		const t1Band = opts.t1Ratio * bandBudget;
		const t2Band = opts.t2Ratio * bandBudget;

		const bandById = new Map<string, TokenBand>();
		let windowBoundaryId: string | null = null;
		let firstOutId: string | null = null;
		let truncated = false;
		for (let i = 0; i < rowsNewestFirst.length; i++) {
			const id = rowsNewestFirst[i]!.id;
			const d = dMap.get(id) ?? 0;
			let band: TokenBand = 'new';
			if (d > bandBudget) band = 'out';
			else if (d > t2Band) band = 'staged';
			else if (d > t1Band) band = 'prep';
			bandById.set(id, band);
			if (band === 'out') {
				truncated = true;
				if (firstOutId == null) {
					firstOutId = id;
					windowBoundaryId = i > 0 ? rowsNewestFirst[i - 1]!.id : null;
				}
			}
		}
		// 无 out：全部包含，最旧包含 = 末条
		if (!truncated && rowsNewestFirst.length > 0) {
			windowBoundaryId = rowsNewestFirst[rowsNewestFirst.length - 1]!.id;
		}
		return { bandById, windowBoundaryId, firstOutId, truncated, bandBudget, t1Band, t2Band };
	}

	// ── 工具方法（自 AgentCompressionMemoryService 迁入） ──

	/** 与滑窗一致：仅 user/assistant 计入 D */
	@bindThis
	public filterRowsForChatHistoryD<T extends { role: string }>(rows: T[]): T[] {
		return rows.filter(m => m.role === 'user' || m.role === 'assistant');
	}

	/** 自最新条向旧累加（字符口径，供侧车态等仍需字符 D 的内部路径委托） */
	@bindThis
	public dMapFromRowsNewestFirst(
		rows: { id: string; content: string }[],
		lengthFn?: (m: { id: string; content: string }) => number,
	): Map<string, number> {
		const d = new Map<string, number>();
		let acc = 0;
		for (const m of rows) {
			acc += lengthFn ? lengthFn(m) : m.content.length;
			d.set(m.id, acc);
		}
		return d;
	}

	// ── 私有：tokenizer 缓存 ───────────────────────────────

	private async countTokensGemini(text: string, modelName: string): Promise<number | null> {
		if (this.geminiFailedModels.has(modelName)) return null;
		try {
			const tokenizer = await this.getGeminiTokenizer(modelName);
			const result = await tokenizer.countTokens(text);
			return result.totalTokens;
		} catch (e) {
			this.geminiFailedModels.add(modelName);
			this.logger.warn(`Gemini tokenizer unavailable for model "${modelName}" (will fall back to char estimate for this session): ${e instanceof Error ? e.message : String(e)}`);
			return null;
		}
	}

	private async getGeminiTokenizer(modelName: string): Promise<{ countTokens: (text: string) => Promise<{ totalTokens: number }> }> {
		const cached = this.geminiTokenizerCache.get(modelName);
		if (cached) return cached;

		const existing = this.geminiInitPromises.get(modelName);
		if (existing) {
			await existing;
			return this.geminiTokenizerCache.get(modelName)!;
		}

		const initPromise = (async () => {
			const { LocalTokenizer } = await import('@google/genai/tokenizer/node');
			const tokenizer = new LocalTokenizer(modelName);
			// 预热：首次 countTokens 会下载词表，加超时避免永久挂起
			await Promise.race([
				tokenizer.countTokens('warmup'),
				new Promise((_, reject) => setTimeout(() => reject(new Error('tokenizer warmup timeout (30s)')), 30_000)),
			]);
			this.geminiTokenizerCache.set(modelName, tokenizer as unknown as { countTokens: (text: string) => Promise<{ totalTokens: number }> });
		})();
		this.geminiInitPromises.set(modelName, initPromise);
		try {
			await initPromise;
		} finally {
			this.geminiInitPromises.delete(modelName);
		}
		return this.geminiTokenizerCache.get(modelName)!;
	}

	private getTiktokenEncoding(name: string): Tiktoken {
		const cached = this.encodingCache.get(name);
		if (cached) return cached;
		const enc = getEncoding(name as TiktokenEncoding);
		this.encodingCache.set(name, enc);
		return enc;
	}
}
