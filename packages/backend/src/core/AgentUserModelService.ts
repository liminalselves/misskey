/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import type { AgentUserModelsRepository } from '@/models/_.js';
import { MiAgentUserModel } from '@/models/AgentUserModel.js';
import { MetaService } from '@/core/MetaService.js';
import { ApiError } from '@/server/api/error.js';
import { getEffectiveLlmModels } from '@/misc/agent-llm-models.js';
import { assertSafeLlmHttpsUrl, describeUnsafeLlmUrlReason, hrefForStoredLlmBaseUrl, normalizeLlmHttpsBaseUrlInput, UnsafeLlmUrlError } from '@/misc/validate-llm-endpoint-url.js';

/** 用户自定义模型 id 前缀（区别于官方模型 `m<hex>`） */
export const AGENT_USER_MODEL_ID_PREFIX = 'u';

export function isAgentUserModelId(modelId: string | null | undefined): boolean {
	return typeof modelId === 'string' && modelId.startsWith(AGENT_USER_MODEL_ID_PREFIX);
}

export type AgentUserModelPack = {
	id: string;
	name: string;
	baseUrl: string;
	apiModelName: string;
	maxContextTokens: number;
	maxOutputTokensPerCall: number;
	tokenizerEncoding: string | null;
	charsPerToken: number | null;
	providerId: string | null;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
};

export type AgentUserModelConnection = {
	apiModelName: string;
	baseUrlRaw: string;
	apiKeyRaw: string;
	maxContextTokens: number;
	maxOutputTokensPerCall: number;
	charsPerToken: number;
	tokenizerEncoding: string | null;
};

const DEFAULT_CTX = 8192;
const DEFAULT_OUT = 2048;
const AGENT_LLM_APPROX_CHARS_PER_TOKEN = 3;

function clampInt(n: number, min: number, max: number, fallback: number): number {
	if (!Number.isFinite(n)) return fallback;
	const t = Math.trunc(n);
	if (t < min || t > max) return fallback;
	return t;
}

/** 半设置提供商模板（meta.agentByokProviders[]） */
export type AgentByokProviderJson = {
	id: string;
	name: string;
	description?: string | null;
	baseUrl: string;
	apiModelName?: string | null;
	maxContextTokens?: number;
	maxOutputTokensPerCall?: number;
	tokenizerEncoding?: string | null;
	charsPerToken?: number;
};

/** 管理端保存半设置提供商时分配 id */
export function allocateAgentByokProviderId(seen: Set<string>): string {
	for (let i = 0; i < 32; i++) {
		const id = `p${randomBytes(12).toString('hex')}`;
		if (!seen.has(id) && id.length <= 64) {
			return id;
		}
	}
	throw new Error('failed to allocate agent byok provider id');
}

/**
 * 管理端保存 `meta.agentByokProviders` 的校验与归一化。
 */
export function normalizeAgentByokProvidersParam(input: unknown): { ok: true; value: NonNullable<import('@/models/Meta.js').MiMeta['agentByokProviders']> | null } | { ok: false } {
	if (input == null) {
		return { ok: true, value: null };
	}
	if (!Array.isArray(input)) {
		return { ok: false };
	}
	if (input.length === 0) {
		return { ok: true, value: null };
	}
	const out: NonNullable<import('@/models/Meta.js').MiMeta['agentByokProviders']> = [];
	const seen = new Set<string>();
	for (const item of input) {
		if (typeof item !== 'object' || item == null) return { ok: false };
		const o = item as Record<string, unknown>;
		let id = typeof o.id === 'string' ? o.id.trim() : '';
		if (id === '') id = allocateAgentByokProviderId(seen);
		const name = typeof o.name === 'string' ? o.name.trim() : '';
		const baseUrl = typeof o.baseUrl === 'string' ? o.baseUrl.trim() : '';
		if (id.length > 64 || seen.has(id) || !name || name.length > 256) return { ok: false };
		seen.add(id);
		if (!baseUrl || baseUrl.length > 512) return { ok: false };
		let description: string | null = null;
		if (o.description != null) {
			if (typeof o.description !== 'string') return { ok: false };
			const d = o.description.trim();
			if (d.length > 2048) return { ok: false };
			description = d === '' ? null : d;
		}
		let apiModelName: string | null = null;
		if (o.apiModelName != null) {
			if (typeof o.apiModelName !== 'string') return { ok: false };
			const a = o.apiModelName.trim();
			if (a.length > 256) return { ok: false };
			apiModelName = a === '' ? null : a;
		}
		const maxContextTokens = o.maxContextTokens == null ? undefined : clampInt(Number(o.maxContextTokens), 256, 2_000_000, DEFAULT_CTX);
		const maxOutputTokensPerCall = o.maxOutputTokensPerCall == null ? undefined : clampInt(Number(o.maxOutputTokensPerCall), 1, 128_000, DEFAULT_OUT);
		let tokenizerEncoding: string | null = null;
		if (o.tokenizerEncoding != null) {
			if (typeof o.tokenizerEncoding !== 'string') return { ok: false };
			const te = o.tokenizerEncoding.trim();
			if (te.length > 64) return { ok: false };
			tokenizerEncoding = te === '' ? null : te;
		}
		const charsPerToken = o.charsPerToken == null
			? undefined
			: (() => {
				const v = Number(o.charsPerToken);
				if (!Number.isFinite(v)) return undefined;
				const t = Math.trunc(v);
				return t >= 1 && t <= 10 ? t : undefined;
			})();
		out.push({
			id,
			name,
			description,
			baseUrl,
			apiModelName,
			maxContextTokens,
			maxOutputTokensPerCall,
			tokenizerEncoding,
			charsPerToken,
		});
	}
	return { ok: true, value: out };
}

/**
 * 用户自定义模型（BYOK）服务：CRUD、名称唯一校验、SSRF 校验、调用连接解析。
 * BYOK 模型调用不扣平台信用、不消耗官方免费额度，仅计入用量统计与请求日志。
 */
@Injectable()
export class AgentUserModelService {
	constructor(
		@Inject(DI.agentUserModelsRepository)
		private agentUserModelsRepository: AgentUserModelsRepository,

		private metaService: MetaService,
	) {}

	@bindThis
	public async assertByokEnabled(): Promise<void> {
		const meta = await this.metaService.fetch(true);
		if (!meta.agentByokEnabled) {
			throw new ApiError({
				message: 'BYOK is not enabled on this instance.',
				code: 'AGENT_BYOK_DISABLED',
				id: 'a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c',
				kind: 'client',
				httpStatusCode: 403,
			});
		}
	}

	@bindThis
	private allocateId(): string {
		return `${AGENT_USER_MODEL_ID_PREFIX}${randomBytes(12).toString('hex')}`;
	}

	@bindThis
	public pack(model: MiAgentUserModel): AgentUserModelPack {
		return {
			id: model.id,
			name: model.name,
			baseUrl: model.baseUrl,
			apiModelName: model.apiModelName,
			maxContextTokens: model.maxContextTokens,
			maxOutputTokensPerCall: model.maxOutputTokensPerCall,
			tokenizerEncoding: model.tokenizerEncoding,
			charsPerToken: model.charsPerToken,
			providerId: model.providerId,
			enabled: model.enabled,
			createdAt: model.createdAt.toISOString(),
			updatedAt: model.updatedAt.toISOString(),
		};
	}

	/** 名称唯一校验：同一用户内不重复，且不与官方模型名重复 */
	@bindThis
	public async assertNameAvailable(userId: string, name: string, excludeId?: string): Promise<void> {
		const t = name.trim();
		const existing = await this.agentUserModelsRepository.findOneBy({ userId, name: t });
		if (existing && existing.id !== excludeId) {
			throw new ApiError({
				message: 'A model with this name already exists.',
				code: 'AGENT_USER_MODEL_NAME_TAKEN',
				id: 'b2c3d4e5-f6a7-48b9-0c1d-2e3f4a5b6c7d',
				kind: 'client',
				httpStatusCode: 400,
			});
		}
		const meta = await this.metaService.fetch(true);
		const officialNames = getEffectiveLlmModels(meta).map(m => m.name);
		if (officialNames.includes(t)) {
			throw new ApiError({
				message: 'A model with this name already exists.',
				code: 'AGENT_USER_MODEL_NAME_CONFLICTS_OFFICIAL',
				id: 'c3d4e5f6-a7b8-49c0-1d2e-3f4a5b6c7d8e',
				kind: 'client',
				httpStatusCode: 400,
			});
		}
	}

	@bindThis
	public async list(userId: string): Promise<AgentUserModelPack[]> {
		const rows = await this.agentUserModelsRepository.find({ where: { userId }, order: { createdAt: 'DESC' } });
		return rows.map(r => this.pack(r));
	}

	@bindThis
	public async getOwnedOrThrow(userId: string, modelId: string): Promise<MiAgentUserModel> {
		const row = await this.agentUserModelsRepository.findOneBy({ id: modelId, userId });
		if (!row) {
			throw new ApiError({
				message: 'No such user model.',
				code: 'NO_SUCH_AGENT_USER_MODEL',
				id: 'd4e5f6a7-b8c9-4ad0-1e2f-3a4b5c6d7e8f',
				kind: 'client',
				httpStatusCode: 404,
			});
		}
		return row;
	}

	@bindThis
	public async create(userId: string, params: {
		name: string;
		baseUrl: string;
		apiKey: string;
		apiModelName: string;
		maxContextTokens?: number;
		maxOutputTokensPerCall?: number;
		tokenizerEncoding?: string | null;
		charsPerToken?: number | null;
		providerId?: string | null;
	}): Promise<AgentUserModelPack> {
		await this.assertByokEnabled();
		const meta = await this.metaService.fetch(true);
		const limit = Math.max(1, Math.min(500, meta.agentByokMaxUserModels ?? 20));
		const count = await this.agentUserModelsRepository.countBy({ userId, enabled: true });
		if (count >= limit) {
			throw new ApiError({
				message: 'You have reached the user model limit.',
				code: 'AGENT_USER_MODEL_LIMIT',
				id: 'e5f6a7b8-c9d0-4be1-2f3a-4b5c6d7e8f90',
				kind: 'client',
				httpStatusCode: 400,
			});
		}
		const name = params.name.trim();
		if (!name || name.length > 256) {
			throw new ApiError({
				message: 'Invalid model name.',
				code: 'INVALID_PARAM',
				id: 'f6a7b8c9-d0e1-4cf2-3a4b-5c6d7e8f90a1',
			});
		}
		await this.assertNameAvailable(userId, name);
		const baseUrlRaw = params.baseUrl.trim();
		if (!baseUrlRaw) {
			throw new ApiError({
				message: 'Invalid base URL.',
				code: 'INVALID_PARAM',
				id: 'a7b8c9d0-e1f2-4ad3-4b5c-6d7e8f90a1b2',
			});
		}
		let safeBase: URL;
		try {
			safeBase = await assertSafeLlmHttpsUrl(baseUrlRaw);
		} catch (e) {
			const detail = e instanceof UnsafeLlmUrlError
				? describeUnsafeLlmUrlReason(e.reason)
				: (e instanceof Error ? e.message : String(e));
			throw new ApiError({
				message: `BYOK base URL: ${detail}`,
				code: 'INVALID_PARAM',
				id: 'b8c9d0e1-f2a3-4be4-5c6d-7e8f90a1b2c3',
			});
		}
		const apiKey = params.apiKey.trim();
		if (!apiKey) {
			throw new ApiError({
				message: 'API key is required.',
				code: 'INVALID_PARAM',
				id: 'c9d0e1f2-a3b4-4cf5-6d7e-8f90a1b2c3d4',
			});
		}
		const apiModelName = params.apiModelName.trim();
		if (!apiModelName || apiModelName.length > 256) {
			throw new ApiError({
				message: 'Invalid API model name.',
				code: 'INVALID_PARAM',
				id: 'd0e1f2a3-b4c5-4ad6-7e8f-90a1b2c3d4e5',
			});
		}
		const maxContextTokens = clampInt(Number(params.maxContextTokens), 256, 2_000_000, DEFAULT_CTX);
		const maxOutputTokensPerCall = clampInt(Number(params.maxOutputTokensPerCall), 1, 128_000, DEFAULT_OUT);
		const tokenizerEncoding = typeof params.tokenizerEncoding === 'string' && params.tokenizerEncoding.trim()
			? params.tokenizerEncoding.trim().slice(0, 64)
			: null;
		const charsPerTokenRaw = Number(params.charsPerToken);
		const charsPerToken = Number.isFinite(charsPerTokenRaw)
			? (() => {
				const t = Math.trunc(charsPerTokenRaw);
				return t >= 1 && t <= 10 ? t : null;
			})()
			: null;
		const providerId = typeof params.providerId === 'string' && params.providerId.trim() ? params.providerId.trim().slice(0, 64) : null;

		const now = new Date();
		const row = await this.agentUserModelsRepository.insertOne({
			id: this.allocateId(),
			userId,
			name,
			baseUrl: hrefForStoredLlmBaseUrl(safeBase),
			apiKey,
			apiModelName,
			maxContextTokens,
			maxOutputTokensPerCall,
			tokenizerEncoding,
			charsPerToken,
			providerId,
			enabled: true,
			createdAt: now,
			updatedAt: now,
		});
		return this.pack(row);
	}

	@bindThis
	public async update(userId: string, modelId: string, params: {
		name?: string;
		baseUrl?: string;
		apiKey?: string;
		apiModelName?: string;
		maxContextTokens?: number;
		maxOutputTokensPerCall?: number;
		tokenizerEncoding?: string | null;
		charsPerToken?: number | null;
		providerId?: string | null;
		enabled?: boolean;
	}): Promise<AgentUserModelPack> {
		await this.assertByokEnabled();
		const row = await this.getOwnedOrThrow(userId, modelId);
		const meta = await this.metaService.fetch(true);

		if (params.name !== undefined) {
			const name = params.name.trim();
			if (!name || name.length > 256) {
				throw new ApiError({
					message: 'Invalid model name.',
					code: 'INVALID_PARAM',
					id: 'e0f1a2b3-c4d5-4ae7-8f90-a1b2c3d4e5f6',
				});
			}
			await this.assertNameAvailable(userId, name, modelId);
			row.name = name;
		}
		if (params.baseUrl !== undefined) {
			const baseUrlRaw = params.baseUrl.trim();
			if (!baseUrlRaw) {
				throw new ApiError({
					message: 'Invalid base URL.',
					code: 'INVALID_PARAM',
					id: 'f1a2b3c4-d5e6-4bf8-90a1-b2c3d4e5f6a7',
				});
			}
			let safeBase: URL;
			try {
				safeBase = await assertSafeLlmHttpsUrl(baseUrlRaw);
			} catch (e) {
				const detail = e instanceof UnsafeLlmUrlError
					? describeUnsafeLlmUrlReason(e.reason)
					: (e instanceof Error ? e.message : String(e));
				throw new ApiError({
					message: `BYOK base URL: ${detail}`,
					code: 'INVALID_PARAM',
					id: 'a2b3c4d5-e6f7-4ac9-1b2c-3d4e5f6a7b8c',
				});
			}
			row.baseUrl = hrefForStoredLlmBaseUrl(safeBase);
		}
		if (params.apiKey !== undefined) {
			const apiKey = params.apiKey.trim();
			if (!apiKey) {
				throw new ApiError({
					message: 'API key is required.',
					code: 'INVALID_PARAM',
					id: 'b3c4d5e6-f7a8-4bd0-2c3d-4e5f6a7b8c9d',
				});
			}
			row.apiKey = apiKey;
		}
		if (params.apiModelName !== undefined) {
			const apiModelName = params.apiModelName.trim();
			if (!apiModelName || apiModelName.length > 256) {
				throw new ApiError({
					message: 'Invalid API model name.',
					code: 'INVALID_PARAM',
					id: 'c4d5e6f7-a8b9-4ce1-3d4e-5f6a7b8c9d0e',
				});
			}
			row.apiModelName = apiModelName;
		}
		if (params.maxContextTokens !== undefined) {
			row.maxContextTokens = clampInt(Number(params.maxContextTokens), 256, 2_000_000, row.maxContextTokens);
		}
		if (params.maxOutputTokensPerCall !== undefined) {
			row.maxOutputTokensPerCall = clampInt(Number(params.maxOutputTokensPerCall), 1, 128_000, row.maxOutputTokensPerCall);
		}
		if (params.tokenizerEncoding !== undefined) {
			row.tokenizerEncoding = typeof params.tokenizerEncoding === 'string' && params.tokenizerEncoding.trim()
				? params.tokenizerEncoding.trim().slice(0, 64)
				: null;
		}
		if (params.charsPerToken !== undefined) {
			const v = Number(params.charsPerToken);
			row.charsPerToken = Number.isFinite(v) && Math.trunc(v) >= 1 && Math.trunc(v) <= 10 ? Math.trunc(v) : null;
		}
		if (params.providerId !== undefined) {
			row.providerId = typeof params.providerId === 'string' && params.providerId.trim() ? params.providerId.trim().slice(0, 64) : null;
		}
		if (params.enabled !== undefined) {
			row.enabled = Boolean(params.enabled);
		}
		row.updatedAt = new Date();
		const saved = await this.agentUserModelsRepository.save(row);
		return this.pack(saved);
	}

	@bindThis
	public async delete(userId: string, modelId: string): Promise<void> {
		await this.assertByokEnabled();
		await this.getOwnedOrThrow(userId, modelId);
		await this.agentUserModelsRepository.delete({ id: modelId, userId });
	}

	/**
	 * 调用链路连接解析：仅用于用户模型。若模型 id 不是用户模型或不可用则抛错。
	 * 注意：不含 SSRF 再校验（创建时已校验），但每次请求仍会走 AgentService.invokeChatCompletions 的 SSRF 闸门。
	 */
	@bindThis
	public async resolveConnection(userId: string, modelId: string): Promise<AgentUserModelConnection> {
		const row = await this.getOwnedOrThrow(userId, modelId);
		if (!row.enabled) {
			throw new ApiError({
				message: 'This user model is disabled.',
				code: 'AGENT_USER_MODEL_DISABLED',
				id: 'd5e6f7a8-b9c0-4df2-4e5f-6a7b8c9d0e1f',
				kind: 'client',
				httpStatusCode: 400,
			});
		}
		const baseUrlRaw = row.baseUrl.trim();
		const apiKeyRaw = row.apiKey?.trim() ?? '';
		if (!baseUrlRaw || !apiKeyRaw) {
			throw new ApiError({
				message: 'This user model is misconfigured.',
				code: 'AGENT_USER_MODEL_MISCONFIGURED',
				id: 'e6f7a8b9-c0d1-4af3-5f6a-7b8c9d0e1f2a',
				kind: 'client',
				httpStatusCode: 400,
			});
		}
		return {
			apiModelName: row.apiModelName,
			baseUrlRaw,
			apiKeyRaw,
			maxContextTokens: row.maxContextTokens,
			maxOutputTokensPerCall: row.maxOutputTokensPerCall,
			charsPerToken: Number.isFinite(row.charsPerToken) && row.charsPerToken! >= 1 ? row.charsPerToken! : AGENT_LLM_APPROX_CHARS_PER_TOKEN,
			tokenizerEncoding: row.tokenizerEncoding,
		};
	}
}
