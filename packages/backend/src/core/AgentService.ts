/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { MiMeta } from '@/models/Meta.js';
import type { AgentCharactersRepository, AgentMessagesRepository, AgentUserStyleSubscriptionsRepository } from '@/models/_.js';
import { MiAgentCharacter } from '@/models/AgentCharacter.js';
import { MiAgentDialogueStyle } from '@/models/AgentDialogueStyle.js';
import { MiAgentMessage } from '@/models/AgentMessage.js';
import { MiAgentSession, type AgentSessionKind } from '@/models/AgentSession.js';
import { assertSafeLlmHttpsUrl, describeUnsafeLlmUrlReason, UnsafeLlmUrlError } from '@/misc/validate-llm-endpoint-url.js';
import { getActiveLlmModels, getEffectiveLlmModels, isAgentLlmRunnable, type AgentLlmModelJson } from '@/misc/agent-llm-models.js';
import { MetaService } from '@/core/MetaService.js';
import { IdService } from '@/core/IdService.js';
import { ApiError } from '@/server/api/error.js';

/** 单字段最大长度（初始版本防滥用） */
export const AGENT_TEXT_FIELD_MAX = 100_000;

/** 示例对话（结构化存储于 character.exampleDialogue JSON） */
export const AGENT_EXAMPLE_TURN_MAX = 24;
export const AGENT_EXAMPLE_TURN_CONTENT_MAX = 8000;
export const AGENT_EXAMPLE_TURNS_CHAR_TOTAL_MAX = 12000;

export type AgentExampleTurn = { role: 'user' | 'assistant'; content: string };

/** 审核状态：广场展示以 publishedVersion 为准；通过后 reviewStatus 为 published */
export type AgentReviewStatus = 'draft' | 'pending' | 'published' | 'rejected';

export type AgentCharacterPublishedSnapshot = {
	name: string;
	summary: string | null;
	personality: string;
	background: string;
	speakingStyle: string;
	greeting: string;
	exampleDialogue: string;
	forbiddenBehavior: string;
	avatarFileId: string | null;
};

export type AgentDialogueStylePublishedSnapshot = {
	name: string;
	body: string;
	summary: string | null;
};

/** system 内 XML 文本节点：避免用户/检索内容里的 & <> 破坏结构 */
export function escapeAgentXmlText(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 长期记忆检索块（拼在 system 末尾）；与 context-window 预留长度一致 */
export const AGENT_LLM_MEMORY_XML_OPEN = '\n\n<long_term_memory source="retrieved">\n';
export const AGENT_LLM_MEMORY_XML_CLOSE = '\n</long_term_memory>';

/** 与 `computeChatHistoryCharBudget` 及对外 Token 展示同一比例：约 N 个 Latin 等效字符按 1 个 Token 粗算。 */
export const AGENT_LLM_APPROX_CHARS_PER_TOKEN = 3;

const STORED_EXAMPLE_DIALOGUE_VERSION = 1 as const;

/** 设为 `1` 或 `true` 时，每次智能体 LLM 请求在服务端控制台打印 OpenAI 风格请求体（含 system 与完整 messages）。临时调试用。 */
function shouldLogAgentsLlmPayload(): boolean {
	const v = process.env.MISSKEY_AGENTS_DEBUG_LLM?.trim().toLowerCase();
	return v === '1' || v === 'true' || v === 'yes';
}

export const agentsErrors = {
	featureDisabled: {
		message: 'Agents feature is disabled.',
		code: 'AGENTS_DISABLED',
		id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
	},
	modelNotConfigured: {
		message: 'LLM is not configured for this instance.',
		code: 'AGENTS_MODEL_NOT_CONFIGURED',
		id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
	},
	llmRequestFailed: {
		message: 'Upstream LLM request failed.',
		code: 'AGENTS_LLM_FAILED',
		id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
	},
	llmUnsafeUrl: {
		message: 'LLM base URL failed security validation.',
		code: 'AGENTS_LLM_UNSAFE_URL',
		id: 'd4e5f6a7-b8c9-0123-def0-234567890123',
	},
	llmAborted: {
		message: 'LLM request was aborted by the client.',
		code: 'AGENTS_LLM_ABORTED',
		id: 'e5f6a7b8-c9d0-1234-ef01-345678901234',
		httpStatusCode: 409,
	},
} as const;

@Injectable()
export class AgentService {
	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.agentUserStyleSubscriptionsRepository)
		private agentUserStyleSubscriptionsRepository: AgentUserStyleSubscriptionsRepository,

		private metaService: MetaService,
		private idService: IdService,
	) {}

	@bindThis
	public assertAgentsEnabled(): void {
		if (!this.meta.agentFeatureEnabled) {
			throw new ApiError(agentsErrors.featureDisabled);
		}
	}

	@bindThis
	public async loadCharacterForAgentSessionOrThrow(session: MiAgentSession): Promise<MiAgentCharacter> {
		const character = await this.agentCharactersRepository.findOneBy({ id: session.characterId });
		if (!character) {
			throw new ApiError({
				message: 'No such character.',
				code: 'NO_SUCH_CHARACTER',
				id: 'a7b8c9d0-e1f2-3456-7890-abcdef012345',
			});
		}
		return character;
	}

	@bindThis
	public assertAgentCharacterNotModerationBanned(character: MiAgentCharacter): void {
		if (character.moderationBanned) {
			throw new ApiError({
				message: 'This character has been suspended by moderators.',
				code: 'AGENT_CHARACTER_MODERATION_BANNED',
				id: 'b8c9d0e1-f2a3-4567-8901-bcdef0123456',
				kind: 'client',
				httpStatusCode: 403,
			});
		}
	}

	@bindThis
	public assertAgentUserSessionChatAllowed(character: MiAgentCharacter, session: MiAgentSession): void {
		this.assertAgentCharacterNotModerationBanned(character);
		if (session.moderationBanned) {
			throw new ApiError({
				message: 'This chat session has been suspended by moderators.',
				code: 'AGENT_SESSION_MODERATION_BANNED',
				id: 'c9d0e1f2-a3b4-5678-9012-cdef01234567',
				kind: 'client',
				httpStatusCode: 403,
			});
		}
	}

	@bindThis
	public assertLlmConfigured(instance: MiMeta): void {
		if (!isAgentLlmRunnable(instance)) {
			throw new ApiError(agentsErrors.modelNotConfigured);
		}
	}

	@bindThis
	private pickModelOrThrow(instance: MiMeta, modelId: string | null): AgentLlmModelJson {
		// 用户侧路径：始终使用未下架的模型，下架模型即视为不存在。
		const models = getActiveLlmModels(instance);
		if (models.length === 0) {
			throw new ApiError(agentsErrors.modelNotConfigured);
		}
		const pick = modelId
			? models.find(m => m.id === modelId)
			: models.find(m => m.id === instance.agentDefaultModelId) ?? models[0];
		if (!pick) {
			throw new ApiError({
				message: 'Invalid LLM model id.',
				code: 'INVALID_PARAM',
				id: 'e1f2a3b4-c5d6-7890-ef01-234567890abc',
			});
		}
		return pick;
	}

	/**
	 * 与会话选用模型（含站点默认）对应的单次扣费，与 {@link pickModelOrThrow} 一致。
	 * 无可用模型或参数非法时返回 0，由后续 LLM 路径再抛出具体错误。
	 */
	@bindThis
	public getUserFacingModelCostPerCall(instance: MiMeta, sessionModelId: string | null): number {
		try {
			this.assertLlmConfigured(instance);
			return this.pickModelOrThrow(instance, sessionModelId).costPerCall;
		} catch {
			return 0;
		}
	}

	/** 管理端或日志上下文：允许按 id 查询任意（含下架）模型元数据；不做可用性断言 */
	@bindThis
	public lookupAnyModelById(instance: MiMeta, modelId: string | null): AgentLlmModelJson | null {
		if (!modelId) return null;
		return getEffectiveLlmModels(instance).find(m => m.id === modelId) ?? null;
	}

	@bindThis
	public resolveModelApiName(instance: MiMeta, modelId: string | null): string {
		this.assertLlmConfigured(instance);
		return this.pickModelOrThrow(instance, modelId).apiModelName;
	}

	@bindThis
	public resolveModelConnection(instance: MiMeta, modelId: string | null): {
		apiModelName: string;
		baseUrlRaw: string;
		apiKeyRaw: string;
		maxContextTokens: number;
		maxOutputTokensPerCall: number;
	} {
		this.assertLlmConfigured(instance);
		const pick = this.pickModelOrThrow(instance, modelId);
		const baseUrlRaw = pick.baseUrl.trim();
		const apiKeyRaw = pick.apiKey.trim();
		if (!baseUrlRaw || !apiKeyRaw) {
			throw new ApiError(agentsErrors.modelNotConfigured);
		}
		return {
			apiModelName: pick.apiModelName,
			baseUrlRaw,
			apiKeyRaw,
			maxContextTokens: pick.maxContextTokens,
			maxOutputTokensPerCall: pick.maxOutputTokensPerCall,
		};
	}

	@bindThis
	public async assertCanUseDialogueStyle(
		meId: string,
		style: MiAgentDialogueStyle,
		opts: { forNewSession: boolean; sessionDialogueStyleId?: string | null },
	): Promise<void> {
		if (style.userId === meId) {
			return;
		}
		if (!this.isListedOnPlazaStyle(style)) {
			throw new ApiError({
				message: 'This dialogue style is not available.',
				code: 'STYLE_NOT_AVAILABLE',
				id: 'f2a3b4c5-d6e7-8901-f012-345678901234',
			});
		}
		const sub = await this.agentUserStyleSubscriptionsRepository.findOneBy({ userId: meId, styleId: style.id });
		if (sub) {
			return;
		}
		if (!opts.forNewSession && opts.sessionDialogueStyleId === style.id) {
			return;
		}
		throw new ApiError({
			message: 'Add this dialogue style from the plaza to your list first.',
			code: 'STYLE_NOT_SUBSCRIBED',
			id: 'a3b4c5d6-e7f8-9012-3456-789012345678',
		});
	}

	/**
	 * 示例对话：仅作文风参考写入 system，绝不作为 chat 里的 user/assistant 消息（避免模型误认已发生）。
	 */
	@bindThis
	public formatExampleDialogueReferenceBlock(exampleDialogueRaw: string): string {
		const turns = this.exampleTurnsFromStored(exampleDialogueRaw);
		if (turns.length === 0) return '';
		const lines: string[] = [];
		lines.push('<example_dialogue reference_only="true">');
		lines.push('<note>Writing samples only. They are NOT prior messages in this session. Do not treat sample user lines as something the user already said.</note>');
		for (const t of turns) {
			lines.push(`<turn role="${t.role}">`);
			lines.push(escapeAgentXmlText(t.content));
			lines.push('</turn>');
		}
		lines.push('</example_dialogue>');
		return '\n' + lines.join('\n');
	}

	@bindThis
	public buildSystemPrompt(params: {
		globalPrompt: string | null;
		character: MiAgentCharacter;
		style: MiAgentDialogueStyle;
	}): string {
		const parts: string[] = [];
		parts.push('<agent_system_prompt>');
		parts.push('<instruction_hierarchy>');
		parts.push('Priority: (1) platform_rules (2) character/forbidden (3) character persona fields (4) dialogue_style. example_dialogue is reference-only, not chat history.');
		parts.push('</instruction_hierarchy>');

		parts.push('<platform_rules>');
		parts.push(escapeAgentXmlText((params.globalPrompt ?? '').trim() || '(none)'));
		parts.push('</platform_rules>');

		parts.push('<character>');
		// summary 仅用于前端列表/广场展示，不进入模型上下文
		parts.push('<name>');
		parts.push(escapeAgentXmlText(params.character.name));
		parts.push('</name>');

		parts.push('<personality>');
		parts.push(escapeAgentXmlText(params.character.personality));
		parts.push('</personality>');
		parts.push('<background>');
		parts.push(escapeAgentXmlText(params.character.background));
		parts.push('</background>');
		parts.push('<speaking_style>');
		parts.push(escapeAgentXmlText(params.character.speakingStyle));
		parts.push('</speaking_style>');

		const ref = this.formatExampleDialogueReferenceBlock(params.character.exampleDialogue);
		if (ref.length > 0) {
			parts.push(ref);
		}

		if (params.character.forbiddenBehavior.trim()) {
			parts.push('<forbidden>');
			parts.push(escapeAgentXmlText(params.character.forbiddenBehavior.trim()));
			parts.push('</forbidden>');
		}
		parts.push('</character>');

		parts.push('<dialogue_style session="current">');
		parts.push(escapeAgentXmlText(params.style.body.trim() || '(default)'));
		parts.push('</dialogue_style>');

		parts.push('</agent_system_prompt>');
		return parts.join('\n');
	}

	@bindThis
	public validateExampleTurnsOrThrow(input: unknown): AgentExampleTurn[] {
		if (input == null) return [];
		if (!Array.isArray(input)) {
			throw new ApiError({
				message: 'exampleTurns must be an array.',
				code: 'INVALID_PARAM',
				id: 'b2c3d4e5-f6a7-8901-bcde-f12345678902',
			});
		}
		if (input.length > AGENT_EXAMPLE_TURN_MAX) {
			throw new ApiError({
				message: `At most ${AGENT_EXAMPLE_TURN_MAX} example dialogue turns.`,
				code: 'INVALID_PARAM',
				id: 'c3d4e5f6-a7b8-9012-cdef-123456789013',
			});
		}
		const out: AgentExampleTurn[] = [];
		let totalChars = 0;
		for (const item of input) {
			if (item == null || typeof item !== 'object') {
				throw new ApiError({
					message: 'Each example turn must be an object with role and content.',
					code: 'INVALID_PARAM',
					id: 'd4e5f6a7-b8c9-0123-def0-234567890124',
				});
			}
			const role = (item as { role?: unknown }).role;
			const content = (item as { content?: unknown }).content;
			if (role !== 'user' && role !== 'assistant') {
				throw new ApiError({
					message: 'Each example turn role must be user or assistant.',
					code: 'INVALID_PARAM',
					id: 'e5f6a7b8-c9d0-1234-ef01-345678901235',
				});
			}
			if (typeof content !== 'string') {
				throw new ApiError({
					message: 'Each example turn content must be a string.',
					code: 'INVALID_PARAM',
					id: 'f6a7b8c9-d0e1-2345-f012-456789012346',
				});
			}
			const c = content.trim();
			if (c.length === 0) continue;
			if (c.length > AGENT_EXAMPLE_TURN_CONTENT_MAX) {
				throw new ApiError({
					message: `Example turn content exceeds ${AGENT_EXAMPLE_TURN_CONTENT_MAX} characters.`,
					code: 'INVALID_PARAM',
					id: 'a7b8c9d0-e1f2-3456-0123-567890123457',
				});
			}
			totalChars += c.length;
			if (totalChars > AGENT_EXAMPLE_TURNS_CHAR_TOTAL_MAX) {
				throw new ApiError({
					message: `Total example dialogue length exceeds ${AGENT_EXAMPLE_TURNS_CHAR_TOTAL_MAX} characters.`,
					code: 'INVALID_PARAM',
					id: 'b8c9d0e1-f2a3-4567-1234-678901234568',
				});
			}
			out.push({ role, content: c });
		}
		return out;
	}

	@bindThis
	public serializeExampleTurns(turns: AgentExampleTurn[]): string {
		return JSON.stringify({ v: STORED_EXAMPLE_DIALOGUE_VERSION, turns });
	}

	/** 从 DB 文本列读取；仅识别本服务写入的 JSON，不做自然语言解析 */
	@bindThis
	public exampleTurnsFromStored(raw: string): AgentExampleTurn[] {
		const t = raw.trim();
		if (!t.startsWith('{')) return [];
		try {
			const o = JSON.parse(t) as { v?: number; turns?: unknown };
			if (o.v !== STORED_EXAMPLE_DIALOGUE_VERSION || !Array.isArray(o.turns)) return [];
			const out: AgentExampleTurn[] = [];
			let totalChars = 0;
			for (const item of o.turns) {
				if (out.length >= AGENT_EXAMPLE_TURN_MAX) break;
				if (item == null || typeof item !== 'object') continue;
				const role = (item as { role?: string }).role;
				const content = (item as { content?: string }).content;
				if (role !== 'user' && role !== 'assistant') continue;
				if (typeof content !== 'string') continue;
				const c = content.trim();
				if (c.length === 0) continue;
				if (c.length > AGENT_EXAMPLE_TURN_CONTENT_MAX) continue;
				if (totalChars + c.length > AGENT_EXAMPLE_TURNS_CHAR_TOTAL_MAX) break;
				out.push({ role, content: c });
				totalChars += c.length;
			}
			return out;
		} catch {
			return [];
		}
	}

	/** 示例对话作为 API 前缀消息的粗略字符量（内容 + 少量 role 包装） */
	@bindThis
	public estimatePrefixMessagesChars(turns: AgentExampleTurn[]): number {
		if (turns.length === 0) return 0;
		const overheadPerMessage = 24;
		return turns.reduce((sum, m) => sum + m.content.length + overheadPerMessage, 0);
	}

	/**
	 * 从模型上下文上限中扣除 system（含长期记忆与示例对话等已拼进 system 的部分）、可选 prefix 消息、以及为本次回复预留的字符后，
	 * 留给历史 user/assistant 轮文的预算。与 invoke 前拼装一致（按约 3 字符 ≈ 1 token 估算）。
	 */
	@bindThis
	public computeChatHistoryCharBudget(params: {
		maxContextTokens: number;
		maxOutputTokensPerCall: number;
		systemChars: number;
		prefixMessages: AgentExampleTurn[];
	}): number {
		const c = AGENT_LLM_APPROX_CHARS_PER_TOKEN;
		const maxContextChars = Math.max(4000, params.maxContextTokens * c);
		const prefixChars = this.estimatePrefixMessagesChars(params.prefixMessages);
		const reserveReply = Math.max(256, Math.min(384_000, params.maxOutputTokensPerCall * c));
		return Math.max(0, maxContextChars - params.systemChars - prefixChars - reserveReply);
	}

	/**
	 * 将 `computeChatHistoryCharBudget` 等路径上的「字符预算」换成为界面展示的 Token 约数（四舍五入，下限 0）。
	 */
	@bindThis
	public approxLlmTokensFromCharEstimate(chars: number): number {
		if (!Number.isFinite(chars) || chars <= 0) return 0;
		return Math.max(0, Math.round(chars / AGENT_LLM_APPROX_CHARS_PER_TOKEN));
	}

	@bindThis
	public async loadRecentMessagesForContextWithMeta(
		sessionId: string,
		maxContextChars: number,
	): Promise<{
		messages: Pick<MiAgentMessage, 'id' | 'role' | 'content'>[];
		truncated: boolean;
		oldestIncludedId: string | null;
	}> {
		const rows = await this.agentMessagesRepository.find({
			where: { sessionId },
			// 与 `AgentCompressionMemoryService.dMapFromRowsNewestFirst` 一致：同刻多条时 id 大的视为更新（与发送顺序一致）
			order: { createdAt: 'DESC', id: 'DESC' },
			take: 500,
			select: ['id', 'role', 'content', 'createdAt'],
		});
		const picked: Pick<MiAgentMessage, 'id' | 'role' | 'content' | 'createdAt'>[] = [];
		let used = 0;
		let truncated = false;
		for (const m of rows) {
			if (m.role === 'system') continue;
			const len = m.content.length;
			if (used + len > maxContextChars) {
				truncated = true;
				break;
			}
			picked.unshift({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt });
			used += len;
		}
		if (!truncated && rows.length >= 500) {
			truncated = true;
		}
		const oldestIncludedId = picked.length > 0 ? picked[0]!.id : null;
		return { messages: picked, truncated, oldestIncludedId };
	}

	@bindThis
	public async loadRecentMessagesForContext(sessionId: string, maxContextChars: number): Promise<Pick<MiAgentMessage, 'role' | 'content'>[]> {
		const { messages } = await this.loadRecentMessagesForContextWithMeta(sessionId, maxContextChars);
		return messages.map(({ role, content }) => ({ role, content }));
	}

	@bindThis
	public normalizeChatCompletionsUrl(baseRaw: string): string {
		const base = baseRaw.trim().replace(/\/$/, '');
		const withV1 = base.endsWith('/v1') ? base : `${base}/v1`;
		return `${withV1}/chat/completions`;
	}

	@bindThis
	public async invokeChatCompletions(params: {
		system: string;
		/** 插在 system 之后、真实历史之前（智能体示例对话已改入 system，此处通常为空） */
		prefixMessages?: { role: 'user' | 'assistant'; content: string }[];
		messages: { role: 'user' | 'assistant'; content: string }[];
		userText: string;
		sessionModelId: string | null;
		/** 由调用方（send endpoint）提供的取消信号；触发时视作用户主动中断 */
		externalAbortSignal?: AbortSignal;
		/** 覆盖本次调用的 max_tokens 上限（仍不超过模型与站点配置） */
		maxTokens?: number;
	}): Promise<string> {
		const instance = await this.metaService.fetch(true);
		this.assertLlmConfigured(instance);
		const { apiModelName, baseUrlRaw, apiKeyRaw, maxOutputTokensPerCall } = this.resolveModelConnection(instance, params.sessionModelId);

		let safeBase: URL;
		try {
			safeBase = await assertSafeLlmHttpsUrl(baseUrlRaw);
		} catch (e) {
			if (e instanceof UnsafeLlmUrlError) {
				throw new ApiError({
					...agentsErrors.llmUnsafeUrl,
					message: `LLM base URL: ${describeUnsafeLlmUrlReason(e.reason)}`,
				});
			}
			throw new ApiError(agentsErrors.llmUnsafeUrl);
		}

		const url = this.normalizeChatCompletionsUrl(safeBase.toString());
		let maxOut = Math.max(1, Math.min(maxOutputTokensPerCall, 128000));
		if (params.maxTokens != null && Number.isFinite(params.maxTokens)) {
			maxOut = Math.max(1, Math.min(maxOut, Math.trunc(params.maxTokens)));
		}
		const prefix = (params.prefixMessages ?? []).map(m => ({ role: m.role, content: m.content }));
		const body = {
			model: apiModelName,
			messages: [
				{ role: 'system' as const, content: params.system },
				...prefix,
				...params.messages.map(m => ({ role: m.role, content: m.content })),
				{ role: 'user' as const, content: params.userText },
			],
			max_tokens: maxOut,
		};

		if (shouldLogAgentsLlmPayload()) {
			const openAiStylePayload = {
				model: body.model,
				messages: body.messages.map(m => ({ role: m.role, content: m.content })),
				max_tokens: body.max_tokens,
			};
			// 服务端终端输出（非浏览器 F12）；与 Chat Completions 请求 JSON 字段一致
			console.log('[MISSKEY_AGENTS_DEBUG_LLM] POST /v1/chat/completions payload:\n' + JSON.stringify(openAiStylePayload, null, 2));
		}

		const ac = new AbortController();
		const t = setTimeout(() => ac.abort(), 120_000);
		const external = params.externalAbortSignal;
		const onExternalAbort = () => ac.abort();
		if (external) {
			if (external.aborted) ac.abort();
			else external.addEventListener('abort', onExternalAbort, { once: true });
		}
		let res: Response;
		try {
			res = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKeyRaw}`,
				},
				body: JSON.stringify(body),
				signal: ac.signal,
			});
		} catch (e) {
			if (external && external.aborted) {
				throw new ApiError(agentsErrors.llmAborted);
			}
			throw new ApiError(agentsErrors.llmRequestFailed);
		} finally {
			clearTimeout(t);
			if (external) external.removeEventListener('abort', onExternalAbort);
		}

		if (!res.ok) {
			throw new ApiError(agentsErrors.llmRequestFailed);
		}

		let json: unknown;
		try {
			json = await res.json();
		} catch {
			throw new ApiError(agentsErrors.llmRequestFailed);
		}

		const choices = (json as { choices?: { message?: { content?: string } }[] }).choices;
		const text = choices?.[0]?.message?.content;
		if (typeof text !== 'string') {
			throw new ApiError(agentsErrors.llmRequestFailed);
		}
		return text;
	}

	/**
	 * 以 (sessionId, clientRequestId) 维度维护当前活跃的 AbortController。
	 * 用户点击对话页的终止按钮后，`agents/messages/abort` 端点通过此表找到并触发 abort。
	 */
	private readonly pendingAbortControllers = new Map<string, AbortController>();

	private makePendingKey(sessionId: string, clientRequestId: string): string {
		return `${sessionId}::${clientRequestId}`;
	}

	@bindThis
	public registerAbortable(sessionId: string, clientRequestId: string): AbortController {
		const ac = new AbortController();
		this.pendingAbortControllers.set(this.makePendingKey(sessionId, clientRequestId), ac);
		return ac;
	}

	@bindThis
	public unregisterAbortable(sessionId: string, clientRequestId: string, ac: AbortController): void {
		const key = this.makePendingKey(sessionId, clientRequestId);
		const current = this.pendingAbortControllers.get(key);
		if (current === ac) {
			this.pendingAbortControllers.delete(key);
		}
	}

	@bindThis
	public abortPending(sessionId: string, clientRequestId: string): boolean {
		const key = this.makePendingKey(sessionId, clientRequestId);
		const ac = this.pendingAbortControllers.get(key);
		if (!ac) return false;
		ac.abort();
		this.pendingAbortControllers.delete(key);
		return true;
	}

	@bindThis
	public isListedOnPlazaCharacter(character: MiAgentCharacter): boolean {
		return character.publishedVersion != null;
	}

	@bindThis
	public isListedOnPlazaStyle(style: MiAgentDialogueStyle): boolean {
		return style.publishedVersion != null;
	}

	@bindThis
	public buildCharacterSnapshotFromRow(row: MiAgentCharacter): AgentCharacterPublishedSnapshot {
		return {
			name: row.name,
			summary: row.summary,
			personality: row.personality,
			background: row.background,
			speakingStyle: row.speakingStyle,
			greeting: row.greeting,
			exampleDialogue: row.exampleDialogue,
			forbiddenBehavior: row.forbiddenBehavior,
			avatarFileId: row.avatarFileId,
		};
	}

	@bindThis
	public buildStyleSnapshotFromRow(row: MiAgentDialogueStyle): AgentDialogueStylePublishedSnapshot {
		return {
			name: row.name,
			body: row.body,
			summary: row.summary,
		};
	}

	/** 已上线版本存在且当前编辑内容与已发布快照一致（无可审核的实质变更） */
	@bindThis
	public isCharacterContentUnchangedFromPublished(row: MiAgentCharacter): boolean {
		if (row.publishedVersion == null || row.publishedSnapshot == null) return false;
		const pub = this.parseCharacterSnapshot(row.publishedSnapshot);
		if (!pub) return false;
		const cur = this.buildCharacterSnapshotFromRow(row);
		return cur.name === pub.name
			&& cur.summary === pub.summary
			&& cur.personality === pub.personality
			&& cur.background === pub.background
			&& cur.speakingStyle === pub.speakingStyle
			&& cur.greeting === pub.greeting
			&& cur.exampleDialogue === pub.exampleDialogue
			&& cur.forbiddenBehavior === pub.forbiddenBehavior
			&& cur.avatarFileId === pub.avatarFileId;
	}

	@bindThis
	public isStyleContentUnchangedFromPublished(row: MiAgentDialogueStyle): boolean {
		if (row.publishedVersion == null || row.publishedSnapshot == null) return false;
		const pub = this.parseStyleSnapshot(row.publishedSnapshot);
		if (!pub) return false;
		const cur = this.buildStyleSnapshotFromRow(row);
		return cur.name === pub.name && cur.body === pub.body && cur.summary === pub.summary;
	}

	@bindThis
	public parseCharacterSnapshot(raw: unknown): AgentCharacterPublishedSnapshot | null {
		if (!raw || typeof raw !== 'object') return null;
		const o = raw as Record<string, unknown>;
		if (typeof o.name !== 'string') return null;
		return {
			name: o.name,
			summary: typeof o.summary === 'string' ? o.summary : null,
			personality: typeof o.personality === 'string' ? o.personality : '',
			background: typeof o.background === 'string' ? o.background : '',
			speakingStyle: typeof o.speakingStyle === 'string' ? o.speakingStyle : '',
			greeting: typeof o.greeting === 'string' ? o.greeting : '',
			exampleDialogue: typeof o.exampleDialogue === 'string' ? o.exampleDialogue : '',
			forbiddenBehavior: typeof o.forbiddenBehavior === 'string' ? o.forbiddenBehavior : '',
			avatarFileId: typeof o.avatarFileId === 'string' ? o.avatarFileId : null,
		};
	}

	@bindThis
	public parseStyleSnapshot(raw: unknown): AgentDialogueStylePublishedSnapshot | null {
		if (!raw || typeof raw !== 'object') return null;
		const o = raw as Record<string, unknown>;
		if (typeof o.name !== 'string' || typeof o.body !== 'string') return null;
		return {
			name: o.name,
			body: o.body,
			summary: typeof o.summary === 'string' ? o.summary : null,
		};
	}

	@bindThis
	public effectiveCharacterForLlm(row: MiAgentCharacter, usePublishedSnapshot: boolean): MiAgentCharacter {
		if (!usePublishedSnapshot) {
			return row;
		}
		if (row.publishedSnapshot == null) {
			throw new ApiError({
				message: 'Published character snapshot is missing.',
				code: 'AGENT_PUBLISHED_UNAVAILABLE',
				id: 'b1c2d3e4-f5a6-7890-bcde-f12345678901',
			});
		}
		const snap = this.parseCharacterSnapshot(row.publishedSnapshot);
		if (!snap) {
			throw new ApiError({
				message: 'Published character snapshot is invalid.',
				code: 'AGENT_PUBLISHED_UNAVAILABLE',
				id: 'c2d3e4f5-a6b7-8901-cdef-123456789012',
			});
		}
		return Object.assign(new MiAgentCharacter(), row, {
			name: snap.name,
			summary: snap.summary,
			personality: snap.personality,
			background: snap.background,
			speakingStyle: snap.speakingStyle,
			greeting: snap.greeting,
			exampleDialogue: snap.exampleDialogue,
			forbiddenBehavior: snap.forbiddenBehavior,
			avatarFileId: snap.avatarFileId,
		});
	}

	@bindThis
	public effectiveStyleForLlm(row: MiAgentDialogueStyle, usePublishedSnapshot: boolean): MiAgentDialogueStyle {
		if (!usePublishedSnapshot) {
			return row;
		}
		if (row.publishedSnapshot == null) {
			throw new ApiError({
				message: 'Published style snapshot is missing.',
				code: 'AGENT_PUBLISHED_UNAVAILABLE',
				id: 'd3e4f5a6-b7c8-9012-def0-234567890123',
			});
		}
		const snap = this.parseStyleSnapshot(row.publishedSnapshot);
		if (!snap) {
			throw new ApiError({
				message: 'Published style snapshot is invalid.',
				code: 'AGENT_PUBLISHED_UNAVAILABLE',
				id: 'e4f5a6b7-c8d9-0123-ef01-345678901234',
			});
		}
		return Object.assign(new MiAgentDialogueStyle(), row, {
			name: snap.name,
			body: snap.body,
			summary: snap.summary,
		});
	}

	/** 同步 isPublished：与「曾在广场上线过」一致，供旧查询与索引使用 */
	/** 广场卡片：始终用已上线快照，避免审核中的草稿泄漏到列表 */
	@bindThis
	public characterPlazaDisplayFields(row: MiAgentCharacter): { name: string; summary: string | null; avatarFileId: string | null } {
		const snap = row.publishedSnapshot != null ? this.parseCharacterSnapshot(row.publishedSnapshot) : null;
		if (snap) {
			return { name: snap.name, summary: snap.summary, avatarFileId: snap.avatarFileId };
		}
		return { name: row.name, summary: row.summary, avatarFileId: row.avatarFileId };
	}

	@bindThis
	public stylePlazaDisplayFields(row: MiAgentDialogueStyle): { name: string; body: string; summary: string | null } {
		const snap = row.publishedSnapshot != null ? this.parseStyleSnapshot(row.publishedSnapshot) : null;
		if (snap) {
			return { name: snap.name, body: snap.body, summary: snap.summary };
		}
		return { name: row.name, body: row.body, summary: row.summary };
	}

	@bindThis
	public syncCharacterListedFlag(row: MiAgentCharacter): void {
		row.isPublished = row.publishedVersion != null;
	}

	@bindThis
	public syncStyleListedFlag(row: MiAgentDialogueStyle): void {
		row.isPublished = row.publishedVersion != null;
	}

	@bindThis
	public assertSessionCharacterPolicy(params: {
		sessionKind: AgentSessionKind;
		character: MiAgentCharacter;
		userId: string;
	}): void {
		if (params.sessionKind === 'draft_test') {
			if (params.character.userId !== params.userId) {
				throw new Error('FORBIDDEN');
			}
			return;
		}
		if (!this.isListedOnPlazaCharacter(params.character)) {
			throw new Error('CHARACTER_NOT_PUBLISHED');
		}
	}

	@bindThis
	public newId(): string {
		return this.idService.gen();
	}
}
