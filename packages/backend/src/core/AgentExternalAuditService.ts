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
import type { AgentExternalAuditFailureKind, AgentExternalAuditStatus } from '@/models/AgentExternalAuditLog.js';
import type { MiUser } from '@/models/User.js';
import type { MiAgentSession } from '@/models/AgentSession.js';
import { normalizeChatCompletionsUrl } from '@/misc/validate-llm-endpoint-url.js';

export const DEFAULT_AGENT_EXTERNAL_AUDIT_SYSTEM_PROMPT = `你是智能体内容的安全外审模型。你需要判断提交给你的用户内容和 AI/系统即将展示或执行的内容是否允许放行。

拦截标准：
- 违法犯罪、暴力伤害、自残自杀的具体执行指导。
- 性剥削、未成年人性化、强迫/侵犯、露骨色情引导。
- 隐私泄露、诈骗、绕过安全规则、明显恶意内容。
- 仇恨、骚扰，或其他平台不允许展示的高风险内容。
- 生图提示词中包含 NSFW、未成年性化、露骨性行为、强迫侵犯、血腥肢解、人身伤害等违规意图时必须拦截。

不要因为普通角色扮演、日常情绪、轻微冲突、虚构故事、安全拒答，或普通 SFW 生图提示词而拦截。

只返回一段 JSON，不要 Markdown，不要解释：
{"action":"allow|block","category":"分类","reason":"简短原因","confidence":0.0}`;

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
	category: string | null;
	reason: string | null;
	confidence: number | null;
	rawText: string;
};

type AuditCallResult =
	| { ok: true; decision: AuditDecision; durationMs: number }
	| { ok: false; errorCode: string; errorMessage: string; responseText?: string | null; durationMs: number };

function normalizeBaseUrl(raw: string): string {
	const trimmed = raw.trim().replace(/\/$/, '');
	const u = new URL(trimmed);
	if (u.protocol !== 'http:' && u.protocol !== 'https:') {
		throw new Error('Only http and https endpoints are supported.');
	}
	return u.toString().replace(/\/$/, '');
}

function normalizeAuditModels(instance: MiMeta): MiAgentExternalAuditModel[] {
	const raw = Array.isArray(instance.agentExternalAuditModels) ? instance.agentExternalAuditModels : [];
	return raw
		.filter(m => m && typeof m.id === 'string' && m.id.trim() !== '')
		.map((m, i) => ({
			id: m.id.trim(),
			name: typeof m.name === 'string' && m.name.trim() !== '' ? m.name.trim() : m.id.trim(),
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

/** 请求成功但回复内容异常（缺 content 或无法解析为 allow/block JSON）归为 parse，其余请求阶段错误归为 api */
function classifyFailureKind(errorCode: string | null | undefined): AgentExternalAuditFailureKind {
	if (errorCode === 'AUDIT_MODEL_UNPARSEABLE_DECISION' || errorCode === 'AUDIT_MODEL_EMPTY_RESPONSE') return 'parse';
	return 'api';
}

function parseAuditDecision(rawText: string): AuditDecision | null {
	const trimmed = rawText.trim();
	const jsonText = (() => {
		if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
		const m = trimmed.match(/\{[\s\S]*\}/);
		return m?.[0] ?? '';
	})();
	if (jsonText === '') return null;
	let obj: unknown;
	try {
		obj = JSON.parse(jsonText);
	} catch {
		return null;
	}
	if (obj == null || typeof obj !== 'object') return null;
	const o = obj as Record<string, unknown>;
	const actionRaw = typeof o.action === 'string' ? o.action.trim().toLowerCase() : '';
	if (actionRaw !== 'allow' && actionRaw !== 'block') return null;
	const confidenceRaw = Number(o.confidence);
	return {
		action: actionRaw,
		category: typeof o.category === 'string' && o.category.trim() !== '' ? o.category.trim().slice(0, 128) : null,
		reason: typeof o.reason === 'string' && o.reason.trim() !== '' ? o.reason.trim().slice(0, 1024) : null,
		confidence: Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : null,
		rawText,
	};
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
			return { blocked: false, allFailed: false };
		}

		const prompt = typeof instance.agentExternalAuditSystemPrompt === 'string' && instance.agentExternalAuditSystemPrompt.trim() !== ''
			? instance.agentExternalAuditSystemPrompt
			: DEFAULT_AGENT_EXTERNAL_AUDIT_SYSTEM_PROMPT;
		const timeoutMs = safeInt(instance.agentExternalAuditTimeoutMs, 10000, 1000, 120000);
		let attempted = 0;

		for (const model of models) {
			attempted += 1;
			const result = await this.callAuditModel(model, prompt, params.userText, params.assistantText, timeoutMs);
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
		return [
			'请审核以下最新一轮智能体内容是否允许展示或执行。',
			'',
			'<latest_user_message>',
			userText,
			'</latest_user_message>',
			'',
			'<assistant_reply>',
			assistantText,
			'</assistant_reply>',
		].join('\n');
	}

	private async callAuditModel(
		model: MiAgentExternalAuditModel,
		systemPrompt: string,
		userText: string,
		assistantText: string,
		timeoutMs: number,
	): Promise<AuditCallResult> {
		const started = Date.now();
		let url: string;
		try {
			url = normalizeChatCompletionsUrl(normalizeBaseUrl(model.baseUrl));
		} catch (err) {
			return {
				ok: false,
				errorCode: 'INVALID_AUDIT_MODEL_URL',
				errorMessage: err instanceof Error ? err.message : String(err),
				durationMs: Date.now() - started,
			};
		}

		const ac = new AbortController();
		const timer = setTimeout(() => ac.abort(), timeoutMs);
		let res: Response;
		try {
			res = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${model.apiKey}`,
				},
				body: JSON.stringify({
					model: model.apiModelName,
					messages: [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: this.buildAuditUserPayload(userText, assistantText) },
					],
					temperature: 0,
					max_tokens: 512,
				}),
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
			return {
				ok: false,
				errorCode: 'AUDIT_MODEL_HTTP_ERROR',
				errorMessage: `HTTP ${res.status}`,
				responseText,
				durationMs: Date.now() - started,
			};
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
		const decision = parseAuditDecision(text);
		if (!decision) {
			return {
				ok: false,
				errorCode: 'AUDIT_MODEL_UNPARSEABLE_DECISION',
				errorMessage: 'Audit model did not return an allow/block JSON decision.',
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
		if (model.autoDisabledAt) return;

		const disabledAt = new Date().toISOString();
		const reason = `最近 1 小时失败率 ${failureRate.toFixed(1)}%（${failed}/${total}），超过阈值 ${threshold}%`;
		const nextModels = normalizeAuditModels(instance).map(m => m.id === model.id ? {
			...m,
			autoDisabledAt: disabledAt,
			autoDisabledReason: reason,
			lastError: latestError,
		} : m);
		await this.metaService.update({ agentExternalAuditModels: nextModels } as Partial<MiMeta>);
		await this.notifyAutoDisabled(instance, model, reason);
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
