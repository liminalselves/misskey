/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { MetaService } from '@/core/MetaService.js';
import { EmailService } from '@/core/EmailService.js';
import type { AgentExternalAuditLogsRepository } from '@/models/_.js';
import type { MiAgentExternalAuditModel, MiMeta } from '@/models/Meta.js';
import type { MiAgentExternalAuditOtherRule, MiAgentExternalAuditRule } from '@/models/AgentExternalAuditRule.js';
import type { AgentExternalAuditFailureKind, AgentExternalAuditStatus } from '@/models/AgentExternalAuditLog.js';
import type { MiUser } from '@/models/User.js';
import type { MiAgentSession } from '@/models/AgentSession.js';
import {
	UnsafeLlmUrlError,
	assertSafeLlmHttpsUrl,
	describeUnsafeLlmUrlReason,
} from '@/misc/validate-llm-endpoint-url.js';
import { isAgentExternalAuditProvider } from '@/models/AgentExternalAuditProvider.js';
import { getAgentExternalAuditProviderDefinition } from '@/core/agent-external-audit-providers.js';
import { DEFAULT_AGENT_EXTERNAL_AUDIT_OTHER_RULE, DEFAULT_AGENT_EXTERNAL_AUDIT_STANDARD, normalizeAgentExternalAuditOtherRule, normalizeAgentExternalAuditRules } from '@/core/agent-external-audit-rules.js';
import { escapeAgentXmlText } from '@/core/AgentService.js';

export const DEFAULT_AGENT_EXTERNAL_AUDIT_SYSTEM_PROMPT = DEFAULT_AGENT_EXTERNAL_AUDIT_STANDARD;

export type AgentExternalAuditResult =
	| { blocked: false; allFailed: boolean }
	| { blocked: true; blockCode: string; category: string | null; reason: string | null; confidence: number | null };

type AuditReplyParams = {
	instance: MiMeta;
	user: MiUser;
	session: MiAgentSession;
	userText: string;
	assistantText: string;
};

type AuditImagePromptParams = {
	instance: MiMeta;
	user: MiUser;
	session: MiAgentSession;
	tag: string;
};

type AuditDecision = {
	action: 'allow' | 'block';
	ruleId: string | null;
	category: string | null;
	reason: string | null;
	confidence: number | null;
	rawText: string;
};

type AuditCallResult =
	| { ok: true; decision: AuditDecision; durationMs: number }
	| { ok: false; errorCode: string; errorMessage: string; responseText?: string | null; durationMs: number };

function normalizeAuditModels(instance: MiMeta): MiAgentExternalAuditModel[] {
	const raw = Array.isArray(instance.agentExternalAuditModels) ? instance.agentExternalAuditModels : [];
	return raw
		.filter(m => m && typeof m.id === 'string' && m.id.trim() !== '')
		.map((m, i) => ({
			id: m.id.trim(),
			name: typeof m.name === 'string' && m.name.trim() !== '' ? m.name.trim() : m.id.trim(),
			provider: isAgentExternalAuditProvider(m.provider) ? m.provider : 'openai',
			apiModelName: typeof m.apiModelName === 'string' ? m.apiModelName.trim() : '',
			baseUrl: typeof m.baseUrl === 'string' ? m.baseUrl.trim() : '',
			apiKey: typeof m.apiKey === 'string' ? m.apiKey.trim() : '',
			priority: Number.isFinite(Number(m.priority)) ? Math.trunc(Number(m.priority)) : i,
			enabled: m.enabled !== false,
			autoDisabledAt: typeof m.autoDisabledAt === 'string' ? m.autoDisabledAt : null,
			autoDisabledReason: typeof m.autoDisabledReason === 'string' ? m.autoDisabledReason : null,
			lastError: typeof m.lastError === 'string' ? m.lastError : null,
		}))
		.filter(m => m.apiModelName !== '' && m.baseUrl !== '' && m.apiKey !== '')
		.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

function safeInt(v: unknown, fallback: number, min: number, max: number): number {
	const n = Math.trunc(Number(v));
	if (!Number.isFinite(n)) return fallback;
	return Math.max(min, Math.min(max, n));
}

function safePercent(v: unknown, fallback: number): number {
	return safeInt(v, fallback, 1, 100);
}

function clipText(text: string | null | undefined, max: number): string | null {
	if (text == null) return null;
	return text.length > max ? `${text.slice(0, max)}...` : text;
}

function parseNotifyEmails(raw: string | null | undefined): string[] {
	if (!raw) return [];
	return [...new Set(raw.split(/[,\n;]/g).map(x => x.trim()).filter(x => x.includes('@')))];
}

/** 请求成功但回复内容异常（缺 content 或无法解析为结构化审核结论）归为 parse，其余请求阶段错误归为 api */
function classifyFailureKind(errorCode: string | null | undefined): AgentExternalAuditFailureKind {
	if (errorCode === 'AUDIT_MODEL_UNPARSEABLE_DECISION' || errorCode === 'AUDIT_MODEL_EMPTY_RESPONSE') return 'parse';
	return 'api';
}

/** 从模型输出中提取第一个完整 JSON 对象（忽略字符串字面量内的花括号，容忍前后散文与多段大括号文本） */
function extractFirstJsonObject(text: string): string | null {
	const start = text.indexOf('{');
	if (start < 0) return null;
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (ch === '\\') {
				escaped = true;
			} else if (ch === '"') {
				inString = false;
			}
			continue;
		}
		if (ch === '"') {
			inString = true;
		} else if (ch === '{') {
			depth++;
		} else if (ch === '}') {
			depth--;
			if (depth === 0) return text.slice(start, i + 1);
		}
	}
	return null;
}

function buildRuleMap(rules: MiAgentExternalAuditRule[]): Map<string, MiAgentExternalAuditRule> {
	return new Map(rules.filter(rule => rule.enabled).map(rule => [rule.id, rule]));
}

function normalizeDecision(ruleId: string, dynamicReason: string | null, confidence: number | null, rawText: string, rules: MiAgentExternalAuditRule[], otherRule: MiAgentExternalAuditOtherRule): AuditDecision {
	if (ruleId === 'allow') return { action: 'allow', ruleId: null, category: null, reason: null, confidence, rawText };
	const rule = buildRuleMap(rules).get(ruleId);
	if (rule) return { action: 'block', ruleId: rule.id, category: rule.name, reason: rule.reason, confidence, rawText };
	return {
		action: 'block',
		ruleId: 'other_high_risk',
		category: '其他高风险内容',
		reason: dynamicReason?.trim().slice(0, 1024) || otherRule.reason,
		confidence,
		rawText,
	};
}

export function buildOpenAiAuditPrompt(standard: string, rules: MiAgentExternalAuditRule[], otherRule: MiAgentExternalAuditOtherRule): string {
	const entries = rules.filter(rule => rule.enabled).map(rule => `- ${rule.id}｜${rule.name}\n  判断标准：${rule.criteria}\n  固定原因：${rule.reason}`).join('\n');
	return `${standard.trim()}\n\n总体判断标准中如包含旧的输出格式、category 或自由分类要求，一律忽略，以以下结构化条目和最终 JSON 格式为准。\n\n违规条目：\n${entries || '（当前没有启用的普通违规条目）'}\n- other_high_risk｜其他高风险内容\n  判断标准：${otherRule.criteria}\n\n必须只返回一段 JSON，不要 Markdown，不要解释：\n{"action":"allow|block","ruleId":"命中的条目 ID；放行时为 allow；无法归类时为 other_high_risk","reason":"仅选择 other_high_risk 时填写简短具体原因，其他情况留空","confidence":0.0}\n\n命中普通条目时必须返回其 ID，不要改写条目名或固定原因。确属高风险但没有对应条目时选择 other_high_risk。`;
}

export function buildAliyunAuditCriteria(rules: MiAgentExternalAuditRule[], otherRule: MiAgentExternalAuditOtherRule): Record<string, string> {
	return {
		allow: '允许放行，不符合任何违规条目。',
		...Object.fromEntries(rules.filter(rule => rule.enabled).map(rule => [rule.id, `${rule.name}：${rule.criteria}`])),
		other_high_risk: `其他高风险内容：${otherRule.criteria}`,
	};
}

export function parseOpenAiAuditDecision(rawText: string, rules: MiAgentExternalAuditRule[], otherRule: MiAgentExternalAuditOtherRule): AuditDecision | null {
	const jsonText = extractFirstJsonObject(rawText.trim());
	if (jsonText == null) return null;
	let obj: unknown;
	try {
		obj = JSON.parse(jsonText);
	} catch {
		return null;
	}
	if (obj == null || typeof obj !== 'object') return null;
	const o = obj as Record<string, unknown>;
	const action = typeof o.action === 'string' ? o.action.trim().toLowerCase() : '';
	if (action !== 'allow' && action !== 'block') return null;
	const confidenceRaw = Number(o.confidence);
	const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : null;
	if (action === 'allow') return normalizeDecision('allow', null, confidence, rawText, rules, otherRule);
	const ruleId = typeof o.ruleId === 'string' ? o.ruleId.trim() : 'other_high_risk';
	const reason = typeof o.reason === 'string' ? o.reason : null;
	return normalizeDecision(ruleId, reason, confidence, rawText, rules, otherRule);
}

export function parseAliyunAuditDecision(json: unknown, rawText: string, rules: MiAgentExternalAuditRule[], otherRule: MiAgentExternalAuditOtherRule): AuditDecision | null {
	if (json == null || typeof json !== 'object') return null;
	const answer = (json as { answers?: Record<string, unknown> }).answers?.content_safety;
	if (answer == null || typeof answer !== 'object') return null;
	const choice = (answer as { choice?: unknown }).choice;
	if (typeof choice !== 'string' || choice.trim() === '') return null;
	const confidenceRaw = Number((answer as { confidence?: unknown }).confidence);
	const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : null;
	return normalizeDecision(choice.trim(), null, confidence, rawText, rules, otherRule);
}

/**
 * 阿里云在决策模型判断前对输入做平台级内容检查；待审内容命中时请求以 400 DataInspectionFailed 拒绝，
 * 而不是返回 block 决策。把该信号归一化为拦截，避免真正违规的内容因 API 失败被 fail-open 放行。
 */
export function parseAliyunInspectionBlocked(json: unknown, rawText: string, otherRule: MiAgentExternalAuditOtherRule): AuditDecision | null {
	if (json == null || typeof json !== 'object') return null;
	if ((json as { code?: unknown }).code !== 'DataInspectionFailed') return null;
	return normalizeDecision('other_high_risk', null, null, rawText, [], otherRule);
}

function htmlEscape(s: string): string {
	return s.replace(/[&<>"']/g, ch => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;',
	}[ch] ?? ch));
}

@Injectable()
export class AgentExternalAuditService {
	constructor(
		@Inject(DI.agentExternalAuditLogsRepository)
		private agentExternalAuditLogsRepository: AgentExternalAuditLogsRepository,

		private idService: IdService,
		private metaService: MetaService,
		private emailService: EmailService,
	) {}

	@bindThis
	public getDefaultSystemPrompt(): string {
		return DEFAULT_AGENT_EXTERNAL_AUDIT_SYSTEM_PROMPT;
	}

	@bindThis
	public listConfiguredModels(instance: MiMeta, includeInactive = false): MiAgentExternalAuditModel[] {
		const models = normalizeAuditModels(instance);
		if (includeInactive) return models;
		return models.filter(m => m.enabled !== false && !m.autoDisabledAt);
	}

	@bindThis
	public async auditReply(params: AuditReplyParams): Promise<AgentExternalAuditResult> {
		const instance = params.instance;
		if (instance.agentExternalAuditEnabled !== true) {
			return { blocked: false, allFailed: false };
		}
		const models = this.listConfiguredModels(instance);
		if (models.length === 0) {
			// 开关开着但没有可用模型（未配置/配置不完整/全部熔断禁用）→ 放行但必须留下运营可见的痕迹
			await this.logNoAvailableModels(params);
			return { blocked: false, allFailed: true };
		}

			const standard = typeof instance.agentExternalAuditSystemPrompt === 'string' && instance.agentExternalAuditSystemPrompt.trim() !== ''
				? instance.agentExternalAuditSystemPrompt
				: DEFAULT_AGENT_EXTERNAL_AUDIT_STANDARD;
			const rules = normalizeAgentExternalAuditRules(instance.agentExternalAuditRules);
			const otherRule = normalizeAgentExternalAuditOtherRule(instance.agentExternalAuditOtherRule);
			const timeoutMs = safeInt(instance.agentExternalAuditTimeoutMs, 10000, 1000, 120000);
		let attempted = 0;

		for (const model of models) {
			attempted += 1;
				const result = await this.callAuditModel(model, standard, rules, otherRule, params.userText, params.assistantText, timeoutMs);
			if (!result.ok) {
				await this.recordAttempt({
					params,
					model,
					status: 'failed',
					attemptIndex: attempted,
					durationMs: result.durationMs,
					responseText: result.responseText ?? null,
					errorCode: result.errorCode,
					errorMessage: result.errorMessage,
				});
				await this.disableModelIfUnhealthy(instance, model, result.errorMessage);
				continue;
			}

			if (result.decision.action === 'block') {
				const blockCode = this.newBlockCode();
				await this.recordAttempt({
					params,
					model,
					status: 'block',
					attemptIndex: attempted,
					durationMs: result.durationMs,
					blockCode,
					category: result.decision.category,
					reason: result.decision.reason,
					confidence: result.decision.confidence,
					responseText: result.decision.rawText,
					includeTexts: true,
				});
				return {
					blocked: true,
					blockCode,
					category: result.decision.category,
					reason: result.decision.reason,
					confidence: result.decision.confidence,
				};
			}

			await this.recordAttempt({
				params,
				model,
				status: 'allow',
				attemptIndex: attempted,
				durationMs: result.durationMs,
				category: result.decision.category,
				reason: result.decision.reason,
				confidence: result.decision.confidence,
				responseText: result.decision.rawText,
			});
			return { blocked: false, allFailed: false };
		}

		if (attempted > 0) {
			await this.agentExternalAuditLogsRepository.insertOne({
				id: this.idService.gen(),
				createdAt: new Date(),
				completedAt: new Date(),
				durationMs: null,
				userId: params.user.id,
				sessionId: params.session.id,
				characterId: params.session.characterId,
				dialogueStyleId: params.session.dialogueStyleId,
				modelId: null,
				modelName: null,
				apiModelName: null,
				baseUrl: null,
				priority: 0,
				attemptIndex: attempted,
				status: 'all_failed',
				blockCode: null,
				category: null,
				reason: null,
				confidence: null,
				userText: null,
				assistantText: null,
				responseText: null,
				failureKind: null,
				errorCode: 'ALL_AUDIT_MODELS_FAILED',
				errorMessage: 'All external audit models failed; reply was allowed by fail-open policy.',
			});
		}
		return { blocked: false, allFailed: true };
	}

	/**
	 * 外审开启但无可用模型时记录一条 all_failed 日志；按小时节流，避免每条消息都写一行。
	 * 该状态通常是配置问题（全部熔断禁用/字段缺失），管理端可通过 status=all_failed 过滤看到。
	 */
	private async logNoAvailableModels(params: AuditReplyParams): Promise<void> {
		const since = new Date(Date.now() - 60 * 60 * 1000);
		const recent = await this.agentExternalAuditLogsRepository
			.createQueryBuilder('log')
			.select('log.id', 'id')
			.where('log.status = :status', { status: 'all_failed' })
			.andWhere('log.errorCode = :errorCode', { errorCode: 'NO_AUDIT_MODELS_AVAILABLE' })
			.andWhere('log.createdAt >= :since', { since })
			.limit(1)
			.getRawOne();
		if (recent) return;
		const now = new Date();
		await this.agentExternalAuditLogsRepository.insertOne({
			id: this.idService.gen(),
			createdAt: now,
			completedAt: now,
			durationMs: null,
			userId: params.user.id,
			sessionId: params.session.id,
			characterId: params.session.characterId,
			dialogueStyleId: params.session.dialogueStyleId,
			modelId: null,
			modelName: null,
			apiModelName: null,
			baseUrl: null,
			priority: 0,
			attemptIndex: 0,
			status: 'all_failed',
			blockCode: null,
			category: null,
			reason: null,
			confidence: null,
			userText: null,
			assistantText: null,
			responseText: null,
			failureKind: null,
			errorCode: 'NO_AUDIT_MODELS_AVAILABLE',
			errorMessage: 'External audit is enabled but no usable model is configured (none valid or all auto-disabled); content was allowed without audit.',
		});
	}

	@bindThis
	public async auditImagePrompt(params: AuditImagePromptParams): Promise<AgentExternalAuditResult> {
		const tag = params.tag.trim();
		return await this.auditReply({
			instance: params.instance,
			user: params.user,
			session: params.session,
			userText: '用户在智能体生图测试界面请求生成图片。',
			assistantText: [
				'系统即将使用以下正向提示词生成并展示图片。请判断该提示词是否允许用于生成图片。',
				tag,
			].join('\n'),
		});
	}

	private buildAuditUserPayload(userText: string, assistantText: string): string {
		// 被审内容可能含用户输入（如生图 tag），转义尖括号防止伪造闭合标签逃逸出审核区块
		return [
			'请审核以下最新一轮智能体内容是否允许展示或执行。',
			'',
			'<latest_user_message>',
			escapeAgentXmlText(userText),
			'</latest_user_message>',
			'',
			'<assistant_reply>',
			escapeAgentXmlText(assistantText),
			'</assistant_reply>',
		].join('\n');
	}

	private async callAuditModel(
		model: MiAgentExternalAuditModel,
		standard: string,
		rules: MiAgentExternalAuditRule[],
		otherRule: MiAgentExternalAuditOtherRule,
		userText: string,
		assistantText: string,
		timeoutMs: number,
	): Promise<AuditCallResult> {
		const started = Date.now();
		let url: string;
		try {
			// 与其它 LLM/生图/视觉链路一致：强制 https、禁内网与元数据地址（含 DNS 解析校验）
			const u = await assertSafeLlmHttpsUrl(model.baseUrl);
			const provider = getAgentExternalAuditProviderDefinition(model.provider ?? 'openai');
			provider.validateUrl(u);
			url = provider.normalizeUrl(u);
		} catch (err) {
			return {
				ok: false,
				errorCode: 'INVALID_AUDIT_MODEL_URL',
				errorMessage: err instanceof UnsafeLlmUrlError ? describeUnsafeLlmUrlReason(err.reason) : (err instanceof Error ? err.message : String(err)),
				durationMs: Date.now() - started,
			};
		}

		const ac = new AbortController();
		const timer = setTimeout(() => ac.abort(), timeoutMs);
		let res: Response;
		try {
			const body = model.provider === 'aliyun-decision'
				? {
					model: model.apiModelName,
					state: this.buildAuditUserPayload(userText, assistantText),
					questions: {
						content_safety: {
							type: 'choice',
							instructions: `${standard.trim()}\n\n总体判断标准中如包含旧的输出格式或自由分类要求，一律忽略。请仅从 criteria 提供的选项中选择唯一结论。`,
							criteria: buildAliyunAuditCriteria(rules, otherRule),
						},
					},
				}
				: {
					model: model.apiModelName,
					messages: [
						{ role: 'system', content: buildOpenAiAuditPrompt(standard, rules, otherRule) },
						{ role: 'user', content: this.buildAuditUserPayload(userText, assistantText) },
					],
					temperature: 0,
					max_tokens: 1024,
				};
			res = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${model.apiKey}`,
				},
				body: JSON.stringify(body),
				signal: ac.signal,
			});
		} catch (err) {
			clearTimeout(timer);
			return {
				ok: false,
				errorCode: ac.signal.aborted ? 'AUDIT_MODEL_TIMEOUT' : 'AUDIT_MODEL_REQUEST_FAILED',
				errorMessage: err instanceof Error ? err.message : String(err),
				durationMs: Date.now() - started,
			};
		}
		clearTimeout(timer);

		let responseText: string | null = null;
		let json: unknown;
		try {
			responseText = await res.text();
			json = JSON.parse(responseText);
		} catch (err) {
			return {
				ok: false,
				errorCode: 'AUDIT_MODEL_BAD_JSON',
				errorMessage: err instanceof Error ? err.message : String(err),
				responseText,
				durationMs: Date.now() - started,
			};
		}

		if (!res.ok) {
			if (model.provider === 'aliyun-decision' && res.status === 400) {
				const decision = parseAliyunInspectionBlocked(json, responseText ?? '', otherRule);
				if (decision) return { ok: true, decision, durationMs: Date.now() - started };
			}
			return {
				ok: false,
				errorCode: 'AUDIT_MODEL_HTTP_ERROR',
				errorMessage: `HTTP ${res.status}`,
				responseText,
				durationMs: Date.now() - started,
			};
		}

		if (model.provider === 'aliyun-decision') {
			const decision = parseAliyunAuditDecision(json, responseText ?? '', rules, otherRule);
			if (!decision) {
				return {
					ok: false,
					errorCode: 'AUDIT_MODEL_UNPARSEABLE_DECISION',
					errorMessage: 'Missing or invalid answers.content_safety.choice.',
					responseText,
					durationMs: Date.now() - started,
				};
			}
			return { ok: true, decision, durationMs: Date.now() - started };
		}

		const text = (json as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content;
		if (typeof text !== 'string') {
			return {
				ok: false,
				errorCode: 'AUDIT_MODEL_EMPTY_RESPONSE',
				errorMessage: 'Missing choices[0].message.content.',
				responseText,
				durationMs: Date.now() - started,
			};
		}
		const decision = parseOpenAiAuditDecision(text, rules, otherRule);
		if (!decision) {
			return {
				ok: false,
				errorCode: 'AUDIT_MODEL_UNPARSEABLE_DECISION',
				errorMessage: 'Audit model did not return a structured allow/block decision.',
				responseText: text,
				durationMs: Date.now() - started,
			};
		}
		return { ok: true, decision, durationMs: Date.now() - started };
	}

	private newBlockCode(): string {
		const d = new Date();
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		return `AG-AUD-${yyyy}${mm}${dd}-${this.idService.gen().slice(-8).toUpperCase()}`;
	}

	private async recordAttempt(params: {
		params: AuditReplyParams;
		model: MiAgentExternalAuditModel;
		status: AgentExternalAuditStatus;
		attemptIndex: number;
		durationMs: number;
		blockCode?: string | null;
		category?: string | null;
		reason?: string | null;
		confidence?: number | null;
		responseText?: string | null;
		errorCode?: string | null;
		errorMessage?: string | null;
		includeTexts?: boolean;
	}): Promise<void> {
		const now = new Date();
		const started = new Date(now.getTime() - Math.max(0, params.durationMs));
		await this.agentExternalAuditLogsRepository.insertOne({
			id: this.idService.gen(),
			createdAt: started,
			completedAt: now,
			durationMs: Math.max(0, Math.trunc(params.durationMs)),
			userId: params.params.user.id,
			sessionId: params.params.session.id,
			characterId: params.params.session.characterId,
			dialogueStyleId: params.params.session.dialogueStyleId,
			modelId: params.model.id,
			modelName: params.model.name,
			apiModelName: params.model.apiModelName,
			baseUrl: params.model.baseUrl,
			priority: params.model.priority,
			attemptIndex: params.attemptIndex,
			status: params.status,
			blockCode: params.blockCode ?? null,
			category: params.category ?? null,
			reason: params.reason ?? null,
			confidence: params.confidence ?? null,
			userText: params.includeTexts ? params.params.userText : null,
			assistantText: params.includeTexts ? params.params.assistantText : null,
			responseText: clipText(params.responseText ?? null, 12000),
			failureKind: params.status === 'failed' ? classifyFailureKind(params.errorCode) : null,
			errorCode: params.errorCode ?? null,
			errorMessage: params.errorMessage ? clipText(params.errorMessage, 1024) : null,
		});
	}

	private async disableModelIfUnhealthy(instance: MiMeta, model: MiAgentExternalAuditModel, latestError: string): Promise<void> {
		const minRequests = safeInt(instance.agentExternalAuditFailureMinRequests, 10, 1, 100000);
		const threshold = safePercent(instance.agentExternalAuditFailureThresholdPercent, 60);
		const since = new Date(Date.now() - 60 * 60 * 1000);
		const rows = await this.agentExternalAuditLogsRepository.createQueryBuilder('log')
			.select('log.status', 'status')
			.addSelect('COUNT(*)::int', 'count')
			.where('log.modelId = :modelId', { modelId: model.id })
			.andWhere('log.createdAt >= :since', { since })
			.andWhere('log.status IN (:...statuses)', { statuses: ['allow', 'block', 'failed'] })
			.groupBy('log.status')
			.getRawMany<{ status: AgentExternalAuditStatus; count: number }>();
		let total = 0;
		let failed = 0;
		for (const row of rows) {
			const count = Number(row.count) || 0;
			total += count;
			if (row.status === 'failed') failed += count;
		}
		if (total < minRequests) return;
		const failureRate = (failed / total) * 100;
		if (failureRate <= threshold) return;

		// 基于最新快照写回：请求期间管理员可能增删改模型、并发请求可能熔断其它模型，
		// 若直接用入参的陈旧快照整体替换 jsonb 数组会丢失这些修改
		const fresh = await this.metaService.fetch(true);
		const freshModels = normalizeAuditModels(fresh);
		const target = freshModels.find(m => m.id === model.id);
		if (!target || target.autoDisabledAt) return;

		const disabledAt = new Date().toISOString();
		const reason = `最近 1 小时失败率 ${failureRate.toFixed(1)}%（${failed}/${total}），超过阈值 ${threshold}%`;
		const nextModels = freshModels.map(m => m.id === model.id ? {
			...m,
			autoDisabledAt: disabledAt,
			autoDisabledReason: reason,
			lastError: latestError,
		} : m);
		await this.metaService.update({ agentExternalAuditModels: nextModels } as Partial<MiMeta>);
		// 邮件发送不阻塞用户回复主路径
		void this.notifyAutoDisabled(fresh, model, reason).catch(() => {});
	}

	private async notifyAutoDisabled(instance: MiMeta, model: MiAgentExternalAuditModel, reason: string): Promise<void> {
		const emails = parseNotifyEmails(instance.agentExternalAuditNotifyEmails);
		if (emails.length === 0) return;
		const subject = `智能体外部审核模型已自动禁用：${model.name}`;
		const text = [
			`模型：${model.name}`,
			`ID：${model.id}`,
			`上游模型：${model.apiModelName}`,
			`Base URL：${model.baseUrl}`,
			`原因：${reason}`,
		].join('\n');
		const html = `<p>智能体外部审核模型已自动禁用。</p><ul><li>模型：${htmlEscape(model.name)}</li><li>ID：${htmlEscape(model.id)}</li><li>上游模型：${htmlEscape(model.apiModelName)}</li><li>Base URL：${htmlEscape(model.baseUrl)}</li><li>原因：${htmlEscape(reason)}</li></ul>`;
		for (const email of emails) {
			try {
				await this.emailService.sendEmail(email, subject, html, text);
			} catch {
				// 邮件失败不能影响用户侧 failover / fail-open。
			}
		}
	}
}
