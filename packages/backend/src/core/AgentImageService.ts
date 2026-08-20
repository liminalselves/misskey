/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { DriveService } from '@/core/DriveService.js';
import { MetaService } from '@/core/MetaService.js';
import { AgentModelUsageService } from '@/core/AgentModelUsageService.js';
import { RoleService } from '@/core/RoleService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import type { MiAgentImageDefaultParams, MiAgentImageModel, MiAgentImageToken, MiMeta } from '@/models/Meta.js';
import type { MiUser } from '@/models/User.js';
import { MiDriveFolder } from '@/models/DriveFolder.js';
import type { AgentCharactersRepository, AgentImageGenerationsRepository, DriveFilesRepository, DriveFoldersRepository, UserProfilesRepository } from '@/models/_.js';
import { ApiError } from '@/server/api/error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { assertSafeLlmHttpsUrl, describeUnsafeLlmUrlReason, UnsafeLlmUrlError } from '@/misc/validate-llm-endpoint-url.js';
import { readBodyWithLimit, UpstreamBodyTooLargeError } from '@/misc/read-body-with-limit.js';
import { getAgentImagePreset } from './agent-image-presets.js';
import { resolveAgentImageNegativePrompt } from './agent-image-defaults.js';

export type AgentImageSize = 'portrait' | 'landscape' | 'square';

export type AgentDrawRequest = {
	tag: string;
	size: AgentImageSize;
};

type FetchImageParams = {
	user: MiUser;
	instance: MiMeta;
	imageModel: MiAgentImageModel;
	token?: MiAgentImageToken;
	tag: string;
	size: AgentImageSize;
	imageSettings?: Record<string, unknown> | null;
	referenceImages?: AgentReferenceImage[];
};

export type AgentReferenceImage = {
	contentType: string;
	data: Buffer;
};

const AGENT_DRAW_RE = /\[\[agent_draw(?:\s+size=(portrait|landscape|square))?\s+tag=([\s\S]*?)\]\]/g;

// 宽松匹配 [[agent_draw ...]]（含缺参/畸形变体），用于生图关闭时的输出过滤
const AGENT_DRAW_ANY_RE = /\[\[agent_draw\b[\s\S]*?\]\]/iu;
const AGENT_DRAW_ANY_RE_G = /\[\[agent_draw\b[\s\S]*?\]\]/giu;

export const agentImageErrors = {
	disabled: {
		message: 'Agent image generation is disabled.',
		code: 'AGENT_IMAGE_DISABLED',
		id: '0e7c38a8-7b74-41a1-97a6-4f25155c8bd2',
	},
	notConfigured: {
		message: 'Agent image generation is not configured.',
		code: 'AGENT_IMAGE_NOT_CONFIGURED',
		id: '54c41eaa-0994-45b7-a5b9-4df5c6c944aa',
	},
	insufficientCredit: {
		message: 'Insufficient agent credit for image generation.',
		code: 'AGENT_IMAGE_INSUFFICIENT_CREDIT',
		id: 'b21eec6d-77f7-4461-b26c-a8b37f735f3c',
		httpStatusCode: 402,
	},
	upstreamFailed: {
		message: 'Upstream image generation failed.',
		code: 'AGENT_IMAGE_UPSTREAM_FAILED',
		id: 'fd9f54ea-fd79-4f56-9db2-ff97f8920a62',
	},
	noFreeDriveSpace: {
		message: 'Cannot save generated image because your Drive has no free space.',
		code: 'AGENT_IMAGE_NO_FREE_DRIVE_SPACE',
		id: '58b7fb72-2228-41e5-9f7d-b59bcd4a1e2f',
	},
	maxFileSizeExceeded: {
		message: 'Cannot save generated image because it exceeds the maximum file size.',
		code: 'AGENT_IMAGE_MAX_FILE_SIZE_EXCEEDED',
		id: 'a113e6b4-4742-4505-9f84-006b5e4800c2',
		httpStatusCode: 413,
	},
	unallowedFileType: {
		message: 'Cannot save generated image because its file type is not allowed.',
		code: 'AGENT_IMAGE_UNALLOWED_FILE_TYPE',
		id: '3562e0fb-dcf7-42bc-bb2d-c641bca6a6b9',
	},
} as const;

const NON_RETRIABLE_GENERATION_ERROR_CODES = new Set<string>([
	agentImageErrors.noFreeDriveSpace.code,
	agentImageErrors.maxFileSizeExceeded.code,
	agentImageErrors.unallowedFileType.code,
]);

const AGENT_IMAGE_DIAGNOSTIC_MAX_LENGTH = 600;
/** Aurora 余额查询超时与响应体上限（用户生图请求路径会同步等待余额刷新） */
const TOKEN_BALANCE_TIMEOUT_MS = 15_000;
const TOKEN_BALANCE_BODY_LIMIT_BYTES = 1024 * 1024;
/** 生成图片二进制读取上限（storeGeneratedImage 亦按 20MiB 拒绝） */
const GENERATED_IMAGE_BODY_LIMIT_BYTES = 20 * 1024 * 1024;
/** OpenAI 兼容生图 JSON 响应上限（内含 base64 时约为图片体积的 1.33 倍） */
const OPENAI_IMAGE_JSON_BODY_LIMIT_BYTES = 40 * 1024 * 1024;

function sanitizeAgentImageDiagnostic(raw: string): string {
	const sanitized = raw
		.replace(/(["']?(?:x-api-key|api[_-]?key|authorization)["']?\s*[:=]\s*)(?:Bearer\s+)?["']?[^\s,;"'}]+/gi, '$1[redacted]')
		.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
		.replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b/gi, '[redacted]')
		.replace(/([?&](?:x-api-key|api[_-]?key|authorization)=)[^&#\s]+/gi, '$1[redacted]')
		.replace(/https?:\/\/[^\s"'<>]+/gi, '[redacted URL]')
		.replace(/\s+/g, ' ')
		.trim();
	return sanitized.slice(0, AGENT_IMAGE_DIAGNOSTIC_MAX_LENGTH);
}

function upstreamImageError(diagnostic: string): ApiError {
	return new ApiError(agentImageErrors.upstreamFailed, { diagnostic: sanitizeAgentImageDiagnostic(diagnostic) });
}

export function getAgentImageErrorDiagnostic(err: unknown): string | null {
	if (!(err instanceof ApiError) || typeof err.info?.diagnostic !== 'string') return null;
	const diagnostic = sanitizeAgentImageDiagnostic(err.info.diagnostic);
	return diagnostic === '' ? null : diagnostic;
}

async function describeImageUpstreamHttpError(res: Response): Promise<string> {
	let raw = '';
	try {
		raw = (await readBodyWithLimit(res, 64 * 1024)).toString('utf8');
	} catch {
		raw = '';
	}
	let detail = '';
	if (raw.trim() !== '') {
		try {
			const body = JSON.parse(raw) as { error?: { message?: unknown; code?: unknown }; message?: unknown; detail?: unknown };
			const message = body.error?.message ?? body.message ?? body.detail;
			const providerCode = body.error?.code;
			if (typeof message === 'string') detail = message;
			if (typeof providerCode === 'string' && providerCode.trim() !== '') {
				detail = detail === '' ? providerCode : `${providerCode}: ${detail}`;
			}
		} catch {
			detail = raw;
		}
	}
	return detail.trim() === '' ? `Upstream returned HTTP ${res.status}.` : `Upstream returned HTTP ${res.status}: ${detail}`;
}

function describeImageRequestFailure(err: unknown, timedOut: boolean): string {
	if (timedOut) return 'Upstream request timed out after 180 seconds.';
	const message = err instanceof Error ? err.message : 'Unknown network error.';
	return `Upstream request failed: ${message}`;
}

function normalizeSize(size: string | null | undefined): AgentImageSize {
	return size === 'landscape' || size === 'square' || size === 'portrait' ? size : 'portrait';
}

export function openAiImageSize(size: AgentImageSize): string {
	switch (size) {
		case 'portrait': return '1024x1536';
		case 'landscape': return '1536x1024';
		case 'square': return '1024x1024';
	}
}

function referenceImageDataUrl(referenceImage: AgentReferenceImage): string {
	return `data:${referenceImage.contentType};base64,${referenceImage.data.toString('base64')}`;
}

function normalizeReferenceImages(referenceImages?: AgentReferenceImage | AgentReferenceImage[] | null): AgentReferenceImage[] {
	if (referenceImages == null) return [];
	return (Array.isArray(referenceImages) ? referenceImages : [referenceImages]).slice(0, 4);
}

export function buildOpenAiImageGenerationRequest(model: string, prompt: string, size: AgentImageSize, referenceImages?: AgentReferenceImage | AgentReferenceImage[] | null): Record<string, unknown> {
	const images = normalizeReferenceImages(referenceImages).map(referenceImageDataUrl);
	return {
		model,
		prompt,
		n: 1,
		size: openAiImageSize(size),
		...(images.length === 1 ? { image: images[0] } : images.length > 1 ? { image: images } : {}),
	};
}

export function buildOpenAiImageGenerationRequestInit(apiKey: string, model: string, prompt: string, size: AgentImageSize, referenceImages?: AgentReferenceImage | AgentReferenceImage[] | null): {
	method: 'POST';
	headers: Record<string, string>;
	body: string;
} {
	return {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(buildOpenAiImageGenerationRequest(model, prompt, size, referenceImages)),
	};
}

export function buildOpenAiChatImageGenerationRequest(model: string, prompt: string, referenceImages?: AgentReferenceImage | AgentReferenceImage[] | null): Record<string, unknown> {
	const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];
	for (const referenceImage of normalizeReferenceImages(referenceImages)) {
		content.push({ type: 'image_url', image_url: { url: referenceImageDataUrl(referenceImage) } });
	}
	return {
		model,
		stream: false,
		messages: [{ role: 'user', content }],
	};
}

export function buildOpenAiChatImageGenerationRequestInit(apiKey: string, model: string, prompt: string, referenceImages?: AgentReferenceImage | AgentReferenceImage[] | null): {
	method: 'POST';
	headers: Record<string, string>;
	body: string;
} {
	return {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(buildOpenAiChatImageGenerationRequest(model, prompt, referenceImages)),
	};
}

export type OpenAiImageResult =
	| { type: 'base64'; value: string }
	| { type: 'url'; value: string };

export function parseOpenAiImageResult(value: unknown): OpenAiImageResult {
	if (value == null || typeof value !== 'object') throw new Error('Invalid OpenAI image response.');
	const data = (value as { data?: unknown }).data;
	if (!Array.isArray(data) || data.length === 0 || data[0] == null || typeof data[0] !== 'object') {
		throw new Error('OpenAI image response has no image data.');
	}
	const first = data[0] as { b64_json?: unknown; url?: unknown };
	if (typeof first.b64_json === 'string' && first.b64_json.trim() !== '') {
		return { type: 'base64', value: first.b64_json.trim() };
	}
	if (typeof first.url === 'string' && first.url.trim() !== '') {
		return { type: 'url', value: first.url.trim() };
	}
	throw new Error('OpenAI image response has no supported image value.');
}

export function parseOpenAiChatImageResult(value: unknown): OpenAiImageResult {
	try {
		return parseOpenAiImageResult(value);
	} catch {
		// Some OpenAI-compatible gateways return the generated image in chat content.
	}
	const message = (value as { choices?: Array<{ message?: { content?: unknown; image_url?: unknown; images?: unknown } }> })?.choices?.[0]?.message;
	const content = message?.content;
	const contentImageUrl = Array.isArray(content)
		? content.find(item => typeof item === 'object' && item != null && typeof (item as { image_url?: { url?: unknown } }).image_url?.url === 'string') as { image_url: { url: string } } | undefined
		: undefined;
	const messageImageUrl = typeof (message?.image_url as { url?: unknown } | undefined)?.url === 'string'
		? (message?.image_url as { url: string }).url
		: Array.isArray(message?.images) && typeof (message.images[0] as { url?: unknown } | undefined)?.url === 'string'
			? (message.images[0] as { url: string }).url
			: null;
	const text = typeof content === 'string'
		? content.trim()
		: Array.isArray(content)
			? content.map(item => typeof item === 'object' && item != null ? String((item as { text?: unknown }).text ?? '') : '').join('').trim()
			: '';
	const markdownUrl = text.match(/!\[[^\]]*\]\((?:https:\/\/|data:image\/)[^)\s]+\)/)?.[0]?.replace(/^!\[[^\]]*\]\(|\)$/g, '');
	const candidate = contentImageUrl?.image_url.url ?? messageImageUrl ?? markdownUrl ?? text;
	const dataUrl = candidate.match(/^data:image\/[^;]+;base64,([A-Za-z0-9+/=\s]+)$/i)?.[1];
	if (dataUrl) return { type: 'base64', value: dataUrl };
	if (/^https:\/\//i.test(candidate)) return { type: 'url', value: candidate };
	if (/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(candidate)) {
		return { type: 'base64', value: candidate };
	}
	throw new Error('OpenAI chat response has no supported image value.');
}

export function qwenImageSize(size: AgentImageSize): string {
	switch (size) {
		case 'portrait': return '1728*2368'; // 3:4
		case 'landscape': return '2368*1728'; // 4:3
		case 'square': return '2048*2048'; // 1:1
	}
}

export function buildQwenImageGenerationRequest(model: string, prompt: string, negativePrompt: string | null, size: AgentImageSize): Record<string, unknown> {
	return {
		model,
		input: { prompt },
		parameters: {
			n: 1,
			size: qwenImageSize(size),
			...(negativePrompt != null && negativePrompt.trim() !== '' ? { negative_prompt: negativePrompt.trim().slice(0, 500) } : {}),
		},
	};
}

export function buildQwenImageGenerationRequestInit(apiKey: string, model: string, prompt: string, negativePrompt: string | null, size: AgentImageSize): {
	method: 'POST';
	headers: Record<string, string>;
	body: string;
} {
	return {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(buildQwenImageGenerationRequest(model, prompt, negativePrompt, size)),
	};
}

export function parseQwenImageResult(value: unknown): OpenAiImageResult {
	if (value == null || typeof value !== 'object') throw new Error('Invalid Qwen image response.');
	const output = (value as { output?: unknown }).output;
	if (output == null || typeof output !== 'object') throw new Error('Qwen image response has no output.');
	const o = output as { task_status?: unknown; results?: unknown };
	const status = typeof o.task_status === 'string' ? o.task_status.trim().toLowerCase() : '';
	if (status !== '' && status !== 'succeeded' && status !== 'success') {
		throw new Error(`Qwen image task did not succeed (task_status: ${o.task_status}).`);
	}
	const results = Array.isArray(o.results) ? o.results : [];
	const first = results.find(item => {
		if (typeof item === 'string' && item.trim() !== '') return true;
		return typeof item === 'object' && item != null && typeof (item as { url?: unknown }).url === 'string' && (item as { url: string }).url.trim() !== '';
	});
	if (typeof first === 'string') return { type: 'url', value: first.trim() };
	if (typeof first === 'object' && first != null) return { type: 'url', value: (first as { url: string }).url.trim() };
	throw new Error('Qwen image response has no image URL in output.results.');
}

function safeNumber(v: unknown, fallback: number, min: number, max: number): number {
	const n = Number(v);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(min, Math.min(max, n));
}

function contentTypeExt(contentType: string | null): string {
	const mime = (contentType ?? '').split(';')[0]?.trim().toLowerCase();
	if (mime === 'image/jpeg') return 'jpg';
	if (mime === 'image/webp') return 'webp';
	if (mime === 'image/gif') return 'gif';
	return 'png';
}

function maskToken(token: string): string {
	if (token.length <= 12) return '********';
	return `${token.slice(0, 8)}****${token.slice(-4)}`;
}

function normalizeImageParams(raw: unknown): MiAgentImageDefaultParams {
	return raw != null && typeof raw === 'object' ? raw as MiAgentImageDefaultParams : {};
}

function normalizeImageSettings(raw: unknown): MiAgentImageDefaultParams & { artistPresetId?: string | null } {
	return raw != null && typeof raw === 'object' ? raw as MiAgentImageDefaultParams & { artistPresetId?: string | null } : {};
}

@Injectable()
export class AgentImageService {
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.driveFoldersRepository)
		private driveFoldersRepository: DriveFoldersRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.agentImageGenerationsRepository)
		private agentImageGenerationsRepository: AgentImageGenerationsRepository,

		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		private idService: IdService,
		private driveService: DriveService,
		private driveFileEntityService: DriveFileEntityService,
		private metaService: MetaService,
		private roleService: RoleService,
		private agentModelUsageService: AgentModelUsageService,
	) {}

	@bindThis
	public async fetchMetaForImageGeneration(): Promise<MiMeta> {
		return await this.metaService.fetch(true);
	}

	@bindThis
	public listAvailableImageModels(instance: MiMeta, includeDisabled = false): MiAgentImageModel[] {
		const configured = Array.isArray(instance.agentImageModels) ? instance.agentImageModels : [];
		const models = configured
			.filter(m => typeof m?.id === 'string' && m.id.trim() !== '' && (m.provider === 'aurora' || m.provider === 'openai' || m.provider === 'qwen'))
			.map(m => ({
				id: m.id.trim(),
				name: typeof m.name === 'string' && m.name.trim() !== '' ? m.name.trim() : m.id.trim(),
				description: typeof m.description === 'string' && m.description.trim() !== '' ? m.description.trim() : null,
				provider: m.provider,
				enabled: m.enabled !== false,
				apiModelName: typeof m.apiModelName === 'string' && m.apiModelName.trim() !== '' ? m.apiModelName.trim() : instance.agentImageDefaultModel,
				apiUrl: typeof m.apiUrl === 'string' && m.apiUrl.trim() !== '' ? m.apiUrl.trim() : null,
				apiKey: typeof m.apiKey === 'string' && m.apiKey.trim() !== '' ? m.apiKey.trim() : null,
				supportsReferenceImage: m.provider === 'openai' && m.supportsReferenceImage === true,
				costPerCall: typeof m.costPerCall === 'number' ? m.costPerCall : instance.agentImageCostPerCall,
				dailyFreeQuota: typeof m.dailyFreeQuota === 'number' && m.dailyFreeQuota > 0 ? Math.trunc(m.dailyFreeQuota) : null,
				defaultParams: normalizeImageParams(m.defaultParams ?? instance.agentImageDefaultParams),
				defaultArtistPresetId: typeof m.defaultArtistPresetId === 'string' ? m.defaultArtistPresetId : instance.agentImageDefaultArtistPresetId,
			}));
		const enabledModels = includeDisabled ? models : models.filter(m => m.enabled !== false);
		return enabledModels;
	}

	@bindThis
	public resolveImageModel(instance: MiMeta, modelId: string | null | undefined): MiAgentImageModel | null {
		if (modelId == null || modelId.trim() === '') return null;
		return this.listAvailableImageModels(instance).find(m => m.id === modelId.trim()) ?? null;
	}

	@bindThis
	public parseDrawPlaceholders(text: string): AgentDrawRequest[] {
		const out: AgentDrawRequest[] = [];
		for (const m of text.matchAll(AGENT_DRAW_RE)) {
			const tag = (m[2] ?? '').trim().replace(/\s+/g, ' ');
			if (tag.length === 0) continue;
			out.push({ size: normalizeSize(m[1]), tag: tag.slice(0, 4000) });
		}
		return out;
	}

	/**
	 * 生图关闭（会话生图模型为「无」）时，从最新回复中整体移除 [[agent_draw ...]] 占位符。
	 * 历史上下文中残留的占位符会诱导模型在协议未注入时仍输出生图标记；
	 * 仅用于落库前过滤本次输出，历史消息不受影响。
	 */
	@bindThis
	public stripDrawPlaceholders(text: string): string {
		if (!text) return text;
		if (!AGENT_DRAW_ANY_RE.test(text)) return text;
		return text
			// 独占一行的占位符连同整行（含换行）移除，避免留下空行
			.replace(/^[ \t]*\[\[agent_draw\b[\s\S]*?\]\][ \t]*\r?\n?/gimu, '')
			.replace(AGENT_DRAW_ANY_RE_G, '')
			.replace(/\n{3,}/gu, '\n\n')
			.trim();
	}

	@bindThis
	public async refreshTokenBalances(instance?: MiMeta): Promise<MiAgentImageToken[]> {
		const meta = instance ?? await this.metaService.fetch(true);
		const tokens = this.normalizeTokens(meta.agentImageTokens);
		// 并行刷新：单个 token 的端点挂起时 15s 超时兜底，串行会把最坏等待叠乘
		const next = await Promise.all(tokens.map(token => token.enabled ? this.refreshOneToken(meta, token) : Promise.resolve(token)));
		await this.metaService.update({ agentImageTokens: next });
		return next;
	}

	@bindThis
	public async testToken(rawToken: string): Promise<MiAgentImageToken> {
		const meta = await this.metaService.fetch(true);
		return await this.refreshOneToken(meta, {
			id: this.idService.gen(),
			token: rawToken.trim(),
			enabled: true,
			sortOrder: 0,
		});
	}

	private async refreshOneToken(meta: MiMeta, token: MiAgentImageToken): Promise<MiAgentImageToken> {
		const url = new URL('/api/points', this.safeBaseUrl(meta.agentImageBaseUrl));
		const ac = new AbortController();
		const timeout = setTimeout(() => ac.abort(), TOKEN_BALANCE_TIMEOUT_MS);
		try {
			const res = await fetch(url, {
				method: 'GET',
				redirect: 'error',
				headers: { Authorization: `Bearer ${token.token}` },
				signal: ac.signal,
			});
			if (!res.ok) {
				return {
					...token,
					points: null,
					lastCheckedAt: new Date().toISOString(),
					lastError: `HTTP ${res.status}`,
				};
			}
			const json = JSON.parse((await readBodyWithLimit(res, TOKEN_BALANCE_BODY_LIMIT_BYTES)).toString('utf8')) as { points?: unknown; last_used_at?: unknown };
			return {
				...token,
				points: typeof json.points === 'number' ? json.points : null,
				lastUsedAt: typeof json.last_used_at === 'string' ? json.last_used_at : token.lastUsedAt ?? null,
				lastCheckedAt: new Date().toISOString(),
				lastError: null,
			};
		} catch (err) {
			return {
				...token,
				points: null,
				lastCheckedAt: new Date().toISOString(),
				lastError: err instanceof Error ? err.message.slice(0, 200) : 'request failed',
			};
		} finally {
			clearTimeout(timeout);
		}
	}

	private normalizeTokens(tokens: MiAgentImageToken[] | null | undefined): MiAgentImageToken[] {
		return Array.isArray(tokens)
			? tokens
				.filter(t => typeof t?.token === 'string' && t.token.trim().length > 0)
				.map((t, i) => ({
					id: typeof t.id === 'string' && t.id ? t.id : this.idService.gen(),
					token: t.token.trim(),
					name: typeof t.name === 'string' ? t.name : null,
					enabled: t.enabled !== false,
					sortOrder: Number.isFinite(Number(t.sortOrder)) ? Number(t.sortOrder) : i,
					points: typeof t.points === 'number' ? t.points : null,
					lastUsedAt: typeof t.lastUsedAt === 'string' ? t.lastUsedAt : null,
					lastCheckedAt: typeof t.lastCheckedAt === 'string' ? t.lastCheckedAt : null,
					lastError: typeof t.lastError === 'string' ? t.lastError : null,
				}))
				.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
			: [];
	}

	@bindThis
	public publicTokenMeta(tokens: MiAgentImageToken[]): Array<Omit<MiAgentImageToken, 'token'> & { tokenMasked: string }> {
		return this.normalizeTokens(tokens).map(t => {
			const { token, ...rest } = t;
			return { ...rest, tokenMasked: maskToken(token) };
		});
	}

	private async pickTokenCandidates(instance: MiMeta): Promise<MiAgentImageToken[]> {
		let tokens = this.normalizeTokens(instance.agentImageTokens);
		if (tokens.length === 0) return [];
		const minPoints = Math.max(0, Number(instance.agentImageTokenMinPoints) || 0);
		const ttlMs = Math.max(0, Number(instance.agentImageTokenBalanceTtlSeconds) || 300) * 1000;
		const now = Date.now();
		const usable = tokens.filter(t => {
			if (!t.enabled) return false;
			if (typeof t.points === 'number' && t.points < minPoints) return false;
			if (!t.lastCheckedAt) return true;
			return now - new Date(t.lastCheckedAt).getTime() <= ttlMs;
		});
		if (usable.length > 0) return usable;

		tokens = await this.refreshTokenBalances(instance);
		return tokens.filter(t => t.enabled !== false && (typeof t.points !== 'number' || t.points >= minPoints));
	}

	@bindThis
	public async generateToDrive(params: {
		user: MiUser;
		sessionId?: string | null;
		characterId?: string | null;
		dialogueStyleId?: string | null;
		tag: string;
		size: AgentImageSize;
		imageModelId?: string | null;
		imageSettings?: Record<string, unknown> | null;
		insertMessage?: boolean;
	}): Promise<{ url: string; fileId: string; cost: number }> {
		const instance = await this.metaService.fetch(true);
		const imageModel = this.resolveImageModel(instance, params.imageModelId);
		if (!imageModel) throw new ApiError(agentImageErrors.disabled);
		const cost = Math.max(0, Number(imageModel.costPerCall ?? instance.agentImageCostPerCall) || 0);
		if (cost > 0 && !await this.agentModelUsageService.hasFreeQuotaRemaining(params.user.id, imageModel.id, instance)) {
			const profile = await this.userProfilesRepository.findOneBy({ userId: params.user.id });
			if ((profile?.agentCreditBalance ?? 0) < cost) throw new ApiError(agentImageErrors.insufficientCredit);
		}
		await this.ensureAgentImageDriveSpace(params.user);

		const usageLog = await this.agentModelUsageService.startLog({
			userId: params.user.id,
			sessionId: params.sessionId ?? null,
			characterId: params.characterId ?? null,
			dialogueStyleId: params.dialogueStyleId ?? null,
			modelId: imageModel.id,
			modelApiName: imageModel.apiModelName ?? instance.agentImageDefaultModel,
			usageKind: 'image_generation',
		});
		const referenceImages = imageModel.supportsReferenceImage === true
			? await this.resolveCharacterReferenceImages(params.characterId)
			: [];

		try {
			let file: Awaited<ReturnType<AgentImageService['fetchAndStoreImage']>> | null = null;
			if (imageModel.provider === 'aurora') {
				const tokens = await this.pickTokenCandidates(instance);
				if (tokens.length === 0) throw new ApiError(agentImageErrors.notConfigured);
				let lastError: unknown = null;
				for (const token of tokens) {
					try {
						file = await this.fetchAndStoreImage({ ...params, instance, imageModel, token });
						break;
					} catch (err) {
						if (err instanceof ApiError && NON_RETRIABLE_GENERATION_ERROR_CODES.has(err.code)) throw err;
						lastError = err;
					}
				}
				if (!file) {
					if (lastError instanceof ApiError) throw lastError;
					throw new ApiError(agentImageErrors.upstreamFailed);
				}
			} else {
				file = await this.fetchAndStoreImage({ ...params, instance, imageModel, referenceImages });
			}
			await this.agentModelUsageService.finishLog(usageLog, instance, { status: 'success', costOverride: cost });
			const url = file.webpublicUrl ?? file.url;
			return { url, fileId: file.id, cost };
		} catch (err) {
			await this.agentModelUsageService.finishLog(usageLog, instance, {
				status: 'failed',
				errorCode: err instanceof ApiError ? err.code : 'AGENT_IMAGE_FAILED',
			});
			if (err instanceof ApiError) throw err;
			throw new ApiError(agentImageErrors.upstreamFailed);
		}
	}

	private async ensureAgentImageDriveSpace(user: MiUser, requiredBytes = 0): Promise<void> {
		if (await this.roleService.isModerator(user)) return;

		const policies = await this.roleService.getUserPolicies(user.id);
		const capacity = Math.max(0, 1024 * 1024 * policies.agentImageDriveCapacityMb);
		const threshold = Math.max(0, 1024 * 1024 * policies.agentImageDriveCleanupThresholdMb);
		const target = Math.max(threshold, 1024 * 1024 * policies.agentImageDriveCleanupTargetMb);
		let usage = await this.driveFileEntityService.calcAgentImageDriveUsageOf(user);

		if (capacity <= 0) {
			throw new ApiError(agentImageErrors.noFreeDriveSpace);
		}
		if ((capacity - usage) >= threshold && usage + requiredBytes <= capacity) return;

		usage = await this.cleanupOldAgentImages(user, Math.max(target, requiredBytes + threshold), capacity);

		if ((capacity - usage) < threshold || usage + requiredBytes > capacity) {
			throw new ApiError(agentImageErrors.noFreeDriveSpace);
		}
	}

	/** 每批清理的文件/记录数上限，避免单次生图请求清理过久。 */
	private static readonly CLEANUP_BATCH_SIZE = 200;
	/** 单次清理请求最多处理的文件/记录总数，作为防爆护栏；未达标时会抛空间不足，下次生图继续收敛。 */
	private static readonly CLEANUP_MAX_FILES_PER_PASS = 1000;

	private async cleanupOldAgentImages(user: MiUser, targetFreeBytes: number, capacityBytes: number): Promise<number> {
		let usage = await this.driveFileEntityService.calcAgentImageDriveUsageOf(user);
		if ((capacityBytes - usage) >= targetFreeBytes) return usage;

		// 第一段：优先回收孤儿文件——位于 AI 生图文件夹、isAgentGenerated=TRUE，但没有任何"未清理"的生成记录引用它。
		// 这类文件来自已删除的会话/消息（记录随外键级联删除）、以及生图落盘后记录未保存为 succeeded 的崩溃窗口
		//（addFile 成功后进程中断或记录保存失败，行停留在 failed/generating 且 fileId 为空）。
		// 它们的聊天上下文已不存在，不会触发任何"图片已被自动清理"卡片，因此优先回收，避免吃掉用户仍可见的历史图片。
		// 注：deleteFile 成功但记录 save 失败的窗口不在此列——那种情况下文件已删、仅剩陈旧记录，由第二段的
		// missing_agent_image_file 分支兜底。
		usage = await this.sweepOrphanedAgentImageFiles(user, targetFreeBytes, capacityBytes, usage);
		if ((capacityBytes - usage) >= targetFreeBytes) {
			return await this.driveFileEntityService.calcAgentImageDriveUsageOf(user);
		}

		// 第二段：按生成记录清理最旧的 succeeded/blocked 记录对应文件，并把记录回填为 auto_cleaned，
		// 使聊天端能展示"图片已被自动清理"卡片（placeholder-status.ts / agent-session.message.vue）。
		usage = await this.cleanupAgentImagesByGenerationRows(user, targetFreeBytes, capacityBytes, usage);
		return await this.driveFileEntityService.calcAgentImageDriveUsageOf(user);
	}

	/**
	 * 清扫 AI 生图文件夹中没有任何"未清理"生成记录引用的孤儿文件，按文件 id 最旧优先删除。
	 * DriveFile 没有 createdAt 列，时间序由 id（时序生成）承载，故按 file.id ASC 取最旧（与 DriveService.expireOldFile 一致）。
	 */
	private async sweepOrphanedAgentImageFiles(user: MiUser, targetFreeBytes: number, capacityBytes: number, usageIn: number): Promise<number> {
		let usage = usageIn;
		let swept = 0;
		while ((capacityBytes - usage) < targetFreeBytes && swept < AgentImageService.CLEANUP_MAX_FILES_PER_PASS) {
			const files = await this.driveFilesRepository
				.createQueryBuilder('file')
				.innerJoin('drive_folder', 'folder', 'folder.id = file.folderId')
				.where('file.userId = :userId', { userId: user.id })
				.andWhere('file.isLink = FALSE')
				.andWhere('file.isAgentGenerated = TRUE')
				.andWhere('folder.systemType = :systemType', { systemType: 'agentGeneratedImages' })
				.andWhere((qb) => {
					const sub = qb.subQuery()
						.select('1')
						.from('agent_image_generation', 'g')
						.where('g.fileId = file.id')
						.andWhere('g.autoCleanedAt IS NULL')
						.getQuery();
					return `NOT EXISTS ${sub}`;
				})
				.orderBy('file.id', 'ASC')
				.take(AgentImageService.CLEANUP_BATCH_SIZE)
				.getMany();

			if (files.length === 0) break;

			for (const file of files) {
				if ((capacityBytes - usage) >= targetFreeBytes) break;
				if (swept >= AgentImageService.CLEANUP_MAX_FILES_PER_PASS) break;
				const size = file.size;
				await this.driveService.deleteFileSync(file);
				usage = Math.max(0, usage - size);
				swept++;
			}

			if (files.length < AgentImageService.CLEANUP_BATCH_SIZE) break;
		}
		return usage;
	}

	/**
	 * 按生成记录最旧优先清理 succeeded/blocked 记录对应的文件，并回填记录为 auto_cleaned。
	 * 仅在此路径删除的文件会保留聊天端的"图片已被自动清理"卡片语义。
	 */
	private async cleanupAgentImagesByGenerationRows(user: MiUser, targetFreeBytes: number, capacityBytes: number, usageIn: number): Promise<number> {
		let usage = usageIn;
		let processed = 0;
		while ((capacityBytes - usage) < targetFreeBytes && processed < AgentImageService.CLEANUP_MAX_FILES_PER_PASS) {
			const rows = await this.agentImageGenerationsRepository.createQueryBuilder('g')
				.where('g.userId = :userId', { userId: user.id })
				.andWhere('g.fileId IS NOT NULL')
				.andWhere('g.autoCleanedAt IS NULL')
				.andWhere('g.status IN (:...statuses)', { statuses: ['succeeded', 'blocked'] })
				.orderBy('g.createdAt', 'ASC')
				.take(AgentImageService.CLEANUP_BATCH_SIZE)
				.getMany();

			if (rows.length === 0) break;

			for (const row of rows) {
				if ((capacityBytes - usage) >= targetFreeBytes) break;
				if (processed >= AgentImageService.CLEANUP_MAX_FILES_PER_PASS) break;
				processed++;
				if (row.fileId == null) continue;
				const file = await this.driveFilesRepository.findOneBy({ id: row.fileId, userId: user.id });
				if (!file || !file.isAgentGenerated) {
					row.status = 'auto_cleaned';
					row.url = null;
					row.autoCleanedAt = new Date();
					row.autoCleanedReason = 'missing_agent_image_file';
					row.updatedAt = new Date();
					await this.agentImageGenerationsRepository.save(row);
					continue;
				}

				const size = file.size;
				await this.driveService.deleteFileSync(file);
				row.status = 'auto_cleaned';
				row.url = null;
				row.errorCode = null;
				row.autoCleanedAt = new Date();
				row.autoCleanedReason = 'agent_image_drive_quota_cleanup';
				row.updatedAt = new Date();
				await this.agentImageGenerationsRepository.save(row);
				usage = Math.max(0, usage - size);
			}

			if (rows.length < AgentImageService.CLEANUP_BATCH_SIZE) break;
		}
		return usage;
	}

	private async fetchAndStoreImage(params: FetchImageParams) {
		switch (params.imageModel.provider) {
			case 'aurora':
				return await this.fetchAuroraAndStoreImage(params);
			case 'openai':
				return await this.fetchOpenAiAndStoreImage(params);
			case 'qwen':
				return await this.fetchQwenAndStoreImage(params);
			default:
				throw new ApiError(agentImageErrors.notConfigured);
		}
	}

	private async ensureAgentImageFolder(userId: MiUser['id']): Promise<MiDriveFolder> {
		const existing = await this.driveFoldersRepository.findOneBy({
			userId,
			systemType: 'agentGeneratedImages',
		});
		if (existing) return existing;

		const folder = new MiDriveFolder();
		folder.id = this.idService.gen();
		folder.name = 'AI 智能体生成图片';
		folder.userId = userId;
		folder.parentId = null;
		folder.systemType = 'agentGeneratedImages';
		try {
			return await this.driveFoldersRepository.insertOne(folder);
		} catch {
			return await this.driveFoldersRepository.findOneByOrFail({
				userId,
				systemType: 'agentGeneratedImages',
			});
		}
	}

	private async fetchAuroraAndStoreImage(params: FetchImageParams) {
		if (!params.token) throw new ApiError(agentImageErrors.notConfigured);
		const providerDefaults = normalizeImageParams(params.imageModel.defaultParams ?? params.instance.agentImageDefaultParams);
		const sessionSettings = normalizeImageSettings(params.imageSettings);
		const p = { ...providerDefaults, ...sessionSettings };
		const preset = getAgentImagePreset(
			sessionSettings.artistPresetId ?? params.imageModel.defaultArtistPresetId ?? params.instance.agentImageDefaultArtistPresetId,
			params.instance.agentImageArtistPresets,
		);
		const promptPrefix = preset?.promptPrefix ?? p.promptPrefix ?? '';
		const promptSuffix = preset?.promptSuffix ?? p.promptSuffix ?? 'masterpiece,best quality,very aesthetic,highres';
		const negative = resolveAgentImageNegativePrompt(params.instance.agentImageDefaultNegativePrompt, preset?.negativePrompt ?? '');
		const url = new URL('/api/aurora/regex-image', this.safeBaseUrl(params.instance.agentImageBaseUrl));
		url.searchParams.set('tag', params.tag.slice(0, 4000));
		url.searchParams.set('token', params.token.token);
		url.searchParams.set('prompt_prefix', promptPrefix);
		url.searchParams.set('prompt_suffix', promptSuffix);
		url.searchParams.set('negative', negative);
		url.searchParams.set('size', params.size);
		url.searchParams.set('model', (params.imageModel.apiModelName ?? params.instance.agentImageDefaultModel) || 'nai-diffusion-4-5-full');
		url.searchParams.set('steps', String(Math.trunc(safeNumber(p.steps, 28, 1, 80))));
		url.searchParams.set('scale', String(safeNumber(p.scale, 5, 0, 30)));
		url.searchParams.set('cfg_rescale', String(safeNumber(p.cfgRescale, 0, 0, 1)));
		url.searchParams.set('sampler', String(p.sampler ?? 'k_euler_ancestral'));
		url.searchParams.set('noise_schedule', String(p.noiseSchedule ?? 'karras'));
		url.searchParams.set('nocache', String(Date.now()));

		const ac = new AbortController();
		const timeout = setTimeout(() => ac.abort(), 180_000);
		try {
			const res = await fetch(url, { signal: ac.signal, redirect: 'error' });
			if (!res.ok) throw upstreamImageError(await describeImageUpstreamHttpError(res));
			const contentType = res.headers.get('content-type');
			if (!contentType?.toLowerCase().startsWith('image/')) {
				throw upstreamImageError(`Upstream returned an unsupported content type: ${contentType ?? 'missing Content-Type'}.`);
			}
			const buf = await readBodyWithLimit(res, GENERATED_IMAGE_BODY_LIMIT_BYTES);
			return await this.storeGeneratedImage(params, buf, contentType);
		} catch (err) {
			if (err instanceof ApiError) throw err;
			if (err instanceof UpstreamBodyTooLargeError) {
				throw upstreamImageError(`Upstream returned an image larger than the ${GENERATED_IMAGE_BODY_LIMIT_BYTES} byte read limit.`);
			}
			throw upstreamImageError(describeImageRequestFailure(err, ac.signal.aborted));
		} finally {
			clearTimeout(timeout);
		}
	}

	private async fetchOpenAiAndStoreImage(params: FetchImageParams) {
		const apiUrl = params.imageModel.apiUrl?.trim();
		const apiKey = params.imageModel.apiKey?.trim();
		const apiModelName = params.imageModel.apiModelName?.trim();
		if (!apiUrl || !apiKey || !apiModelName) throw new ApiError(agentImageErrors.notConfigured);

		let endpoint: URL;
		try {
			endpoint = await assertSafeLlmHttpsUrl(apiUrl);
		} catch (err) {
			const diagnostic = err instanceof UnsafeLlmUrlError
				? describeUnsafeLlmUrlReason(err.reason)
				: 'The configured OpenAI-compatible endpoint URL is invalid.';
			throw new ApiError(agentImageErrors.notConfigured, { diagnostic });
		}

		const ac = new AbortController();
		const timeout = setTimeout(() => ac.abort(), 180_000);
		try {
			const isChatCompletions = endpoint.pathname.replace(/\/+$/, '').endsWith('/chat/completions');
			const res = await fetch(endpoint, {
				...(isChatCompletions
					? buildOpenAiChatImageGenerationRequestInit(apiKey, apiModelName, params.tag, params.referenceImages)
					: buildOpenAiImageGenerationRequestInit(apiKey, apiModelName, params.tag, params.size, params.referenceImages)),
				redirect: 'error',
				signal: ac.signal,
			});
			if (!res.ok) throw upstreamImageError(await describeImageUpstreamHttpError(res));

			let result: OpenAiImageResult;
			try {
				const body = JSON.parse((await readBodyWithLimit(res, OPENAI_IMAGE_JSON_BODY_LIMIT_BYTES)).toString('utf8')) as unknown;
				result = isChatCompletions ? parseOpenAiChatImageResult(body) : parseOpenAiImageResult(body);
			} catch (err) {
				if (err instanceof UpstreamBodyTooLargeError) {
					throw upstreamImageError(`Upstream response exceeded the ${OPENAI_IMAGE_JSON_BODY_LIMIT_BYTES} byte read limit.`);
				}
				const expected = isChatCompletions
					? 'choices[0].message content containing a Base64 image or HTTPS image URL'
					: 'data[0].b64_json or data[0].url';
				const detail = err instanceof Error ? err.message : 'Unknown response parsing error.';
				throw upstreamImageError(`Upstream response could not be parsed. Expected ${expected}. ${detail}`);
			}

			return await this.storeGeneratedImageResult(params, result, ac.signal);
		} catch (err) {
			if (err instanceof ApiError) throw err;
			throw upstreamImageError(describeImageRequestFailure(err, ac.signal.aborted));
		} finally {
			clearTimeout(timeout);
		}
	}

	private async fetchQwenAndStoreImage(params: FetchImageParams) {
		const apiUrl = params.imageModel.apiUrl?.trim();
		const apiKey = params.imageModel.apiKey?.trim();
		const apiModelName = params.imageModel.apiModelName?.trim();
		if (!apiUrl || !apiKey || !apiModelName) throw new ApiError(agentImageErrors.notConfigured);

		let endpoint: URL;
		try {
			endpoint = await assertSafeLlmHttpsUrl(apiUrl);
		} catch (err) {
			const diagnostic = err instanceof UnsafeLlmUrlError
				? describeUnsafeLlmUrlReason(err.reason)
				: 'The configured Qwen image endpoint URL is invalid.';
			throw new ApiError(agentImageErrors.notConfigured, { diagnostic });
		}

		// Qwen-Image 的 parameters.negative_prompt 上限 500 字符，过长会被上游截断
		const negativePrompt = resolveAgentImageNegativePrompt(params.instance.agentImageDefaultNegativePrompt).slice(0, 500);

		const ac = new AbortController();
		const timeout = setTimeout(() => ac.abort(), 180_000);
		try {
			const res = await fetch(endpoint, {
				...buildQwenImageGenerationRequestInit(apiKey, apiModelName, params.tag, negativePrompt, params.size),
				redirect: 'error',
				signal: ac.signal,
			});
			if (!res.ok) throw upstreamImageError(await describeImageUpstreamHttpError(res));

			let result: OpenAiImageResult;
			try {
				const body = JSON.parse((await readBodyWithLimit(res, OPENAI_IMAGE_JSON_BODY_LIMIT_BYTES)).toString('utf8')) as unknown;
				result = parseQwenImageResult(body);
			} catch (err) {
				if (err instanceof UpstreamBodyTooLargeError) {
					throw upstreamImageError(`Upstream response exceeded the ${OPENAI_IMAGE_JSON_BODY_LIMIT_BYTES} byte read limit.`);
				}
				const detail = err instanceof Error ? err.message : 'Unknown response parsing error.';
				throw upstreamImageError(`Upstream response could not be parsed. Expected output.results containing image URLs. ${detail}`);
			}

			return await this.storeGeneratedImageResult(params, result, ac.signal);
		} catch (err) {
			if (err instanceof ApiError) throw err;
			throw upstreamImageError(describeImageRequestFailure(err, ac.signal.aborted));
		} finally {
			clearTimeout(timeout);
		}
	}

	private async storeGeneratedImageResult(params: FetchImageParams, result: OpenAiImageResult, signal: AbortSignal) {
		if (result.type === 'base64') {
			const normalized = result.value.replace(/\s+/g, '');
			if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)) {
				throw upstreamImageError('Upstream response contains invalid Base64 image data.');
			}
			const buf = Buffer.from(normalized, 'base64');
			return await this.storeGeneratedImage(params, buf, 'image/png');
		}

		let imageUrl: URL;
		try {
			imageUrl = await assertSafeLlmHttpsUrl(result.value);
		} catch (err) {
			const detail = err instanceof UnsafeLlmUrlError
				? describeUnsafeLlmUrlReason(err.reason)
				: 'The image URL returned by the upstream service is invalid.';
			throw upstreamImageError(detail);
		}
		const imageRes = await fetch(imageUrl, { signal });
		if (!imageRes.ok) throw upstreamImageError(await describeImageUpstreamHttpError(imageRes));
		const contentType = imageRes.headers.get('content-type');
		if (!contentType?.toLowerCase().startsWith('image/')) {
			throw upstreamImageError(`Upstream image URL returned an unsupported content type: ${contentType ?? 'missing Content-Type'}.`);
		}
		let buf: Buffer;
		try {
			buf = await readBodyWithLimit(imageRes, GENERATED_IMAGE_BODY_LIMIT_BYTES);
		} catch (err) {
			if (err instanceof UpstreamBodyTooLargeError) {
				throw upstreamImageError(`Upstream returned an image larger than the ${GENERATED_IMAGE_BODY_LIMIT_BYTES} byte read limit.`);
			}
			throw err;
		}
		return await this.storeGeneratedImage(params, buf, contentType);
	}

	private async resolveCharacterReferenceImages(characterId: string | null | undefined): Promise<AgentReferenceImage[]> {
		if (!characterId) return [];
		const character = await this.agentCharactersRepository.findOneBy({ id: characterId });
		const ids = [...new Set((Array.isArray(character?.referenceImageFileIds)
			? character.referenceImageFileIds
			: character?.referenceImageFileId ? [character.referenceImageFileId] : [])
			.filter((id): id is string => typeof id === 'string' && id !== ''))].slice(0, 4);
		return (await Promise.all(ids.map(async (id): Promise<AgentReferenceImage | null> => {
			const file = await this.driveFilesRepository.findOneBy({ id });
			if (!file || !file.type.startsWith('image/') || file.size <= 0 || file.size > 5 * 1024 * 1024) return null;
			const ac = new AbortController();
			const timeout = setTimeout(() => ac.abort(), 30_000);
			try {
				const res = await fetch(this.driveFileEntityService.getPublicUrl(file), { signal: ac.signal });
				if (!res.ok) return null;
				const data = await readBodyWithLimit(res, 5 * 1024 * 1024);
				if (data.length === 0 || data.length > 5 * 1024 * 1024) return null;
				return { contentType: file.type, data };
			} catch {
				return null;
			} finally {
				clearTimeout(timeout);
			}
		}))).filter((image): image is AgentReferenceImage => image != null);
	}

	private async storeGeneratedImage(params: FetchImageParams, buf: Buffer, contentType: string | null) {
		if (buf.length <= 0) throw upstreamImageError('Upstream returned an empty image file.');
		if (buf.length > 20 * 1024 * 1024) throw upstreamImageError('Upstream returned an image larger than the 20 MiB limit.');
		await this.ensureAgentImageDriveSpace(params.user, buf.length);

		const dir = await mkdtemp(join(tmpdir(), 'misskey-agent-image-'));
		const ext = contentTypeExt(contentType);
		const path = join(dir, `agent-image.${ext}`);
		try {
			await writeFile(path, buf);
			try {
				const folder = await this.ensureAgentImageFolder(params.user.id);
				return await this.driveService.addFile({
					user: params.user,
					path,
					name: `agent-image-${Date.now()}.${ext}`,
					comment: '由智能体生成的图片',
					folderId: folder.id,
					agentGenerated: true,
					force: true,
					sensitive: false,
				});
			} catch (err) {
				if (err instanceof IdentifiableError) {
					if (err.id === 'c6244ed2-a39a-4e1c-bf93-f0fbd7764fa6') throw new ApiError(agentImageErrors.noFreeDriveSpace);
					if (err.id === 'f9e4e5f3-4df4-40b5-b400-f236945f7073') throw new ApiError(agentImageErrors.maxFileSizeExceeded);
					if (err.id === 'bd71c601-f9b0-4808-9137-a330647ced9b') throw new ApiError(agentImageErrors.unallowedFileType);
				}
				throw err;
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	}

	private safeBaseUrl(raw: string | null | undefined): string {
		const s = (raw ?? 'https://love.auroralove.cc').trim().replace(/\/$/, '');
		const u = new URL(s);
		if (u.protocol !== 'https:') throw new ApiError(agentImageErrors.notConfigured);
		return u.toString();
	}
}
