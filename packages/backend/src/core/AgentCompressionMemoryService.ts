/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { In } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type {
	AgentMessagesRepository,
	AgentSessionCompressionStickyRepository,
	UserProfilesRepository,
} from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';
import { MiAgentSession } from '@/models/AgentSession.js';
import type { MiAgentDialogueStyle } from '@/models/AgentDialogueStyle.js';
import type { MiAgentCharacter } from '@/models/AgentCharacter.js';
import { MiAgentSessionCompressionSticky, type AgentCompressionStickyState } from '@/models/AgentSessionCompressionSticky.js';
import { MiMeta } from '@/models/Meta.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService, escapeAgentXmlText, AGENT_LLM_MEMORY_XML_OPEN, AGENT_LLM_MEMORY_XML_CLOSE } from '@/core/AgentService.js';
import { AgentTokenService, AGENT_LLM_APPROX_CHARS_PER_TOKEN, AGENT_OVERVIEW_SCAN_LIMIT, AGENT_SEND_PATH_SCAN_LIMIT, type TokenBand } from '@/core/AgentTokenService.js';
import { agentPreviewText } from '@/core/agent-preview-text.js';
import { AgentDashscopeMemoryService } from '@/core/AgentDashscopeMemoryService.js';
import { bindThis } from '@/decorators.js';

export { AGENT_OVERVIEW_SCAN_LIMIT, AGENT_SEND_PATH_SCAN_LIMIT };

export const AGENT_COMPRESSION_MEMORY_XML_OPEN = '<compression_memory>\n';
export const AGENT_COMPRESSION_MEMORY_XML_CLOSE = '\n</compression_memory>';

export const agentLongMemoryProviderIds = ['none', 'aliyun', 'compression'] as const;
export type AgentLongMemoryProviderId = typeof agentLongMemoryProviderIds[number];

/** 与 Meta 中未配置时一致；可经管理端覆盖 */
export const DEFAULT_AGENT_COMPRESSION_SYSTEM_PROMPT =
	'将用户给出的对话节录压缩为一条简洁的中文要点，保留人名、数字/决定；不要复述全文；不要加开场白。输出纯文本一段。';

/** 与 `AgentService.loadRecentMessagesForContextWithMeta` 相同：仅 user/assistant 计入滑窗 D */
function filterRowsForChatHistoryD<T extends { role: string }>(rows: T[]): T[] {
	return rows.filter(m => m.role === 'user' || m.role === 'assistant');
}

export type MessageWithD = {
	id: string;
	role: string;
	content: string;
	createdAt: string;
	/** 自最新条起向旧累加，Token 约数（与 `approxLlmTokensFromCharEstimate` 一致） */
	dFromNewTokens: number;
	band: 'new' | 'prep' | 'staged' | 'out';
};

/** 侧车 token 口径 D 累计与阈值（peek/afterAssistant 共用，避免同批发信内重复精确分词） */
export type CompressionSidecarTokenD = {
	dMap: Map<string, number>;
	hSend: number;
	t1: number;
	t2: number;
};

/** 侧车/总览扫描的消息行投影（与 send 主路径 select 字段一致） */
export type CompressionScanRow = {
	id: string;
	role: string;
	content: string;
	createdAt: Date;
	imageFileId?: string | null;
	imageRecognitionStatus?: string | null;
	imageRecognitionDescription?: string | null;
	proactiveScheduleControlRaw?: string | null;
	proactiveScheduleControlError?: unknown;
	timeTrusted?: boolean;
};

@Injectable()
export class AgentCompressionMemoryService {
	constructor(
		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,
		@Inject(DI.agentSessionCompressionStickyRepository)
		private stickyRepository: AgentSessionCompressionStickyRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private agentService: AgentService,
		private agentDashscopeMemoryService: AgentDashscopeMemoryService,
		private agentModelUsageService: AgentModelUsageService,
		private agentTokenService: AgentTokenService,
	) {
	}

	/**
	 * 压缩便签：本会话列优先（创建会话时写入当时的默认）；空则 meta 压缩默认 → 全站对话默认）	 */
	@bindThis
	public resolveEffectiveCompressionModelId(
		session: MiAgentSession,
		instanceMeta: MiMeta,
	): string | null {
		const o = session.agentCompressionModelId?.trim();
		if (o) return o;
		const d = instanceMeta.agentCompressionDefaultModelId?.trim();
		if (d) return d;
		return instanceMeta.agentDefaultModelId?.trim() ?? null;
	}

	@bindThis
	public resolveEffectiveProvider(
		providerColumn: string | null | undefined,
		meta: MiMeta,
	): AgentLongMemoryProviderId {
		const raw = (providerColumn ?? 'none').trim() || 'none';
		if (raw === 'none') return 'none';
		if (raw === 'compression') return 'compression';
		if (raw === 'aliyun') {
			const cfg = (meta as { agentLongMemoryConfigured?: boolean }).agentLongMemoryConfigured;
			if (this.agentDashscopeMemoryService.isRunnable(meta) && cfg) return 'aliyun';
			return 'none';
		}
		return 'none';
	}

	@bindThis
	public isAliyunPathActive(
		provider: AgentLongMemoryProviderId,
		session: Pick<MiAgentSession, 'agentLongMemoryEnabled'>,
		instanceMeta: MiMeta,
	): boolean {
		if (provider !== 'aliyun') return false;
		if (session.agentLongMemoryEnabled === false) return false;
		return this.agentDashscopeMemoryService.isRunnable(instanceMeta)
			&& (instanceMeta as { agentLongMemoryConfigured?: boolean }).agentLongMemoryConfigured === true;
	}

	/**
	 * 与 `buildSendPathBudgets`、`buildContextDividerAlignedBudgets` 共用：仅在实际走阿里云语义记忆时预留 `<memory>` 上限，否则 0）	 */
	@bindThis
	public computeAliyunMemoryXmlReserveIfActive(
		provider: AgentLongMemoryProviderId,
		session: MiAgentSession,
		instanceMeta: MiMeta,
	): number {
		if (!this.isAliyunPathActive(provider, session, instanceMeta)) return 0;
		const maxMem = Math.max(200, Math.min(50_000, session.agentLongMemoryInjectMaxChars || instanceMeta.agentMem0InjectMaxChars));
		return AGENT_LLM_MEMORY_XML_OPEN.length + maxMem + AGENT_LLM_MEMORY_XML_CLOSE.length;
	}

	@bindThis
	public computeCompressionReserveChars(maxInject: number): number {
		const n = Math.max(200, Math.min(50_000, maxInject));
		return AGENT_COMPRESSION_MEMORY_XML_OPEN.length + n + AGENT_COMPRESSION_MEMORY_XML_CLOSE.length;
	}

	/**
	 * 与 `agents/messages/send` 一致，用于**真实进 LLM** 的 history 上界、`reconcileStickyStates`（区间两端 D 取大者与 H 比较）、压缩总览区带（provider 为 compression 时）。	 * 字符池：`max(4000, maxContextTokens×3)` 减 `systemChars`（含 comp 全段、百科 / `memory` 等）与当期 `maxOut×3` 预留。Token 约数同 `AgentService.approxLlmTokensFromCharEstimate`（即，四舍五入）。	 */
	@bindThis
	public buildSendPathBudgets(params: {
		instanceMeta: MiMeta;
		session: MiAgentSession;
		character: ReturnType<AgentService['effectiveCharacterForLlm']>;
		style: ReturnType<AgentService['effectiveStyleForLlm']>;
		provider: AgentLongMemoryProviderId;
	}): {
		historyBudget: number;
		maxContextTokens: number;
		maxOutputTokensPerCall: number;
		memReserveChars: number;
		compReserveChars: number;
		charsPerToken: number;
		/** 精确编码器下的历史 token 预算（无编码器时与 historyBudget/charsPerToken 一致） */
		historyBudgetTokens: number;
	} {
		const { instanceMeta, session, character, style, provider } = params;
		const { maxContextTokens, maxOutputTokensPerCall } = this.agentService.resolveModelConnection(
			instanceMeta,
			session.agentModelId ?? null,
		);
		const tokenConfig = this.agentTokenService.resolveTokenConfig(instanceMeta, session.agentModelId ?? null);
		const charsPerToken = tokenConfig.charsPerToken;
		const systemBase = this.agentService.buildSystemPrompt({
			globalPrompt: instanceMeta.agentGlobalSystemPrompt,
			character,
			style,
			timeAwarenessEnabled: session.timeAwarenessEnabled === true,
		});
		const memReserve = this.computeAliyunMemoryXmlReserveIfActive(provider, session, instanceMeta);
		const maxComp = Math.max(200, Math.min(50_000, session.agentLongMemoryInjectMaxChars));
		const compReserve = provider === 'compression' ? this.computeCompressionReserveChars(maxComp) : 0;
		const systemChars = systemBase.length + memReserve + compReserve;
		// 与 `send.ts` 注入到最末 user 的 directive 同步预扣，避免历史填到上限后叠加 directive 溢出上下文窗口		// 世界书已从 system 移除、改由 directive 的 <active-worldbook> 交付，这里按「全部已启用条目」保守预扣（上界），
		// 与世界书曾整段写入 system 时的预留量一致，避免上下文溢出回归。
		const budgetWorldbook = this.agentService.buildBudgetWorldbookEntries(character);
		const directiveChars = this.agentService.buildLatestUserDirectiveBlock(style, budgetWorldbook).length
			+ (session.timeAwarenessEnabled === true ? this.agentService.buildCurrentBeijingTimeBlock().length + 1 : 0);
		// 预算数学统一委托 AgentTokenService：字符 / token 双视图由同一 overhead 一致导出
		const budget = this.agentTokenService.resolveHistoryBudgets({
			maxContextTokens,
			maxOutputTokensPerCall,
			charsPerToken,
			systemChars,
			directiveChars,
			prefixChars: 0,
			tokenMode: tokenConfig.tokenMode,
		});
		return { historyBudget: budget.historyBudgetChars, maxContextTokens, maxOutputTokensPerCall, memReserveChars: memReserve, compReserveChars: compReserve, charsPerToken, historyBudgetTokens: budget.historyBudgetTokens };
	}

	/** 未配置 meta 时区间 T1、T2 相对 H 的比例；可通过 `resolveCompressionBandRatios` 覆盖。*/
	public static readonly DEFAULT_COMPRESSION_BAND_T1_RATIO = 0.8;
	public static readonly DEFAULT_COMPRESSION_BAND_T2_RATIO = 0.9;

	/**
	 * 从 Meta 读压缩区间 t1/t2 比例，非法或缺失时回退默认，并保证 0 &lt; t1 &lt; t2 &lt; 1。	 */
	@bindThis
	public resolveCompressionBandRatios(instanceMeta: MiMeta): { t1Ratio: number; t2Ratio: number } {
		const raw1 = instanceMeta.agentCompressionBandT1Ratio;
		const raw2 = instanceMeta.agentCompressionBandT2Ratio;
		let t1 = typeof raw1 === 'number' && Number.isFinite(raw1) ? raw1 : AgentCompressionMemoryService.DEFAULT_COMPRESSION_BAND_T1_RATIO;
		let t2 = typeof raw2 === 'number' && Number.isFinite(raw2) ? raw2 : AgentCompressionMemoryService.DEFAULT_COMPRESSION_BAND_T2_RATIO;
		t1 = Math.max(0.01, Math.min(0.99, t1));
		t2 = Math.max(0.01, Math.min(0.99, t2));
		if (t1 >= t2) {
			t2 = Math.min(0.99, t1 + 0.01);
		}
		if (t1 >= t2) {
			t1 = Math.max(0.01, t2 - 0.01);
		}
		return { t1Ratio: t1, t2Ratio: t2 };
	}

	@bindThis
	public compareMessageOrder(
		x: { createdAt: Date; id: string },
		y: { createdAt: Date; id: string },
	): number {
		const dt = x.createdAt.getTime() - y.createdAt.getTime();
		if (dt !== 0) return dt;
		return x.id.localeCompare(y.id);
	}

	/** 时间序 a 在 [b,c] 内（含端点，b 不晚于 c）*/
	@bindThis
	public inChronoRange(
		a: { createdAt: Date; id: string },
		b: { createdAt: Date; id: string },
		c: { createdAt: Date; id: string },
	): boolean {
		if (this.compareMessageOrder(b, c) > 0) {
			return this.inChronoRange(a, c, b);
		}
		return this.compareMessageOrder(b, a) <= 0 && this.compareMessageOrder(a, c) <= 0;
	}

	@bindThis
	public messageInStickyRange(
		m: { createdAt: Date; id: string },
		sticky: Pick<MiAgentSessionCompressionSticky, 'fromMessageId' | 'toMessageId'>,
		boundaries: Map<string, { createdAt: Date; id: string }>,
	): boolean {
		const f = boundaries.get(sticky.fromMessageId);
		const t = boundaries.get(sticky.toMessageId);
		if (!f || !t) return false;
		if (this.compareMessageOrder(f, t) > 0) {
			return this.inChronoRange(m, t, f);
		}
		return this.inChronoRange(m, f, t);
	}

	@bindThis
	public async loadBoundaryMap(sessionId: string, ids: string[]): Promise<Map<string, { createdAt: Date; id: string }>> {
		const unique = [...new Set(ids.filter(x => x))];
		if (unique.length === 0) return new Map();
		const rows = await this.agentMessagesRepository.find({
			where: { sessionId, id: In(unique) },
			select: ['id', 'createdAt'],
		});
		const m = new Map<string, { createdAt: Date; id: string }>();
		for (const r of rows) {
			m.set(r.id, { createdAt: r.createdAt, id: r.id });
		}
		return m;
	}

	@bindThis
	public buildPairsExcludingActiveCompression(
		pickedOldestFirst: { id: string; role: string; content: string; createdAt: Date }[],
		activeStickies: MiAgentSessionCompressionSticky[],
		boundaries: Map<string, { createdAt: Date; id: string }>,
	): { role: 'user' | 'assistant'; content: string }[] {
		const pairs: { role: 'user' | 'assistant'; content: string }[] = [];
		// 预计算参与排除的便签时间区间（归一化 [lo,hi]），避免逐消息重复 boundaries.get 与 from/to 排序
		const intervals: { lo: { createdAt: Date; id: string }; hi: { createdAt: Date; id: string } }[] = [];
		for (const s of activeStickies) {
			if (s.state !== 'active') continue;
			// 与 buildCompressionSystemBlock 对称：压缩失败且未被用户修正的便签不排除消息
			if (s.errorMessage != null && !s.userOverridden) continue;
			const f = boundaries.get(s.fromMessageId);
			const t = boundaries.get(s.toMessageId);
			if (!f || !t) continue;
			if (this.compareMessageOrder(f, t) > 0) intervals.push({ lo: t, hi: f });
			else intervals.push({ lo: f, hi: t });
		}
		for (const m of pickedOldestFirst) {
			if (m.role !== 'user' && m.role !== 'assistant') continue;
			const mm = { createdAt: m.createdAt, id: m.id };
			let inside = false;
			for (const iv of intervals) {
				if (this.compareMessageOrder(iv.lo, mm) <= 0 && this.compareMessageOrder(mm, iv.hi) <= 0) {
					inside = true;
					break;
				}
			}
			if (!inside) {
				pairs.push({ role: m.role, content: m.content });
			}
		}
		return pairs;
	}

	@bindThis
	public buildCompressionSystemBlock(
		actives: MiAgentSessionCompressionSticky[],
		boundaries: Map<string, { createdAt: Date; id: string }>,
		maxInjectChars = 50_000,
	): string {
		const sorted = [...actives]
			.filter(s => s.state === 'active')
			// 跳过 LLM 压缩失败且用户未手动修正的便签，避免将原始截断文本当作摘要注入			.filter(s => s.userOverridden || s.errorMessage == null)
			.filter(s => boundaries.has(s.fromMessageId) && boundaries.has(s.toMessageId))
			.sort((a, b) => (a.sortIndex !== b.sortIndex
				? a.sortIndex - b.sortIndex
				: a.id.localeCompare(b.id)));
		const parts: string[] = [];
		let totalLen = 0;
		const cap = Math.max(200, Math.min(50_000, maxInjectChars));
		for (const s of sorted) {
			// 先转义再计量，确保实际注入长度不超出预留预算
			const escaped = escapeAgentXmlText(s.summaryText.trim());
			if (totalLen + escaped.length + 2 > cap) {
				const remaining = cap - totalLen - 2;
				if (remaining > 0) {
					// 回退到最后一个完整字符边界，避免切断 &amp; 等实体
					let cut = escaped.slice(0, remaining);
					const ampIdx = cut.lastIndexOf('&');
					if (ampIdx > remaining - 6) cut = cut.slice(0, ampIdx);
					parts.push(cut);
				}
				break;
			}
			parts.push(escaped);
			totalLen += escaped.length + 2; // +2 for '\n\n' separator
		}
		const body = parts.join('\n\n');
		if (body.length === 0) return '';
		return AGENT_COMPRESSION_MEMORY_XML_OPEN + body + AGENT_COMPRESSION_MEMORY_XML_CLOSE;
	}

	@bindThis
	public async listStickies(sessionId: string): Promise<MiAgentSessionCompressionSticky[]> {
		return this.stickyRepository.find({
			where: { sessionId },
			order: { sortIndex: 'ASC', id: 'ASC' },
		});
	}

	@bindThis
	public async countStickies(sessionId: string): Promise<number> {
		return this.stickyRepository.count({ where: { sessionId } });
	}

	/**
	 * peek 与 afterAssistant 共用的候选收集 + 去重前置逻辑（消除两处重复，从结构上避免判定漂移）。
	 * 返回 null 表示无需压缩（无未压 staged / 候选为空 / 已存在同区间 / 已有等价成功便签）；
	 * 否则返回候选区间与指纹，`existingByFp` 非 null 表示走重试路径。
	 * 顺带优化：无便签时跳过 boundary 查询（此时覆盖判定恒为 false）。
	 */
	@bindThis
	private async gatherCompressionCandidates(params: {
		sessionId: string;
		rows: CompressionScanRow[];
		dMap: Map<string, number>;
		hSend: number;
		t1: number;
		t2: number;
		timeAwarenessEnabled: boolean;
	}): Promise<null | {
		candidates: CompressionScanRow[];
		fromId: string;
		toId: string;
		textBlob: string;
		fingerprint: string;
		existingByFp: MiAgentSessionCompressionSticky | null;
	}> {
		const { sessionId, rows, dMap, hSend, t1, t2 } = params;
		const stickies = await this.listStickies(sessionId);
		const b = stickies.length === 0
			? new Map<string, { createdAt: Date; id: string }>()
			: await this.loadBoundaryMap(sessionId, stickies.flatMap(s => [s.fromMessageId, s.toMessageId]));
		const uncoveredT1H: CompressionScanRow[] = [];
		let hasUncoveredStaged = false;
		for (const m of rows) {
			if (m.role !== 'user' && m.role !== 'assistant') continue;
			const d = dMap.get(m.id) ?? 0;
			if (d <= t1 || d > hSend) continue;
			if (m.content.length === 0) continue;
			let covered = false;
			for (const s of stickies) {
				// stale 不参与；failed 便签未压缩成功，其区间消息视为「未覆盖」，
				// 从而下一次发信仍会命中未压 staged 消息、自动重试压缩（与 buildPairs 失败不排除原文的语义对称）
				if (s.state === 'stale' || s.state === 'failed') continue;
				if (this.messageInStickyRange({ id: m.id, createdAt: m.createdAt }, s, b)) {
					covered = true;
					break;
				}
			}
			if (covered) continue;
			uncoveredT1H.push(m);
			if (d > t2) hasUncoveredStaged = true;
		}
		if (!hasUncoveredStaged || uncoveredT1H.length === 0) return null;
		const candidates = uncoveredT1H;
		candidates.sort((a, c) => this.compareMessageOrder(a, c));
		const fromId = candidates[0]!.id;
		const toId = candidates[candidates.length - 1]!.id;
		const existingByRange = await this.stickyRepository.findOne({
			where: { sessionId, fromMessageId: fromId, toMessageId: toId },
		});
		// 同区间已有「非失败」便签才视为重复；失败便签不拦截，交由下方指纹路径重试
		if (existingByRange && existingByRange.state !== 'failed') return null;
		// 与发信滑窗一致：按 `formatMessageForLlmHistory` 携带时间戳、图片识别 XML、主动调度控制块等必要数据（不携带则模型压缩时丢失发送时间与图片描述语义）
		const formatFn = (m: CompressionScanRow): string => this.agentService.formatMessageForLlmHistory(
			m as Parameters<AgentService['formatMessageForLlmHistory']>[0],
			{ timeAwarenessEnabled: params.timeAwarenessEnabled },
		);
		const textBlob = candidates.map(m => `${m.role}: ${formatFn(m)}`).join('\n\n');
		const fingerprint = createHash('sha256').update(textBlob, 'utf8').digest('hex');
		const existingByFp = await this.stickyRepository.findOne({ where: { sessionId, sourceFingerprint: fingerprint } });
		// 已有等价便签（成功/用户已修正）→ 视为已覆盖，无需再压；
		// 失败便签不设重试上限——每轮发信持续重试直至成功，避免压缩永久失败导致旧消息丢失上下文
		if (existingByFp && (existingByFp.errorMessage == null || existingByFp.userOverridden)) return null;
		return { candidates, fromId, toId, textBlob, fingerprint, existingByFp };
	}

	/**
	 * 与 `afterAssistantForCompression` 共用 `gatherCompressionCandidates` 前置判定（须已有未压内容进入 (t2,hSend]）；为真时才向客户端展示「压缩进行中」。	 */
	@bindThis
	public async peekWillInvokeCompressionLlm(
		session: MiAgentSession,
		character: ReturnType<AgentService['effectiveCharacterForLlm']>,
		style: ReturnType<AgentService['effectiveStyleForLlm']>,
		instanceMeta: MiMeta,
		userId: string,
		preloadedRows?: CompressionScanRow[],
		precomputedSidecar?: CompressionSidecarTokenD,
	): Promise<boolean> {
		if (this.resolveEffectiveProvider(session.agentLongMemoryProvider, instanceMeta) !== 'compression') return false;

		const rows = preloadedRows ?? await this.agentMessagesRepository.find({
			where: { sessionId: session.id },
			order: { createdAt: 'DESC', id: 'DESC' },
			take: AGENT_SEND_PATH_SCAN_LIMIT,
			select: ['id', 'role', 'content', 'createdAt', 'imageFileId', 'imageRecognitionStatus', 'imageRecognitionDescription', 'proactiveScheduleControlRaw', 'proactiveScheduleControlError', 'timeTrusted'],
		});
		const { dMap, hSend, t1, t2 } = precomputedSidecar ?? await this.computeSidecarTokenD({ session, character, style, instanceMeta, rows });
		const gathered = await this.gatherCompressionCandidates({ sessionId: session.id, rows, dMap, hSend, t1, t2, timeAwarenessEnabled: session.timeAwarenessEnabled === true });
		if (!gathered) return false;
		const compModelId = this.resolveEffectiveCompressionModelId(session, instanceMeta);
		try {
			this.agentService.resolveModelApiName(instanceMeta, compModelId);
		} catch {
			return false;
		}
		if (!await this.agentModelUsageService.canAffordModelCall(instanceMeta, compModelId, userId)) return false;
		return true;
	}

	/**
	 * D/区带划分：`historyBudget` 在压缩便签会话下应与 `buildSendPathBudgets` 发信 history 一致（见 compression-overview）。	 * messages 为近 `AGENT_OVERVIEW_SCAN_LIMIT`（50 000）条内、仅 user/assistant，自新向旧，D 累计口径与 `dMapFromRowsNewestFirst` 一致。	 * `reconcileDormantActive`：为真时在读取便签前按当前对话刷新 dormant/active（与仅依赖上次助理侧车写入相比，可避免前端长期看到「休眠中」）。	 */
	@bindThis
	public async getCompressionOverviewData(
		sessionId: string,
		historyBudget: number,
		t1Ratio: number,
		t2Ratio: number,
		reconcileDormantActive = false,
		exactTokenCounter?: (text: string) => Promise<number | null> | number | null,
		charsPerToken?: number,
		historyBudgetTokens?: number,
		timeAwarenessEnabled?: boolean,
	): Promise<{
		historyBudgetTokens: number;
		t1Tokens: number;
		t2Tokens: number;
		messages: Array<{
			id: string;
			role: string;
			/** 本条正文长度换算的约 token（与 D 累计同口径：`approxLlmTokensFromCharEstimate`）*/
			messageTokens: number;
			dFromNewTokens: number;
			band: MessageWithD['band'];
			contentPreview: string;
			/** 本条 token 数（含累计 D）是否为启发式近似：精确模式下超出窗口预算的部分会回退估算，此时为 true，前端应加 ≈ 前缀 */
			tokensEstimated: boolean;
			/** 落在 state 为 dormant/active 的侧车 [from,to] 内，轮文中由摘要替代 */
			compressed: boolean;
		}>;
		stickies: (MiAgentSessionCompressionSticky & { fromMessagePreview: string; toMessagePreview: string })[];
		/** 最近一次压缩侧车失败的时间（ISO）；无失败便签则为 null。供前端轮询据此弹失败提示；失败便签本身不在 stickies 列表展示 */
		compressionSidecarFailedAt: string | null;
	}> {
		const rows = await this.agentMessagesRepository.find({
			where: { sessionId },
			order: { createdAt: 'DESC', id: 'DESC' },
			take: AGENT_OVERVIEW_SCAN_LIMIT,
			select: ['id', 'role', 'content', 'createdAt', 'imageFileId', 'imageRecognitionStatus', 'imageRecognitionDescription', 'proactiveScheduleControlRaw', 'proactiveScheduleControlError', 'timeTrusted'],
		});
		const rowsD = filterRowsForChatHistoryD(rows);
		const formatFn = (m: (typeof rowsD)[number]): string => this.agentService.formatMessageForLlmHistory(m as Parameters<AgentService['formatMessageForLlmHistory']>[0], { timeAwarenessEnabled: timeAwarenessEnabled === true });
		const cpt = charsPerToken ?? AGENT_LLM_APPROX_CHARS_PER_TOKEN;
		const budgetTokens = historyBudgetTokens ?? this.agentTokenService.estimateTokens(historyBudget, cpt);
		// 统一委托 AgentTokenService：D 累计（token 口径，分块并发 + 超预算提前终止）+ 窗口/区带划分。
		// 与 context-window 分割线、send 滑窗共享同一计算路径，结构性保证一致。
		const weights = await this.agentTokenService.computeMessageWeights(rowsD, {
			formatFn,
			counter: exactTokenCounter,
			charsPerToken: cpt,
			budgetForExact: exactTokenCounter ? budgetTokens : undefined,
		});
		if (reconcileDormantActive) {
			await this.reconcileStickyStates(sessionId, budgetTokens, weights.dMap);
		}
		const bands = this.agentTokenService.computeWindowAndBands(rowsD, weights.dMap, {
			historyBudgetTokens: budgetTokens,
			t1Ratio,
			t2Ratio,
		});
		const stickies = await this.listStickies(sessionId);
		/** 便签端点消息在对话中的短预览（供总览页展示，非 ID）——经 agentPreviewText 过滤 MD/MFM/XML 语法 */
		const formatStickyMsgPreview = (raw: string | null | undefined): string => {
			if (raw == null || raw === '') return '…';
			const one = agentPreviewText(raw, { maxLength: 160 });
			return one.length > 0 ? one : '…';
		};
		const boundaryIdSet = new Set<string>();
		for (const s of stickies) {
			boundaryIdSet.add(s.fromMessageId);
			boundaryIdSet.add(s.toMessageId);
		}
		const bIds = [...boundaryIdSet];
		// 单次查询同时取回 content（便签端点预览）与 createdAt（区间判定），避免对同一 ID 集合发起两次 DB 往返
		const boundaryRows = bIds.length === 0
			? []
			: await this.agentMessagesRepository.find({
				where: { sessionId, id: In(bIds) },
				select: ['id', 'content', 'createdAt'],
			});
		const msgPreviewById = new Map(boundaryRows.map(m => [m.id, formatStickyMsgPreview(m.content)]));
		const boundaries = new Map<string, { createdAt: Date; id: string }>();
		for (const r of boundaryRows) {
			boundaries.set(r.id, { createdAt: r.createdAt, id: r.id });
		}
		// 预计算「已压缩」判定所需的便签时间区间：仅 dormant/active 便签参与，并提前归一化 [lo,hi]，
		// 避免在下方 5 万条消息的 map 里逐条重复 boundaries.get 与 from/to 排序（原 O(N×M) 含重复解析）
		const stickyIntervals: { lo: { createdAt: Date; id: string }; hi: { createdAt: Date; id: string } }[] = [];
		for (const s of stickies) {
			if (s.state !== 'dormant' && s.state !== 'active') continue;
			const f = boundaries.get(s.fromMessageId);
			const t = boundaries.get(s.toMessageId);
			if (!f || !t) continue;
			if (this.compareMessageOrder(f, t) > 0) stickyIntervals.push({ lo: t, hi: f });
			else stickyIntervals.push({ lo: f, hi: t });
		}
		let anyEstimated = false;
		// 仅对前端实际可见的消息执行完整预览过滤（mfm-js 解析开销大，禁止逐条全量执行）：
		// 与前端 compressionMessageBandBlocks 的折叠策略一致——每个区带按响应顺序（自新向旧）保留首尾各 4 条
		const BAND_VISIBLE_EDGE = 4;
		const visiblePreviewIds = new Set<string>();
		{
			const idsByBand: Record<string, string[]> = { new: [], prep: [], staged: [], out: [] };
			for (const m of rowsD) {
				const b = bands.bandById.get(m.id) ?? 'new';
				(idsByBand[b] ??= []).push(m.id);
			}
			for (const ids of Object.values(idsByBand)) {
				if (ids.length <= BAND_VISIBLE_EDGE * 2) {
					for (const id of ids) visiblePreviewIds.add(id);
				} else {
					for (const id of ids.slice(0, BAND_VISIBLE_EDGE)) visiblePreviewIds.add(id);
					for (const id of ids.slice(ids.length - BAND_VISIBLE_EDGE)) visiblePreviewIds.add(id);
				}
			}
		}
		const messages = rowsD.map(m => {
			const d = weights.dMap.get(m.id) ?? 0;
			const band: MessageWithD['band'] = bands.bandById.get(m.id) ?? 'new';
			// 已压缩只标在已滑出「窗内」的条上（d>t1Band），与区带名一致，避免发信 H 与总览 t1 历史错位时出现「窗内·新 + 已压缩」
			// 先做廉价的 d 判定短路：窗内（d≤t1）消息永不压缩；仅对滑出窗内且存在 dormant/active 便签的消息做区间命中检查
			let compressed = false;
			if (d > bands.t1Band && stickyIntervals.length > 0) {
				const mm = { createdAt: m.createdAt, id: m.id };
				for (const iv of stickyIntervals) {
					if (this.compareMessageOrder(iv.lo, mm) <= 0 && this.compareMessageOrder(mm, iv.hi) <= 0) {
						compressed = true;
						break;
					}
				}
			}
			// 自最新条向旧传递：一旦某条为估算（精确模式超预算回退），其后（更旧）的累计 D 均为近似
			anyEstimated = anyEstimated || (weights.estimatedById.get(m.id) ?? false);
			return {
				id: m.id,
				role: m.role,
				messageTokens: weights.tokensById.get(m.id) ?? 0,
				dFromNewTokens: d,
				band,
				contentPreview: visiblePreviewIds.has(m.id) ? agentPreviewText(m.content, { maxLength: 200 }) : '',
				tokensEstimated: anyEstimated,
				compressed,
			};
		});
		// 失败便签不进入用户可见列表（压缩失败不往便签列表加内容，仅自动重试）；
		// 但其 updatedAt 作为弹窗信号经 compressionSidecarFailedAt 暴露给前端轮询
		let failedAtMs = 0;
		const stickiesWithPreview: (MiAgentSessionCompressionSticky & { fromMessagePreview: string; toMessagePreview: string })[] = [];
		for (const s of stickies) {
			if (s.state === 'failed') {
				failedAtMs = Math.max(failedAtMs, s.updatedAt.getTime());
				continue;
			}
			stickiesWithPreview.push({
				...s,
				fromMessagePreview: msgPreviewById.get(s.fromMessageId) ?? '…',
				toMessagePreview: msgPreviewById.get(s.toMessageId) ?? '…',
			});
		}
		return {
			historyBudgetTokens: bands.bandBudget,
			t1Tokens: bands.t1Band,
			t2Tokens: bands.t2Band,
			messages,
			stickies: stickiesWithPreview,
			compressionSidecarFailedAt: failedAtMs > 0 ? new Date(failedAtMs).toISOString() : null,
		};
	}

	@bindThis
	public async deleteAllForSession(sessionId: string): Promise<void> {
		await this.stickyRepository.delete({ sessionId });
	}

	/**
	 * v4 导入：批量重建压缩便签。
	 * 先清空会话现有便签，再按导入数据批量插入。
	 * fromMessageId/toMessageId 使用 'imported' 占位，因为导入时没有原始消息 ID。
	 */
	@bindThis
	public async importStickies(
		sessionId: string,
		stickies: Array<{
			summaryText: string;
			state: AgentCompressionStickyState;
			userOverridden: boolean;
			sortIndex: number;
		}>,
		userId: string,
		sessionUserId: string,
	): Promise<number> {
		if (sessionUserId !== userId) {
			throw new ApiError({ message: 'Access denied.', code: 'ACCESS_DENIED', id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });
		}
		// 先删除现有便签
		await this.stickyRepository.delete({ sessionId });
		if (stickies.length === 0) return 0;
		const now = new Date();
		const rows = stickies.map(s => ({
			id: this.agentService.newId(),
			createdAt: now,
			updatedAt: now,
			sessionId,
			fromMessageId: 'imported',
			toMessageId: 'imported',
			summaryText: s.summaryText,
			state: s.state,
			userOverridden: s.userOverridden,
			sourceFingerprint: null,
			errorMessage: null,
			lastModelId: null,
			sortIndex: s.sortIndex,
			retryCount: 0,
		}));
		await this.stickyRepository.insert(rows);
		return rows.length;
	}

	@bindThis
	public async deleteStickyById(
		stickyId: string,
		sessionId: string,
		meId: string,
		sessionUserId: string,
	): Promise<void> {
		if (sessionUserId !== meId) {
			throw new ApiError({ message: 'Access denied.', code: 'ACCESS_DENIED', id: '6e7f8a9b-0c1d-2345-6789-abcdef012345' });
		}
		const del = await this.stickyRepository.delete({ id: stickyId, sessionId });
		if ((del.affected ?? 0) < 1) {
			throw new ApiError({ message: 'No such sticky.', code: 'NO_SUCH_ENTRY', id: '7f8a9b0c-1d2e-3456-789a-bcdef0123456' });
		}
	}

	@bindThis
	public async updateStickyText(
		stickyId: string,
		sessionId: string,
		summaryText: string,
		userId: string,
		sessionUserId: string,
	): Promise<MiAgentSessionCompressionSticky> {
		if (sessionUserId !== userId) {
			throw new ApiError({ message: 'Access denied.', code: 'ACCESS_DENIED', id: '8a9b0c1d-2e3f-4567-89ab-cdef01234567' });
		}
		const row = await this.stickyRepository.findOneBy({ id: stickyId, sessionId });
		if (!row) {
			throw new ApiError({ message: 'No such sticky.', code: 'NO_SUCH_ENTRY', id: '9b0c1d2e-3f4a-5678-9abc-def012345678' });
		}
		row.summaryText = summaryText;
		row.userOverridden = true;
		row.updatedAt = new Date();
		await this.stickyRepository.save(row);
		return row;
	}

	@bindThis
	public async reorderStickies(
		sessionId: string,
		orderedIds: string[],
		userId: string,
		sessionUserId: string,
	): Promise<void> {
		if (sessionUserId !== userId) {
			throw new ApiError({ message: 'Access denied.', code: 'ACCESS_DENIED', id: '0a0b0c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d' });
		}
		// 校验无重复 ID，防止同一便签被赋值多个 sortIndex 导致排序数据损坏
		if (new Set(orderedIds).size !== orderedIds.length) {
			throw new ApiError({ message: 'Duplicate sticky IDs in reorder list.', code: 'INVALID_PARAM', id: '3d4e5f6a-7b8c-9d0e-1f2a-3b4c5d6e7f8a' });
		}
		const existing = await this.stickyRepository.find({
			where: { sessionId },
			order: { sortIndex: 'ASC', id: 'ASC' },
		});
		if (orderedIds.length !== existing.length) {
			throw new ApiError({ message: 'Invalid sticky list.', code: 'INVALID_PARAM', id: '1b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e' });
		}
		const idSet = new Set(existing.map(e => e.id));
		for (const id of orderedIds) {
			if (!idSet.has(id)) {
				throw new ApiError({ message: 'Invalid sticky list.', code: 'INVALID_PARAM', id: '2c3d4e5f-6a7b-8c9d-0e1f-2a3b4c5d6e7f' });
			}
		}
		const byId = new Map(existing.map(e => [e.id, e]));
		const now = new Date();
		const changed: MiAgentSessionCompressionSticky[] = [];
		for (let i = 0; i < orderedIds.length; i++) {
			const row = byId.get(orderedIds[i]!)!;
			if (row.sortIndex !== i) {
				row.sortIndex = i;
				row.updatedAt = now;
				changed.push(row);
			}
		}
		if (changed.length > 0) await this.stickyRepository.save(changed);
	}

	@bindThis
	public async previewModelChangeForCompression(params: {
		session: MiAgentSession;
		newAgentModelId: string | null;
		instanceMeta: MiMeta;
		character: ReturnType<AgentService['effectiveCharacterForLlm']>;
		style: ReturnType<AgentService['effectiveStyleForLlm']>;
	}): Promise<{
		willInvalidateCompression: boolean;
		historyBudgetBefore: number;
		historyBudgetAfter: number;
		charsPerTokenBefore: number;
		charsPerTokenAfter: number;
		stickyCount: number;
		compressionProvider: boolean;
	}> {
		const { session, newAgentModelId, instanceMeta, character, style } = params;
		const provider = this.resolveEffectiveProvider(session.agentLongMemoryProvider, instanceMeta) === 'compression';
		const beforeB = this.buildSendPathBudgets({
			instanceMeta, session, character, style,
			provider: 'compression',
		});
		const clone = { ...session, agentModelId: newAgentModelId === undefined ? session.agentModelId : newAgentModelId };
		const afterB = this.buildSendPathBudgets({
			instanceMeta, session: clone, character, style,
			provider: 'compression',
		});
		const n = await this.stickyRepository.count({ where: { sessionId: session.id } });
		return {
			willInvalidateCompression: false,
			historyBudgetBefore: beforeB.historyBudget,
			historyBudgetAfter: afterB.historyBudget,
			charsPerTokenBefore: beforeB.charsPerToken,
			charsPerTokenAfter: afterB.charsPerToken,
			stickyCount: n,
			compressionProvider: provider,
		};
	}

	/**
	 * 以区间两端点的 **D 较大者*（时间较旧侧，自最新累加更大）与预算比较。	 * **max(D) > budget** 时区间内已有内容滑出发信滑窗，须 **active**；与 `from/to` 字段谁存旧端无关，兼容历史颠倒。	 * 任一端点不在 `dMap` 内（无值）视为已足够旧， **active**。	 * `dMap` 与 `budget` 须同口径（统一为 token：与发信滑窗/消息分段区带一致，修复侧车态与界面区带漂移）。	 */
	@bindThis
	public async reconcileStickyStates(
		sessionId: string,
		budget: number,
		dMap: Map<string, number>,
	): Promise<void> {
		const stickies = await this.listStickies(sessionId);
		const now = new Date();
		const changed: MiAgentSessionCompressionSticky[] = [];
		for (const s of stickies) {
			// 仅收束侧车“休眠/可注入”两态，避免误覆盖 stale / failed 态
			if (s.state !== 'dormant' && s.state !== 'active') continue;
			const dEnd1 = dMap.get(s.fromMessageId);
			const dEnd2 = dMap.get(s.toMessageId);
			let newState: AgentCompressionStickyState;
			if (dEnd1 == null || dEnd2 == null) {
				newState = 'active';
			} else if (Math.max(dEnd1, dEnd2) > budget) {
				newState = 'active';
			} else {
				newState = 'dormant';
			}
			if (s.state !== newState) {
				s.state = newState;
				s.updatedAt = now;
				changed.push(s);
			}
		}
		if (changed.length > 0) await this.stickyRepository.save(changed);
	}

	/**
	 * 侧车（peek/afterAssistant/reconcile）共用的 token 口径 D 累计与阈值，
	 * 与发信滑窗、消息分段区带同源（修复根因 E：侧车态与界面区带漂移）。
	 * 公开以便发信路径一次计算后同时传给 peek 与 afterAssistant，避免重复精确分词。 */
	public async computeSidecarTokenD(params: {
		session: MiAgentSession;
		character: ReturnType<AgentService['effectiveCharacterForLlm']>;
		style: ReturnType<AgentService['effectiveStyleForLlm']>;
		instanceMeta: MiMeta;
		rows: { id: string; role: string; content: string }[];
	}): Promise<CompressionSidecarTokenD> {
		const budgets = this.buildSendPathBudgets({
			instanceMeta: params.instanceMeta, session: params.session, character: params.character, style: params.style,
			provider: 'compression',
		});
		const hSend = budgets.historyBudgetTokens;
		const tokenConfig = this.agentTokenService.resolveTokenConfig(params.instanceMeta, params.session.agentModelId ?? null);
		const counter = this.agentTokenService.makeCounter(tokenConfig);
		const rowsD = filterRowsForChatHistoryD(params.rows);
		const weights = await this.agentTokenService.computeMessageWeights(rowsD, {
			formatFn: (m) => this.agentService.formatMessageForLlmHistory(m as unknown as Parameters<AgentService['formatMessageForLlmHistory']>[0], { timeAwarenessEnabled: params.session.timeAwarenessEnabled === true }),
			counter,
			charsPerToken: budgets.charsPerToken,
			budgetForExact: counter ? hSend : undefined,
		});
		const { t1Ratio, t2Ratio } = this.resolveCompressionBandRatios(params.instanceMeta);
		return { dMap: weights.dMap, hSend, t1: t1Ratio * hSend, t2: t2Ratio * hSend };
	}

	/**
	 * 在助理消息已落库后调用；D 与候选区间在**含本条 assistant** 的近 500 条上累计，与「回复后再算」一致。	 * **自动压缩 LLM**：仅当未压消息已进入「排队较后」带 (t2,hSend]（界面「排队较后」，即预备进入压条的下段）时才成条并调用模型；未压仅在「排队较前」 t1,t2]（上段）时只调 reconcile。`t1/t2` 与发信 H 同 `buildSendPathBudgets`。	 */
	@bindThis
	public async afterAssistantForCompression(
		session: MiAgentSession,
		character: ReturnType<AgentService['effectiveCharacterForLlm']>,
		style: ReturnType<AgentService['effectiveStyleForLlm']>,
		instanceMeta: MiMeta,
		userId: string,
		preloadedRows?: CompressionScanRow[],
		precomputedSidecar?: CompressionSidecarTokenD,
	): Promise<void> {
		if (this.resolveEffectiveProvider(session.agentLongMemoryProvider, instanceMeta) !== 'compression') return;

		const rows = preloadedRows ?? await this.agentMessagesRepository.find({
			where: { sessionId: session.id },
			order: { createdAt: 'DESC', id: 'DESC' },
			take: AGENT_SEND_PATH_SCAN_LIMIT,
			select: ['id', 'role', 'content', 'createdAt', 'imageFileId', 'imageRecognitionStatus', 'imageRecognitionDescription', 'proactiveScheduleControlRaw', 'proactiveScheduleControlError', 'timeTrusted'],
		});
		const { dMap, hSend, t1, t2 } = precomputedSidecar ?? await this.computeSidecarTokenD({ session, character, style, instanceMeta, rows });
		// 仅在「排队较后」(t2,hSend]（预备下段）出现未压 raw 时触发 LLM；未压若只在「排队较前」(t1,t2]（上段）则仅 reconcile。
		const gathered = await this.gatherCompressionCandidates({ sessionId: session.id, rows, dMap, hSend, t1, t2, timeAwarenessEnabled: session.timeAwarenessEnabled === true });
		if (!gathered) {
			await this.reconcileStickyStates(session.id, hSend, dMap);
			return;
		}
		const { fromId, toId, textBlob, fingerprint, existingByFp } = gathered;
		if (existingByFp) {
			// 重试：递增计数，清除错误，后续复用此行更新摘要
			existingByFp.retryCount += 1;
			existingByFp.errorMessage = null;
			await this.stickyRepository.save(existingByFp);
		}
		const rawMax = await this.stickyRepository
			.createQueryBuilder('s')
			.select('COALESCE(MAX(s.sortIndex), 0)', 'm')
			.where('s.sessionId = :id', { id: session.id })
			.getRawOne() as { m: string } | undefined;
		const mRaw = Number.parseInt(String(rawMax?.m ?? '0'), 10);
		const nextSort = (Number.isFinite(mRaw) ? mRaw : 0) + 1;
		const now = new Date();
		const customPrompt = instanceMeta.agentCompressionSystemPrompt;
		const systemPrompt = typeof customPrompt === 'string' && customPrompt.trim().length > 0
			? customPrompt.trim()
			: DEFAULT_AGENT_COMPRESSION_SYSTEM_PROMPT;
		const maxInput = Math.max(500, Math.min(200_000, instanceMeta.agentCompressionMaxInputChars ?? 12000));
		const maxOut = Math.max(1, Math.min(32_000, instanceMeta.agentCompressionMaxOutputTokens ?? 2048));
		const compModelId = this.resolveEffectiveCompressionModelId(session, instanceMeta);
		let modelApiName: string | null = null;
		try {
			modelApiName = this.agentService.resolveModelApiName(instanceMeta, compModelId);
		} catch {
			await this.reconcileStickyStates(session.id, hSend, dMap);
			return;
		}
		if (!await this.agentModelUsageService.canAffordModelCall(instanceMeta, compModelId, userId)) {
			await this.reconcileStickyStates(session.id, hSend, dMap);
			return;
		}
		const usageLog = await this.agentModelUsageService.startLog({
			userId,
			sessionId: session.id,
			characterId: session.characterId,
			dialogueStyleId: session.dialogueStyleId,
			modelId: compModelId,
			modelApiName,
			usageKind: 'compression',
		});
		// 失败时不存原文节录：summaryText 留空，状态置 failed，由前端显式提示用户压缩失败
		let summary = '';
		let compressionError: string | null = null;
		try {
			const llmResult = await this.agentService.invokeChatCompletions({
				system: systemPrompt,
				messages: [],
				userText: textBlob.length > maxInput ? textBlob.slice(0, maxInput) : textBlob,
				sessionModelId: compModelId,
				maxTokens: maxOut,
			});
			summary = llmResult.text;
			// 计费 token 数一律取自响应 usage（禁止本地估算）；缺失时由 finishLog 按策略兜底
			const usageFields = llmResult.usage ? {
				promptTokens: llmResult.usage.promptTokens,
				completionTokens: llmResult.usage.completionTokens,
				promptCacheHitTokens: llmResult.usage.promptCacheHitTokens ?? null,
				promptCacheMissTokens: llmResult.usage.promptCacheMissTokens ?? null,
			} : {};
			await this.agentModelUsageService.finishLog(usageLog, instanceMeta, { status: 'success', ...usageFields });
		} catch {
			compressionError = 'COMPRESSION_LLM_FAILED';
			try {
				await this.agentModelUsageService.finishLog(usageLog, instanceMeta, { status: 'failed', errorCode: 'COMPRESSION_LLM' });
			} catch {
				// 忽略结算错误
			}
		}
		// 成功 → dormant（可注入）；失败 → failed（前端显式提示，不注入、不排除原文）
		const finalState: AgentCompressionStickyState = compressionError == null ? 'dormant' : 'failed';
		try {
			if (existingByFp) {
				// 重试路径：更新已有便签的摘要/状态
				existingByFp.summaryText = summary;
				existingByFp.state = finalState;
				existingByFp.errorMessage = compressionError;
				existingByFp.lastModelId = compModelId;
				existingByFp.updatedAt = new Date();
				await this.stickyRepository.save(existingByFp);
			} else {
				await this.stickyRepository.insertOne({
					id: this.agentService.newId(),
					createdAt: now,
					updatedAt: now,
					sessionId: session.id,
					fromMessageId: fromId,
					toMessageId: toId,
					summaryText: summary,
					state: finalState,
					userOverridden: false,
					sourceFingerprint: fingerprint,
					errorMessage: compressionError,
					lastModelId: compModelId,
					sortIndex: nextSort,
				});
			}
		} catch (e: unknown) {
			// 并发下可能触发 (sessionId, sourceFingerprint) 唯一索引冲突，此时已有等价便签，跳过即可
			const code = (e as { code?: string })?.code;
			if (code !== '23505') throw e; // 23505 = unique_violation
		}
		await this.reconcileStickyStates(session.id, hSend, dMap);
	}
}
