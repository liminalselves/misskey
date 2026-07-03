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
import { AgentDashscopeMemoryService } from '@/core/AgentDashscopeMemoryService.js';
import { bindThis } from '@/decorators.js';

export const AGENT_COMPRESSION_MEMORY_XML_OPEN = '<compression_memory>\n';
export const AGENT_COMPRESSION_MEMORY_XML_CLOSE = '\n</compression_memory>';

export const agentLongMemoryProviderIds = ['none', 'aliyun', 'compression'] as const;
export type AgentLongMemoryProviderId = typeof agentLongMemoryProviderIds[number];

/** 与 Meta 中未配置时一致；可经管理端覆盖 */
export const DEFAULT_AGENT_COMPRESSION_SYSTEM_PROMPT =
	'将用户给出的对话节录压缩为一条简洁的中文要点，保留人名/数字/决定；不要复述全文；不要加开场白。输出纯文本一段。';

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
	) {
	}

	/**
	 * 压缩便签：本会话列优先（创建会话时写入当时的默认）；空则 meta 压缩默认 → 全站对话默认。
	 */
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
	 * 与 `buildSendPathBudgets`、`buildContextDividerAlignedBudgets` 共用：仅在实际走阿里云语义记忆时预留 `<memory>` 上限，否则 0。
	 */
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
	 * 与 `agents/messages/send` 一致，用于**真实进 LLM** 的 history 上界、`reconcileStickyStates`（区间两端 D 取大者与 H 比较）、压缩总览区带（provider 为 compression 时）。
	 * 字符池：`max(4000, maxContextTokens×3)` 减 `systemChars`（含 comp 全段、百炼 `memory` 等）与当轮 `maxOut×3` 预留。Token 约数见 `AgentService.approxLlmTokensFromCharEstimate`（÷3，四舍五入）。
	 */
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
	} {
		const { instanceMeta, session, character, style, provider } = params;
		const { maxContextTokens, maxOutputTokensPerCall } = this.agentService.resolveModelConnection(
			instanceMeta,
			session.agentModelId ?? null,
		);
		const systemBase = this.agentService.buildSystemPrompt({
			globalPrompt: instanceMeta.agentGlobalSystemPrompt,
			character,
			style,
		});
		const memReserve = this.computeAliyunMemoryXmlReserveIfActive(provider, session, instanceMeta);
		const maxComp = Math.max(200, Math.min(50_000, session.agentLongMemoryInjectMaxChars));
		const compReserve = provider === 'compression' ? this.computeCompressionReserveChars(maxComp) : 0;
		const systemChars = systemBase.length + memReserve + compReserve;
		// 与 `send.ts` 注入到最新 user 的 directive 同步预扣，避免历史填到上限后叠加 directive 溢出上下文窗。
		// 世界书已从 system 移除、改由 directive 的 <active-worldbook> 交付，这里按「全部已启用条目」保守预扣（上界），
		// 与世界书曾整段写入 system 时的预留量一致，避免上下文溢出回归。
		const budgetWorldbook = this.agentService.buildBudgetWorldbookEntries(character);
		const directiveChars = this.agentService.buildLatestUserDirectiveBlock(style, budgetWorldbook).length;
		const historyBudget = this.agentService.computeChatHistoryCharBudget({
			maxContextTokens,
			maxOutputTokensPerCall,
			systemChars,
			prefixMessages: [],
			runtimeDirectiveChars: directiveChars,
		});
		return { historyBudget, maxContextTokens, maxOutputTokensPerCall, memReserveChars: memReserve, compReserveChars: compReserve };
	}

	/** 未配置 meta 时区带 T1、T2 相对 H 的比例；可通过 `resolveCompressionBandRatios` 覆盖。 */
	public static readonly DEFAULT_COMPRESSION_BAND_T1_RATIO = 0.8;
	public static readonly DEFAULT_COMPRESSION_BAND_T2_RATIO = 0.9;

	/**
	 * 自 Meta 读压缩区带 t1/t2 比例，非法或缺失时回退默认，并保证 0 &lt; t1 &lt; t2 &lt; 1。
	 */
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

	/**
	 * `context-window` 分割线及 `loadRecentMessagesForContextWithMeta` 的 `max`：不预扣 `compression_memory` 占位，故 `historyBudgetChars` 大于启用压缩便签时的发信 history 上界。
	 * `agents/sessions/compression-overview` 在压缩模式下须传入 `buildSendPathBudgets(..., provider: 'compression')` 的 history，使区带与 `reconcileStickyStates`、自动压条一致；勿与分割线预算混用。
	 */
	@bindThis
	public buildContextDividerAlignedBudgets(params: {
		instanceMeta: MiMeta;
		session: MiAgentSession;
		character: ReturnType<AgentService['effectiveCharacterForLlm']>;
		style: ReturnType<AgentService['effectiveStyleForLlm']>;
	}): { maxContextTokens: number; maxOutputTokensPerCall: number; historyBudgetChars: number } {
		const { instanceMeta, session, character, style } = params;
		const { maxContextTokens, maxOutputTokensPerCall } = this.agentService.resolveModelConnection(
			instanceMeta,
			session.agentModelId ?? null,
		);
		const systemBase = this.agentService.buildSystemPrompt({
			globalPrompt: instanceMeta.agentGlobalSystemPrompt,
			character,
			style,
		});
		const prov = this.resolveEffectiveProvider(session.agentLongMemoryProvider, instanceMeta);
		const memReserveChars = this.computeAliyunMemoryXmlReserveIfActive(prov, session, instanceMeta);
		// 与 send 路径一致预扣最新 user 风格 directive 占位（不预扣压缩段，故 H 仍大于发信 H）。
		const directiveChars = this.agentService.buildLatestUserDirectiveBlock(style).length;
		const historyBudgetChars = this.agentService.computeChatHistoryCharBudget({
			maxContextTokens,
			maxOutputTokensPerCall,
			systemChars: systemBase.length + memReserveChars,
			prefixMessages: [],
			runtimeDirectiveChars: directiveChars,
		});
		return { maxContextTokens, maxOutputTokensPerCall, historyBudgetChars };
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

	/** 时间序 a 在 [b,c] 内（含端点，b 不晚于 c） */
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

	/**
	 * 自最新向旧，累加 content.length 得到 D(m)。传入行须先按与滑窗相同口径筛出 user/assistant，见 `filterRowsForChatHistoryD`。
	 * rows 顺序须为同 session 下 createdAt DESC, id DESC 取用的子序列。
	 */
	@bindThis
	public dMapFromRowsNewestFirst(rows: { id: string; content: string }[]): Map<string, number> {
		const d = new Map<string, number>();
		let acc = 0;
		for (const m of rows) {
			acc += m.content.length;
			d.set(m.id, acc);
		}
		return d;
	}

	@bindThis
	public buildPairsExcludingActiveCompression(
		pickedOldestFirst: { id: string; role: string; content: string; createdAt: Date }[],
		activeStickies: MiAgentSessionCompressionSticky[],
		boundaries: Map<string, { createdAt: Date; id: string }>,
	): { role: 'user' | 'assistant'; content: string }[] {
		const pairs: { role: 'user' | 'assistant'; content: string }[] = [];
		for (const m of pickedOldestFirst) {
			if (m.role !== 'user' && m.role !== 'assistant') continue;
			let inside = false;
			for (const s of activeStickies) {
				if (s.state !== 'active') continue;
				if (this.messageInStickyRange(
					{ id: m.id, createdAt: m.createdAt },
					s,
					boundaries,
				)) {
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
	): string {
		const sorted = [...actives]
			.filter(s => s.state === 'active')
			.filter(s => boundaries.has(s.fromMessageId) && boundaries.has(s.toMessageId))
			.sort((a, b) => (a.sortIndex !== b.sortIndex
				? a.sortIndex - b.sortIndex
				: a.id.localeCompare(b.id)));
		const parts: string[] = [];
		for (const s of sorted) {
			parts.push(s.summaryText.trim());
		}
		const raw = parts.join('\n\n');
		if (raw.length === 0) return '';
		return AGENT_COMPRESSION_MEMORY_XML_OPEN
			+ escapeAgentXmlText(raw)
			+ AGENT_COMPRESSION_MEMORY_XML_CLOSE;
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
	 * 与 `afterAssistantForCompression` 在调用 `invokeChatCompletions` 之前的前置条件一致（含：须已有未压内容进入 (t2,hSend]）；为真时才向客户端展示「压缩进行中」。
	 * 若修改侧车逻辑，须与此处同步。
	 */
	@bindThis
	public async peekWillInvokeCompressionLlm(
		session: MiAgentSession,
		character: ReturnType<AgentService['effectiveCharacterForLlm']>,
		style: ReturnType<AgentService['effectiveStyleForLlm']>,
		instanceMeta: MiMeta,
		userId: string,
	): Promise<boolean> {
		if (this.resolveEffectiveProvider(session.agentLongMemoryProvider, instanceMeta) !== 'compression') return false;

		const { historyBudget: hSend } = this.buildSendPathBudgets({
			instanceMeta, session, character, style,
			provider: 'compression',
		});
		const rows = await this.agentMessagesRepository.find({
			where: { sessionId: session.id },
			order: { createdAt: 'DESC', id: 'DESC' },
			take: 500,
			select: ['id', 'role', 'content', 'createdAt'],
		});
		const dMap = this.dMapFromRowsNewestFirst(filterRowsForChatHistoryD(rows));
		const { t1Ratio, t2Ratio } = this.resolveCompressionBandRatios(instanceMeta);
		const t1 = t1Ratio * hSend;
		const t2 = t2Ratio * hSend;
		const stickies = await this.listStickies(session.id);
		const bIds: string[] = [];
		for (const s of stickies) { bIds.push(s.fromMessageId, s.toMessageId); }
		const b = await this.loadBoundaryMap(session.id, bIds);
		const uncoveredT1H: typeof rows = [];
		let hasUncoveredStaged = false;
		for (const m of rows) {
			if (m.role !== 'user' && m.role !== 'assistant') continue;
			const d = dMap.get(m.id) ?? 0;
			if (d <= t1 || d > hSend) continue;
			if (m.content.length === 0) continue;
			let covered = false;
			for (const s of stickies) {
				if (s.state === 'stale') continue;
				if (this.messageInStickyRange(
					{ id: m.id, createdAt: m.createdAt },
					s,
					b,
				)) {
					covered = true;
					break;
				}
			}
			if (covered) continue;
			uncoveredT1H.push(m);
			if (d > t2) hasUncoveredStaged = true;
		}
		if (!hasUncoveredStaged) return false;
		const candidates: typeof rows = uncoveredT1H;
		if (candidates.length === 0) return false;
		candidates.sort((a, c) => this.compareMessageOrder(a, c));
		const fromId = candidates[0]!.id;
		const toId = candidates[candidates.length - 1]!.id;
		if (await this.stickyRepository.findOne({
			where: { sessionId: session.id, fromMessageId: fromId, toMessageId: toId },
		})) return false;
		const textBlob = candidates.map(m => `${m.role}: ${m.content}`).join('\n\n');
		const fp = createHash('sha256').update(textBlob, 'utf8').digest('hex');
		if (await this.stickyRepository.findOne({ where: { sessionId: session.id, sourceFingerprint: fp } })) return false;
		const compModelId = this.resolveEffectiveCompressionModelId(session, instanceMeta);
		try {
			this.agentService.resolveModelApiName(instanceMeta, compModelId);
		} catch {
			return false;
		}
		const compCost = this.agentService.getUserFacingModelCostPerCall(instanceMeta, compModelId);
		if (compCost > 0) {
			const profile = await this.userProfilesRepository.findOneBy({ userId });
			if ((profile?.agentCreditBalance ?? 0) < compCost) return false;
		}
		return true;
	}

	/**
	 * D/区带划分：`historyBudget` 在压缩便签会话下应与 `buildSendPathBudgets` 发信 history 一致（见 compression-overview）。
	 * messages 为近 500 条内、仅 user/assistant，自新向旧，D 累计口径与 `dMapFromRowsNewestFirst` 一致。
	 * `reconcileDormantActive`：为真时在读取便签前按当前对话刷新 dormant/active（与仅依赖上次助理侧车写入相比，可避免前端长期看到「休眠中」）。
	 */
	@bindThis
	public async getCompressionOverviewData(
		sessionId: string,
		historyBudget: number,
		t1Ratio: number,
		t2Ratio: number,
		reconcileDormantActive = false,
	): Promise<{
		historyBudgetTokens: number;
		t1Tokens: number;
		t2Tokens: number;
		messages: Array<{
			id: string;
			role: string;
			/** 本条正文长度换算的约 token（与 D 累计同口径：`approxLlmTokensFromCharEstimate`） */
			messageTokens: number;
			dFromNewTokens: number;
			band: MessageWithD['band'];
			contentPreview: string;
			/** 落在 state 为 dormant/active 的侧车 [from,to] 内，轮文中由摘要替代 */
			compressed: boolean;
		}>;
		stickies: (MiAgentSessionCompressionSticky & { fromMessagePreview: string; toMessagePreview: string })[];
	}> {
		const rows = await this.agentMessagesRepository.find({
			where: { sessionId },
			order: { createdAt: 'DESC', id: 'DESC' },
			take: 500,
			select: ['id', 'role', 'content', 'createdAt'],
		});
		if (reconcileDormantActive) {
			await this.reconcileStickyStates(sessionId, historyBudget, rows);
		}
		const rowsD = filterRowsForChatHistoryD(rows);
		const dMap = this.dMapFromRowsNewestFirst(rowsD);
		/** 当 H<1 时 d>0 即被判为 out，会连「最新一条」也成滑窗外；总览只读展示时改用与最新条对齐的合成预算，不改变 send/便签用的真实 H。 */
		const dNewest = rowsD.length > 0 ? (dMap.get(rowsD[0]!.id) ?? 0) : 0;
		const bandHistBudget = historyBudget >= 1
			? historyBudget
			: Math.max(1, dNewest / t1Ratio);
		const t1Band = t1Ratio * bandHistBudget;
		const t2Band = t2Ratio * bandHistBudget;
		const toTok = (charLen: number) => this.agentService.approxLlmTokensFromCharEstimate(charLen);
		const stickies = await this.listStickies(sessionId);
		/** 便签端点消息在对话中的短预览（供总览页展示，非 ID） */
		const formatStickyMsgPreview = (raw: string | null | undefined): string => {
			if (raw == null || raw === '') return '…';
			const one = raw.replace(/\s+/g, ' ').trim();
			if (one.length === 0) return '…';
			return one.length <= 160 ? one : `${one.slice(0, 160)}…`;
		};
		const boundaryIdSet = new Set<string>();
		for (const s of stickies) {
			boundaryIdSet.add(s.fromMessageId);
			boundaryIdSet.add(s.toMessageId);
		}
		const bIds = [...boundaryIdSet];
		const boundaryRows = bIds.length === 0
			? []
			: await this.agentMessagesRepository.find({
				where: { sessionId, id: In(bIds) },
				select: ['id', 'content'],
			});
		const msgPreviewById = new Map(boundaryRows.map(m => [m.id, formatStickyMsgPreview(m.content)]));
		const boundaries = await this.loadBoundaryMap(sessionId, bIds);
		const inStickyDormantOrActive = (m: { id: string; createdAt: Date }): boolean => {
			for (const s of stickies) {
				if (s.state !== 'dormant' && s.state !== 'active') continue;
				if (this.messageInStickyRange({ id: m.id, createdAt: m.createdAt }, s, boundaries)) {
					return true;
				}
			}
			return false;
		};
		const messages = rowsD.map(m => {
			const d = dMap.get(m.id) ?? 0;
			let band: MessageWithD['band'] = 'new';
			if (d > bandHistBudget) band = 'out';
			else if (d > t2Band) band = 'staged';
			else if (d > t1Band) band = 'prep';
			// 已压缩只标在已滑出「窗内」的条上（d>t1Band），与区带名一致，避免发信 H 与总览 t1 历史错位时出现「窗内·新 + 已压缩」
			const compressed = inStickyDormantOrActive(m) && d > t1Band;
			return {
				id: m.id,
				role: m.role,
				messageTokens: toTok(m.content.length),
				dFromNewTokens: toTok(d),
				band,
				contentPreview: m.content.slice(0, 200),
				compressed,
			};
		});
		const stickiesWithPreview = stickies.map(s => ({
			...s,
			fromMessagePreview: msgPreviewById.get(s.fromMessageId) ?? '…',
			toMessagePreview: msgPreviewById.get(s.toMessageId) ?? '…',
		}));
		return {
			historyBudgetTokens: toTok(historyBudget),
			t1Tokens: toTok(t1Band),
			t2Tokens: toTok(t2Band),
			messages,
			stickies: stickiesWithPreview,
		};
	}

	@bindThis
	public async deleteAllForSession(sessionId: string): Promise<void> {
		await this.stickyRepository.delete({ sessionId });
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
		const now = new Date();
		for (let i = 0; i < orderedIds.length; i++) {
			const row = existing.find(e => e.id === orderedIds[i]!)!;
			if (row.sortIndex !== i) {
				row.sortIndex = i;
				row.updatedAt = now;
				await this.stickyRepository.save(row);
			}
		}
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
			stickyCount: n,
			compressionProvider: provider,
		};
	}

	/**
	 * 以区间两端点中 **D 较大者**（时间较旧侧，自最新累加字符和更大）与 H 比较。
	 * **max(D) > H** 时区间内已有内容滑出发信滑窗，须 **active**；与 `from/to` 字段谁存旧端无关，兼容历史颠倒。
	 * 任一端点不在近 500 条取样内（`dMap` 无值）视为已足够旧，**active**。
	 */
	@bindThis
	public async reconcileStickyStates(
		sessionId: string,
		historyBudget: number,
		rowsForDNewestFirst: { id: string; content: string; createdAt: Date; role: string }[],
	): Promise<void> {
		const dMap = this.dMapFromRowsNewestFirst(filterRowsForChatHistoryD(rowsForDNewestFirst));
		const stickies = await this.listStickies(sessionId);
		for (const s of stickies) {
			// 仅收束侧车“休眠/可注入”两态，避免误覆写 stale / failed 等
			if (s.state !== 'dormant' && s.state !== 'active') continue;
			const dEnd1 = dMap.get(s.fromMessageId);
			const dEnd2 = dMap.get(s.toMessageId);
			let newState: AgentCompressionStickyState;
			if (dEnd1 == null || dEnd2 == null) {
				newState = 'active';
			} else if (Math.max(dEnd1, dEnd2) > historyBudget) {
				newState = 'active';
			} else {
				newState = 'dormant';
			}
			if (s.state !== newState) {
				s.state = newState;
				s.updatedAt = new Date();
				await this.stickyRepository.save(s);
			}
		}
	}

	/**
	 * 在助理消息已落库后调用；D 与候选区间在**含本轮 assistant** 的近 500 条上累计，与「回复后再算」一致。
	 * **自动压缩 LLM**：仅当未压消息已进入「排队较后」带 (t2,hSend]（界面「排队较后」，即预备进入压条的下段）时才成条并调用模型；未压仅在「排队较前」(t1,t2]（上段）时只做 reconcile。`t1/t2` 与发信 H 见 `buildSendPathBudgets`。
	 */
	@bindThis
	public async afterAssistantForCompression(
		session: MiAgentSession,
		character: ReturnType<AgentService['effectiveCharacterForLlm']>,
		style: ReturnType<AgentService['effectiveStyleForLlm']>,
		instanceMeta: MiMeta,
		userId: string,
	): Promise<void> {
		if (this.resolveEffectiveProvider(session.agentLongMemoryProvider, instanceMeta) !== 'compression') return;

		const { historyBudget: hSend } = this.buildSendPathBudgets({
			instanceMeta, session, character, style,
			provider: 'compression',
		});
		const rows = await this.agentMessagesRepository.find({
			where: { sessionId: session.id },
			order: { createdAt: 'DESC', id: 'DESC' },
			take: 500,
			select: ['id', 'role', 'content', 'createdAt'],
		});
		const dMap = this.dMapFromRowsNewestFirst(filterRowsForChatHistoryD(rows));
		const { t1Ratio, t2Ratio } = this.resolveCompressionBandRatios(instanceMeta);
		const t1 = t1Ratio * hSend;
		const t2 = t2Ratio * hSend;
		// 仅在「排队较后」(t2,hSend]（预备下段）出现未压 raw 时触发 LLM；未压若只在「排队较前」(t1,t2]（上段）则仅 reconcile。
		const stickies = await this.listStickies(session.id);
		const bIds: string[] = [];
		for (const s of stickies) { bIds.push(s.fromMessageId, s.toMessageId); }
		const b = await this.loadBoundaryMap(session.id, bIds);
		const uncoveredT1H: typeof rows = [];
		let hasUncoveredStaged = false; // 未压 raw 已落入 (t2, hSend]
		for (const m of rows) {
			if (m.role !== 'user' && m.role !== 'assistant') continue;
			const d = dMap.get(m.id) ?? 0;
			if (d <= t1 || d > hSend) continue;
			if (m.content.length === 0) continue;
			let covered = false;
			for (const s of stickies) {
				if (s.state === 'stale') continue;
				if (this.messageInStickyRange(
					{ id: m.id, createdAt: m.createdAt },
					s,
					b,
				)) {
					covered = true;
					break;
				}
			}
			if (covered) continue;
			uncoveredT1H.push(m);
			if (d > t2) hasUncoveredStaged = true;
		}
		if (!hasUncoveredStaged) {
			await this.reconcileStickyStates(session.id, hSend, rows);
			return;
		}
		const candidates: typeof rows = uncoveredT1H;
		if (candidates.length === 0) {
			await this.reconcileStickyStates(session.id, hSend, rows);
			return;
		}
		// 时间序最老到最新
		candidates.sort((a, c) => this.compareMessageOrder(a, c));
		const fromId = candidates[0]!.id;
		const toId = candidates[candidates.length - 1]!.id;
		// 已有同一区间
		if (await this.stickyRepository.findOne({
			where: { sessionId: session.id, fromMessageId: fromId, toMessageId: toId },
		})) {
			await this.reconcileStickyStates(session.id, hSend, rows);
			return;
		}
		const textBlob = candidates.map(m => `${m.role}: ${m.content}`).join('\n\n');
		const fp = createHash('sha256').update(textBlob, 'utf8').digest('hex');
		if (await this.stickyRepository.findOne({ where: { sessionId: session.id, sourceFingerprint: fp } })) {
			await this.reconcileStickyStates(session.id, hSend, rows);
			return;
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
			await this.reconcileStickyStates(session.id, hSend, rows);
			return;
		}
		const compCost = this.agentService.getUserFacingModelCostPerCall(instanceMeta, compModelId);
		if (compCost > 0) {
			const profile = await this.userProfilesRepository.findOneBy({ userId });
			if ((profile?.agentCreditBalance ?? 0) < compCost) {
				await this.reconcileStickyStates(session.id, hSend, rows);
				return;
			}
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
		let summary = textBlob.slice(0, 4000);
		let compressionError: string | null = null;
		try {
			summary = await this.agentService.invokeChatCompletions({
				system: systemPrompt,
				messages: [],
				userText: textBlob.length > maxInput ? textBlob.slice(0, maxInput) : textBlob,
				sessionModelId: compModelId,
				maxTokens: maxOut,
			});
			await this.agentModelUsageService.finishLog(usageLog, instanceMeta, { status: 'success' });
		} catch {
			compressionError = 'COMPRESSION_LLM_FAILED';
			try {
				await this.agentModelUsageService.finishLog(usageLog, instanceMeta, { status: 'failed', errorCode: 'COMPRESSION_LLM' });
			} catch {
				// 忽略结算错误
			}
		}
		await this.stickyRepository.insertOne({
			id: this.agentService.newId(),
			createdAt: now,
			updatedAt: now,
			sessionId: session.id,
			fromMessageId: fromId,
			toMessageId: toId,
			summaryText: summary,
			state: 'dormant',
			userOverridden: false,
			sourceFingerprint: fp,
			errorMessage: compressionError,
			lastModelId: compModelId,
			sortIndex: nextSort,
		});
		await this.reconcileStickyStates(session.id, hSend, rows);
	}
}
