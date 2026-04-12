/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomBytes } from 'node:crypto';
import type { MiMeta } from '@/models/Meta.js';

/** 单条模型：各自完整的 API 与用量配置（无全局 URL/Key 回退） */
export type AgentLlmModelJson = {
	id: string;
	name: string;
	description: string | null;
	baseUrl: string;
	apiKey: string;
	apiModelName: string;
	maxContextTokens: number;
	maxOutputTokensPerCall: number;
};

const DEFAULT_CTX = 8192;
const DEFAULT_OUT = 2048;

/** 管理端保存时为空则分配；与展示名称解耦 */
function allocateAgentLlmModelId(seen: Set<string>): string {
	for (let i = 0; i < 32; i++) {
		const id = `m${randomBytes(12).toString('hex')}`;
		if (!seen.has(id) && id.length <= 64) {
			return id;
		}
	}
	throw new Error('failed to allocate agent LLM model id');
}

function clampInt(n: number, min: number, max: number, fallback: number): number {
	if (!Number.isFinite(n)) return fallback;
	const t = Math.trunc(n);
	if (t < min || t > max) return fallback;
	return t;
}

export function isAgentLlmRunnable(meta: MiMeta): boolean {
	return getEffectiveLlmModels(meta).length > 0;
}

export function getEffectiveLlmModels(meta: MiMeta): AgentLlmModelJson[] {
	const raw = meta.agentLlmModels;
	if (raw == null || !Array.isArray(raw) || raw.length === 0) {
		return [];
	}
	const out: AgentLlmModelJson[] = [];
	for (const m of raw) {
		if (m == null || typeof m !== 'object') continue;
		const o = m as Record<string, unknown>;
		const id = typeof o.id === 'string' ? o.id.trim() : '';
		const name = typeof o.name === 'string' ? o.name.trim() : '';
		const baseUrl = typeof o.baseUrl === 'string' ? o.baseUrl.trim() : '';
		const apiKey = typeof o.apiKey === 'string' ? o.apiKey.trim() : '';
		const apiModelName = typeof o.apiModelName === 'string' ? o.apiModelName.trim() : '';
		if (!id || !name || !baseUrl || !apiKey || !apiModelName) continue;
		if (id.length > 64 || name.length > 256 || baseUrl.length > 512 || apiKey.length > 8192 || apiModelName.length > 256) {
			continue;
		}
		let description: string | null = null;
		if (o.description != null) {
			if (typeof o.description !== 'string') continue;
			const d = o.description.trim();
			if (d.length > 2048) continue;
			description = d === '' ? null : d;
		}
		const maxContextTokens = clampInt(
			typeof o.maxContextTokens === 'number' ? o.maxContextTokens : Number(o.maxContextTokens),
			256,
			2_000_000,
			DEFAULT_CTX,
		);
		const maxOutputTokensPerCall = clampInt(
			typeof o.maxOutputTokensPerCall === 'number' ? o.maxOutputTokensPerCall : Number(o.maxOutputTokensPerCall),
			1,
			128_000,
			DEFAULT_OUT,
		);
		out.push({
			id,
			name,
			description,
			baseUrl,
			apiKey,
			apiModelName,
			maxContextTokens,
			maxOutputTokensPerCall,
		});
	}
	return out;
}

export function packPublicAgentModels(meta: MiMeta): { id: string; name: string; description: string | null; maxContextTokens: number; maxOutputTokensPerCall: number }[] {
	return getEffectiveLlmModels(meta).map(m => ({
		id: m.id,
		name: m.name,
		description: m.description,
		maxContextTokens: m.maxContextTokens,
		maxOutputTokensPerCall: m.maxOutputTokensPerCall,
	}));
}

/** 用于写入 meta 的 agentLlmModels */
export function normalizeAgentLlmModelsParam(input: unknown): { ok: true; value: MiMeta['agentLlmModels'] } | { ok: false } {
	if (input == null) {
		return { ok: true, value: null };
	}
	if (!Array.isArray(input)) {
		return { ok: false };
	}
	if (input.length === 0) {
		return { ok: true, value: null };
	}
	const out: NonNullable<MiMeta['agentLlmModels']> = [];
	const seen = new Set<string>();
	for (const item of input) {
		if (typeof item !== 'object' || item == null) {
			return { ok: false };
		}
		const o = item as Record<string, unknown>;
		let id = typeof o.id === 'string' ? o.id.trim() : '';
		if (id === '') {
			id = allocateAgentLlmModelId(seen);
		}
		const name = typeof o.name === 'string' ? o.name.trim() : '';
		const baseUrl = typeof o.baseUrl === 'string' ? o.baseUrl.trim() : '';
		const apiKey = typeof o.apiKey === 'string' ? o.apiKey.trim() : '';
		const apiModelName = typeof o.apiModelName === 'string' ? o.apiModelName.trim() : '';
		if (id.length > 64 || seen.has(id) || !name || name.length > 256) {
			return { ok: false };
		}
		seen.add(id);
		if (!baseUrl || baseUrl.length > 512 || !apiKey || apiKey.length > 8192) {
			return { ok: false };
		}
		if (!apiModelName || apiModelName.length > 256) {
			return { ok: false };
		}
		let description: string | null = null;
		if (o.description != null) {
			if (typeof o.description !== 'string') {
				return { ok: false };
			}
			const d = o.description.trim();
			if (d.length > 2048) {
				return { ok: false };
			}
			description = d === '' ? null : d;
		}
		const maxContextTokens = typeof o.maxContextTokens === 'number' ? o.maxContextTokens : Number(o.maxContextTokens);
		const maxOutputTokensPerCall = typeof o.maxOutputTokensPerCall === 'number' ? o.maxOutputTokensPerCall : Number(o.maxOutputTokensPerCall);
		if (!Number.isFinite(maxContextTokens) || Math.trunc(maxContextTokens) < 256 || Math.trunc(maxContextTokens) > 2_000_000) {
			return { ok: false };
		}
		if (!Number.isFinite(maxOutputTokensPerCall) || Math.trunc(maxOutputTokensPerCall) < 1 || Math.trunc(maxOutputTokensPerCall) > 128_000) {
			return { ok: false };
		}
		out.push({
			id,
			name,
			description,
			baseUrl,
			apiKey,
			apiModelName,
			maxContextTokens: Math.trunc(maxContextTokens),
			maxOutputTokensPerCall: Math.trunc(maxOutputTokensPerCall),
		});
	}
	return { ok: true, value: out };
}

/** 公开 meta 上展示的「上下文上限」：与默认模型一致，兼容旧客户端字段 */
export function packedAgentMaxContextTokens(meta: MiMeta): number {
	const models = getEffectiveLlmModels(meta);
	if (models.length === 0) return meta.agentMaxContextTokens;
	const defId = meta.agentDefaultModelId?.trim();
	const pick = defId ? models.find(m => m.id === defId) ?? models[0] : models[0];
	return pick?.maxContextTokens ?? meta.agentMaxContextTokens;
}

export function packedAgentMaxOutputTokensPerCall(meta: MiMeta): number {
	const models = getEffectiveLlmModels(meta);
	if (models.length === 0) return meta.agentMaxOutputTokensPerCall;
	const defId = meta.agentDefaultModelId?.trim();
	const pick = defId ? models.find(m => m.id === defId) ?? models[0] : models[0];
	return pick?.maxOutputTokensPerCall ?? meta.agentMaxOutputTokensPerCall;
}
