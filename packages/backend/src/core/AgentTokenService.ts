/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Logger } from '@nestjs/common';
import { getEncoding, type Tiktoken, type TiktokenEncoding } from 'js-tiktoken';
import { bindThis } from '@/decorators.js';
import { getEffectiveLlmModels } from '@/misc/agent-llm-models.js';
import { loadCustomTiktokenTokenizer, resolveTokenizerDirs, GLM_DEFAULT_PAT_STR, type CustomTokenizerFamily } from '@/misc/agent-custom-tokenizers.js';
import type { MiMeta } from '@/models/Meta.js';
import { AgentUserModelService, isAgentUserModelId } from '@/core/AgentUserModelService.js';

// ─────────────────────────────────────────────────────────────
// 常量（单一出处；其它模块从此 re-export）
// ─────────────────────────────────────────────────────────────

/** 仅供旧实现与窗外展示估算使用；不得进入上下文预算或窗口成员判定。 */
export const AGENT_LLM_APPROX_CHARS_PER_TOKEN = 3;

/**
 * 压缩总览与上下文窗口端点的消息扫描上限。
 * 50_000 条 × 平均 100 chars ≈ 5M chars ≈ 1.67M tokens，
 * 远超当前最大模型上下文窗口（500K tokens = 1.5M chars）。
 */
export const AGENT_OVERVIEW_SCAN_LIMIT = 50_000;

/** 发信路径（send/peek/afterAssistant）的消息扫描窗口；reconcileStickyStates 的"端点缺失即 active"启发式以此为准 */
export const AGENT_SEND_PATH_SCAN_LIMIT = 500;

/**
 * 全站统一的上下文计数分词器。
 * 预算、滑窗、区带与压缩判定一律按此编码计数，不随模型切换，避免同一会话的上下文窗口漂移。
 * o200k_base 对中文约 0.9 token/字，介于国产模型（≈0.65）与 cl100k/Claude（≈1.3）之间；
 * 按量计费仍以接口返回的 usage 为准，与此无关。
 * 每模型编码（tokenizerEncoding）与 GLM/DeepSeek/Gemini 真分词器实现保留，当前不参与解析。
 */
export const AGENT_UNIFIED_TOKENIZER_ENCODING = 'o200k_base';

/** 每条聊天消息的本地封装预留；是应用预算规则，不用于供应商计费。 */
export const AGENT_MESSAGE_ENVELOPE_TOKENS = 4;

/** 精确计数连续占用事件循环的上限（毫秒），超过即让出 */
const EXACT_COUNT_SLICE_MS = 8;
/** 短文本计数本身很快，缓存只收较长文本 */
const UNIFIED_COUNT_CACHE_MIN_CHARS = 64;
/** 约 2 万条消息；按平均 300 字计约占 10 MB */
const UNIFIED_COUNT_CACHE_MAX_ENTRIES = 20_000;

/** Gemini tokenizer 前缀标识 */
export const GEMINI_ENCODING_PREFIX = 'gemini:';

/** GLM 系列（智谱 ChatGLM / GLM）前缀标识 */
export const GLM_ENCODING_PREFIX = 'glm:';
/** DeepSeek 系列前缀标识 */
export const DEEPSEEK_ENCODING_PREFIX = 'deepseek:';
/** Claude 系列（Anthropic）前缀标识 */
export const CLAUDE_ENCODING_PREFIX = 'claude:';

/**
 * 兼容近似编码注册表（回退用）：原生分词器不可用时，改用词表分布最接近的 cl100k_base 做 BPE 近似计数。
 *
 * - GLM / DeepSeek：优先走真分词器（见 {@link REAL_TOKENIZER_FAMILIES}）；词表缺失时降级到本表 cl100k 近似；
 * - Claude（Anthropic 专有、词表未公开）：无真分词器，恒走 cl100k 近似。
 * approx 模式计数结果展示层标注 ≈（区别于真精确的 exact）。cl100k_base 对中文略偏保守
 * （计数偏高），用于预算口径时偏安全（宁可少填历史、预留余量）。
 * 前缀后的型号名仅作管理端标识用途，近似计数只依据前缀映射。
 */
const APPROX_FAMILY_ENCODINGS: readonly { prefix: string; tiktoken: TiktokenEncoding }[] = [
	{ prefix: GLM_ENCODING_PREFIX, tiktoken: 'cl100k_base' },
	{ prefix: DEEPSEEK_ENCODING_PREFIX, tiktoken: 'cl100k_base' },
	{ prefix: CLAUDE_ENCODING_PREFIX, tiktoken: 'cl100k_base' },
];

/**
 * 支持「真本地分词器」的模型系列（js-tiktoken 加载自定义 BPE 词表，精确计数）。
 * 词表文件在镜像构建期预置（见 Dockerfile）或放入 data/tokenizers；缺失时计数自动
 * 降级到 {@link APPROX_FAMILY_ENCODINGS} 的兼容近似（模式由 exact 降为 approx）。
 * fallbackPatStr 仅在侧车配置未提供 pat_str 时生效（GLM 本身即 cl100k 正则；DeepSeek 由其 .json 提供）。
 */
const REAL_TOKENIZER_FAMILIES: readonly { prefix: string; family: CustomTokenizerFamily; fallbackPatStr: string }[] = [
	{ prefix: GLM_ENCODING_PREFIX, family: 'glm', fallbackPatStr: GLM_DEFAULT_PAT_STR },
	{ prefix: DEEPSEEK_ENCODING_PREFIX, family: 'deepseek', fallbackPatStr: GLM_DEFAULT_PAT_STR },
];

// ─────────────────────────────────────────────────────────────
// 共享类型
// ─────────────────────────────────────────────────────────────

/**
 * token 计数模式：
 * - exact：本地真分词器（js-tiktoken 内置编码 / Gemini LocalTokenizer / GLM・DeepSeek 自定义词表）；
 * - approx：模型系列无可用真分词器，用兼容 tiktoken 编码近似计数（展示 ≈）；
 * - estimate：纯字符估算（chars ÷ charsPerToken）。
 */
export type TokenMode = 'exact' | 'approx' | 'estimate';

/** 上下文区带：窗内·新 / 排队较前 / 排队较后 / 窗户外 */
export type TokenBand = 'new' | 'prep' | 'staged' | 'out';

/** 精确 token 计数器（同步或异步）；返回 null 表示该条回退估算 */
export type TokenCounter = (text: string) => Promise<number | null> | number | null;

export interface TokenConfig {
	encoding: string;
	tokenMode: TokenMode;
}

export interface HistoryBudget {
	maxContextTokens: number;
	maxOutputTokensPerCall: number;
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
	/** 第一条由精确计数确认超窗的行下标；其后的更旧消息一律排除 */
	exactFirstOutIndex: number | null;
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
 * 1. 计数层：estimateTokens（O(1) 估算）/ countTokensExact（tiktoken / Gemini LocalTokenizer / GLM・DeepSeek・Claude 兼容近似）
 * 2. 配置解析：resolveTokenConfig（统一模型编码解析）
 * 3. 计数器工厂：makeCounter
 * 4. 预算求解：resolveHistoryBudgets（纯 Token 视图）
 * 5. 权重计算：computeMessageWeights（D 累计，时间片让出 + 超预算提前终止）
 * 6. 窗口与区带：computeWindowAndBands（唯一区带判定 + 窗口边界）
 */
@Injectable()
export class AgentTokenService {
	private readonly logger = new Logger(AgentTokenService.name);
	private encodingCache = new Map<string, Tiktoken>();
	/**
	 * 统一分词器计数缓存（文本 → token 数）。消息内容一经发出基本不变，发信、压缩、总览轮询会反复统计同一批历史；
	 * 只缓存较长文本以控制内存，按插入顺序淘汰最旧项。
	 */
	private unifiedCountCache = new Map<string, number>();
	/** 自定义真分词器记忆化：undefined=尚未解析；null=词表缺失/失败（回退 approx）；Tiktoken=已加载 */
	private customTokenizerCache = new Map<CustomTokenizerFamily, Tiktoken | null>();
	private geminiTokenizerCache = new Map<string, { countTokens: (text: string) => Promise<{ totalTokens: number }> }>();
	private geminiInitPromises = new Map<string, Promise<void>>();
	/** 初始化失败的模型（如不受支持的型号），避免逐条重试与日志洪泛 */
	private geminiFailedModels = new Set<string>();

	constructor(
		private agentUserModelService?: AgentUserModelService,
	) {}

	// ── 1. 计数层 ──────────────────────────────────────────

	/**
	 * 展示用启发式估算；不得进入上下文预算、窗口成员或便签状态判定。
	 */
	@bindThis
	public estimateTokens(chars: number, charsPerToken: number = AGENT_LLM_APPROX_CHARS_PER_TOKEN): number {
		if (!Number.isFinite(chars) || chars <= 0) return 0;
		const ratio = Number.isFinite(charsPerToken) && charsPerToken >= 1 ? charsPerToken : AGENT_LLM_APPROX_CHARS_PER_TOKEN;
		return Math.max(0, Math.round(chars / ratio));
	}

	/**
	 * 精确 token 计数。
	 * @param encoding tiktoken 编码名（如 "cl100k_base"）、Gemini 模型（如 "gemini:gemini-2.0-flash-001"），
	 *                 或 GLM/DeepSeek/Claude 前缀（如 "glm:glm-4-plus"：GLM/DeepSeek 词表存在时真精确，
	 *                 否则与 Claude 一道按 cl100k_base 近似）
	 * @returns token 数，或 null（编码不可用时回退估算）
	 */
	@bindThis
	public async countTokensExact(text: string, encoding?: string | null): Promise<number | null> {
		if (!encoding) return null;
		if (encoding === AGENT_UNIFIED_TOKENIZER_ENCODING) return this.countUnifiedTokens(text);
		if (encoding.startsWith(GEMINI_ENCODING_PREFIX)) {
			return this.countTokensGemini(text, encoding.slice(GEMINI_ENCODING_PREFIX.length));
		}
		const real = this.resolveRealTokenizer(encoding);
		if (real) {
			try {
				// 允许全部特殊 token、不禁任何特殊 token，避免消息正文偶含特殊串时抛错
				return real.encode(text, 'all', []).length;
			} catch {
				// 真分词器偶发异常：降级到下方兼容近似，而非直接 null
			}
		}
		const approxTiktoken = this.resolveApproxTiktoken(encoding);
		if (approxTiktoken) {
			try {
				return this.getTiktokenEncoding(approxTiktoken).encode(text).length;
			} catch {
				return null;
			}
		}
		try {
			const enc = this.getTiktokenEncoding(encoding);
			return enc.encode(text).length;
		} catch {
			return null;
		}
	}

	/**
	 * 未知记忆文本的固定预留槽，不是对实际内容的 Token 估算。
	 * 容量按站点字符配置等额分配；实际注入必须再经 o200k 上限裁剪，预算不会随检索结果变化。
	 */
	@bindThis
	public resolveReservedTokenLimit(maxChars: number): number {
		if (!Number.isFinite(maxChars) || maxChars <= 0) return 0;
		return Math.ceil(maxChars);
	}

	/** 按 o200k 上限裁剪文本；切割不破坏 UTF-16 代理对或 XML 实体。 */
	@bindThis
	public truncateTextToTokenLimit(text: string, maxTokens: number, keep: 'start' | 'end' = 'start'): string {
		const cap = Math.max(0, Math.trunc(maxTokens));
		if (text.length === 0 || this.countUnifiedTokens(text) <= cap) return text;
		if (cap === 0) return '';
		if (keep === 'start') {
			let low = 0;
			let high = text.length;
			while (low < high) {
				const mid = Math.ceil((low + high) / 2);
				if (this.countUnifiedTokens(text.slice(0, mid)) <= cap) low = mid;
				else high = mid - 1;
			}
			let end = low;
			const code = text.charCodeAt(end - 1);
			if (code >= 0xD800 && code <= 0xDBFF) end--;
			return text.slice(0, end);
		}
		let low = 0;
		let high = text.length;
		while (low < high) {
			const mid = Math.floor((low + high) / 2);
			if (this.countUnifiedTokens(text.slice(mid)) <= cap) high = mid;
			else low = mid + 1;
		}
		let start = low;
		const code = text.charCodeAt(start);
		if (code >= 0xDC00 && code <= 0xDFFF) start++;
		const before = text.slice(Math.max(0, start - 6), start);
		const amp = before.lastIndexOf('&');
		if (amp !== -1 && before.indexOf(';', amp) === -1) {
			const semi = text.indexOf(';', start);
			if (semi !== -1 && semi - start <= 6) start = semi + 1;
		}
		return text.slice(start);
	}

	/** 判断编码是否可用（tiktoken 内置、gemini: 前缀，以及 glm:/deepseek:/claude: 兼容近似前缀）。 */
	@bindThis
	public isEncodingAvailable(encoding?: string | null): boolean {
		if (!encoding) return false;
		if (encoding.startsWith(GEMINI_ENCODING_PREFIX)) {
			return encoding.length > GEMINI_ENCODING_PREFIX.length;
		}
		if (this.resolveApproxTiktoken(encoding)) return true;
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

	/** 官方模型与 BYOK 均使用同一计数配置；模型上下文和输出长度仍是独立配置。 */
	@bindThis
	public resolveTokenConfig(instanceMeta: MiMeta, modelId: string | null): TokenConfig {
		return this.unifiedTokenConfig();
	}

	@bindThis
	public async resolveTokenConfigForUser(instanceMeta: MiMeta, modelId: string | null, userId: string): Promise<TokenConfig> {
		return this.unifiedTokenConfig();
	}

	private unifiedTokenConfig(): TokenConfig {
		const encoding = AGENT_UNIFIED_TOKENIZER_ENCODING;
		return { encoding, tokenMode: this.resolveTokenMode(encoding) };
	}

	// ── 3. 计数器工厂 ──────────────────────────────────────

	/** 统一模式下始终提供 o200k 计数器，不再回退到每模型字符估算。 */
	@bindThis
	public makeCounter(config: TokenConfig): TokenCounter {
		const encoding = config.encoding;
		return (text: string) => this.countTokensExact(text, encoding);
	}

	// ── 4. 预算求解 ────────────────────────────────────────

	/**
	 * 历史预算只有 Token 一个视图。overheadTokens 由已知文本的 o200k 计数与固定记忆预留组成；
	 * 回复预留是尚未生成内容的长度上限，直接采用模型的 maxOutputTokensPerCall 配置。
	 */
	@bindThis
	public resolveHistoryBudgets(params: {
		maxContextTokens: number;
		maxOutputTokensPerCall: number;
		overheadTokens: number;
	}): HistoryBudget {
		const overhead = Number.isFinite(params.overheadTokens) ? Math.max(0, params.overheadTokens) : 0;
		return {
			maxContextTokens: params.maxContextTokens,
			maxOutputTokensPerCall: params.maxOutputTokensPerCall,
			historyBudgetTokens: Math.max(0, params.maxContextTokens - overhead - Math.max(0, params.maxOutputTokensPerCall)),
			tokenMode: 'exact',
		};
	}

	// ── 5. 权重计算（D 累计，单位恒为 token） ───────────────

	/**
	 * 自最新条向旧累加 token 深度 D。
	 * - 提供 counter 时：逐条精确计数并按时间片让出事件循环；**按条**判断窗口边界——某条累计将超出 budgetForExact（即滑出窗口）时，
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
			budgetForExact?: number;
			perMessageTokens?: number;
		},
	): Promise<MessageWeights> {
		const dMap = new Map<string, number>();
		const tokensById = new Map<string, number>();
		const estimatedById = new Map<string, boolean>();
		const estimate = (text: string): number => this.estimateTokens(text.length);

		if (opts.counter) {
			const counter = opts.counter;
			const budget = opts.budgetForExact ?? Number.POSITIVE_INFINITY;
			const envelopeTokens = Math.max(0, opts.perMessageTokens ?? 0);
			let acc = 0;
			let pastBudget = false;
			let exactFirstOutIndex: number | null = null;
			// 本地分词是同步 CPU 计算：累计占用超过一个时间片就让出事件循环，长会话首次计数时不阻塞其他请求
			let sliceStart = performance.now();
			for (const [index, m] of rowsNewestFirst.entries()) {
				const text = opts.formatFn(m);
				if (!pastBudget) {
					if (performance.now() - sliceStart > EXACT_COUNT_SLICE_MS) {
						await new Promise<void>(resolve => setImmediate(resolve));
						sliceStart = performance.now();
					}
					const exact = await counter(text);
					if (exact == null) {
						// 计数器失败不能靠估算重新决定窗口成员；保守地停止扩展历史
						pastBudget = true;
						exactFirstOutIndex = index;
					} else if (acc + exact + envelopeTokens <= budget) {
						tokensById.set(m.id, exact + envelopeTokens);
						estimatedById.set(m.id, false);
						acc += exact + envelopeTokens;
						dMap.set(m.id, acc);
						continue;
					} else {
						pastBudget = true;
						exactFirstOutIndex = index;
					}
				}
				const estTok = estimate(text) + envelopeTokens;
				tokensById.set(m.id, estTok);
				estimatedById.set(m.id, true);
				acc += estTok;
				// 展示可估算，但窗外深度不得低于预算，避免便签状态被估算重新判回窗内
				dMap.set(m.id, Number.isFinite(budget) ? Math.max(acc, budget + 1) : acc);
			}
			return { dMap, tokensById, estimatedById, useExactD: true, exactFirstOutIndex };
		}

		let acc = 0;
		for (const m of rowsNewestFirst) {
			const tok = estimate(opts.formatFn(m));
			tokensById.set(m.id, tok);
			estimatedById.set(m.id, true);
			acc += tok;
			dMap.set(m.id, acc);
		}
		return { dMap, tokensById, estimatedById, useExactD: false, exactFirstOutIndex: null };
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
		opts: { historyBudgetTokens: number; t1Ratio: number; t2Ratio: number; exactFirstOutIndex?: number | null },
	): WindowBands {
		const bandBudget = Math.max(0, opts.historyBudgetTokens);
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
			// 精确边界一经确认，估算的 D 只能用于展示，不能改变窗口成员资格
			if (opts.exactFirstOutIndex != null && i >= opts.exactFirstOutIndex) band = 'out';
			else if (d > bandBudget) band = 'out';
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

	/** 解析 approx 系列前缀对应的兼容 tiktoken 编码；非 approx 前缀或型号名为空时返回 null */
	private resolveApproxTiktoken(encoding: string): TiktokenEncoding | null {
		for (const family of APPROX_FAMILY_ENCODINGS) {
			if (encoding.startsWith(family.prefix) && encoding.length > family.prefix.length) {
				return family.tiktoken;
			}
		}
		return null;
	}

	/** 匹配真分词器系列前缀；不匹配或型号名为空时返回 null */
	private matchRealFamily(encoding: string): { family: CustomTokenizerFamily; fallbackPatStr: string } | null {
		for (const entry of REAL_TOKENIZER_FAMILIES) {
			if (encoding.startsWith(entry.prefix) && encoding.length > entry.prefix.length) {
				return { family: entry.family, fallbackPatStr: entry.fallbackPatStr };
			}
		}
		return null;
	}

	/** 解析编码对应的真分词器（加载自定义词表）；不匹配或词表缺失时返回 null（调用方回退兼容近似） */
	private resolveRealTokenizer(encoding: string): Tiktoken | null {
		const matched = this.matchRealFamily(encoding);
		if (!matched) return null;
		return this.getCustomTokenizer(matched.family, matched.fallbackPatStr);
	}

	/** 懒加载并记忆化某系列真分词器（同步读词表文件）；词表缺失返回 null */
	private getCustomTokenizer(family: CustomTokenizerFamily, fallbackPatStr: string): Tiktoken | null {
		const cached = this.customTokenizerCache.get(family);
		if (cached !== undefined) return cached;
		const loaded = loadCustomTiktokenTokenizer(family, fallbackPatStr);
		if (loaded) {
			this.customTokenizerCache.set(family, loaded.tokenizer);
			this.logger.log(`Custom tokenizer for "${family}" loaded from ${loaded.sourcePath}`);
			return loaded.tokenizer;
		}
		this.customTokenizerCache.set(family, null);
		this.logger.warn(`Custom tokenizer vocab for "${family}" not found (searched: ${resolveTokenizerDirs().join(', ')}); falling back to cl100k_base approximation`);
		return null;
	}

	/** 由编码解析计数模式：exact（本地真分词器）/ approx（兼容编码近似）/ estimate（字符估算） */
	private resolveTokenMode(encoding?: string): TokenMode {
		if (!encoding) return 'estimate';
		if (encoding.startsWith(GEMINI_ENCODING_PREFIX)) {
			return encoding.length > GEMINI_ENCODING_PREFIX.length ? 'exact' : 'estimate';
		}
		const realFamily = this.matchRealFamily(encoding);
		if (realFamily) {
			// GLM/DeepSeek：词表已预置 → 真精确；缺失 → 降级 cl100k 近似
			return this.getCustomTokenizer(realFamily.family, realFamily.fallbackPatStr) ? 'exact' : 'approx';
		}
		if (this.resolveApproxTiktoken(encoding)) return 'approx';
		try {
			this.getTiktokenEncoding(encoding);
			return 'exact';
		} catch {
			return 'estimate';
		}
	}

	private async countTokensGemini(text: string, modelName: string): Promise<number | null> {
		// 空文本直接返回 0：@google/genai 的 LocalTokenizer 会对空 text part 向 stderr 打
		// "Content contains unsupported types for token counting" 警告（生产日志噪音）
		if (text.length === 0) return 0;
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

	public countUnifiedTokens(text: string): number {
		if (text.length === 0) return 0;
		const cached = this.unifiedCountCache.get(text);
		if (cached != null) return cached;
		// 消息正文可能偶含 <|endoftext|> 等特殊串：按普通文本计数，不抛错回退估算
		const count = this.getTiktokenEncoding(AGENT_UNIFIED_TOKENIZER_ENCODING).encode(text, [], []).length;
		if (text.length >= UNIFIED_COUNT_CACHE_MIN_CHARS) {
			if (this.unifiedCountCache.size >= UNIFIED_COUNT_CACHE_MAX_ENTRIES) {
				const oldest = this.unifiedCountCache.keys().next().value;
				if (oldest != null) this.unifiedCountCache.delete(oldest);
			}
			this.unifiedCountCache.set(text, count);
		}
		return count;
	}

	private getTiktokenEncoding(name: string): Tiktoken {
		const cached = this.encodingCache.get(name);
		if (cached) return cached;
		const enc = getEncoding(name as TiktokenEncoding);
		this.encodingCache.set(name, enc);
		return enc;
	}
}
