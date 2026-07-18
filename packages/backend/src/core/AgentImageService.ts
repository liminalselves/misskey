/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
	const raw = await res.text().catch(() => '');
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
			.filter(m => typeof m?.id === 'string' && m.id.trim() !== '' && (m.provider === 'aurora' || m.provider === 'openai'))
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

	@bindThis
	public async refreshTokenBalances(instance?: MiMeta): Promise<MiAgentImageToken[]> {
		const meta = instance ?? await this.metaService.fetch(true);
		const tokens = this.normalizeTokens(meta.agentImageTokens);
		const next: MiAgentImageToken[] = [];
		for (const token of tokens) {
			if (!token.enabled) {
				next.push(token);
				continue;
			}
			next.push(await this.refreshOneToken(meta, token));
		}
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
		try {
			const res = await fetch(url, {
				method: 'GET',
				headers: { Authorization: `Bearer ${token.token}` },
			});
			if (!res.ok) {
				return {
					...token,
					points: null,
					lastCheckedAt: new Date().toISOString(),
					lastError: `HTTP ${res.status}`,
				};
			}
			const json = await res.json() as { points?: unknown; last_used_at?: unknown };
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
		if (cost > 0) {
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

	private async cleanupOldAgentImages(user: MiUser, targetFreeBytes: number, capacityBytes: number): Promise<number> {
		let usage = await this.driveFileEntityService.calcAgentImageDriveUsageOf(user);
		if ((capacityBytes - usage) >= targetFreeBytes) return usage;

		const rows = await this.agentImageGenerationsRepository.createQueryBuilder('g')
			.where('g.userId = :userId', { userId: user.id })
			.andWhere('g.fileId IS NOT NULL')
			.andWhere('g.autoCleanedAt IS NULL')
			.andWhere('g.status IN (:...statuses)', { statuses: ['succeeded', 'blocked'] })
			.orderBy('g.createdAt', 'ASC')
			.take(200)
			.getMany();

		for (const row of rows) {
			if ((capacityBytes - usage) >= targetFreeBytes) break;
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
			await this.driveService.deleteFile(file);
			row.status = 'auto_cleaned';
			row.url = null;
			row.errorCode = null;
			row.autoCleanedAt = new Date();
			row.autoCleanedReason = 'agent_image_drive_quota_cleanup';
			row.updatedAt = new Date();
			await this.agentImageGenerationsRepository.save(row);
			usage = Math.max(0, usage - size);
		}

		return await this.driveFileEntityService.calcAgentImageDriveUsageOf(user);
	}

	private async fetchAndStoreImage(params: FetchImageParams) {
		switch (params.imageModel.provider) {
			case 'aurora':
				return await this.fetchAuroraAndStoreImage(params);
			case 'openai':
				return await this.fetchOpenAiAndStoreImage(params);
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
			const res = await fetch(url, { signal: ac.signal });
			if (!res.ok) throw upstreamImageError(await describeImageUpstreamHttpError(res));
			const contentType = res.headers.get('content-type');
			if (!contentType?.toLowerCase().startsWith('image/')) {
				throw upstreamImageError(`Upstream returned an unsupported content type: ${contentType ?? 'missing Content-Type'}.`);
			}
			const buf = Buffer.from(await res.arrayBuffer());
			return await this.storeGeneratedImage(params, buf, contentType);
		} catch (err) {
			if (err instanceof ApiError) throw err;
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
				signal: ac.signal,
			});
			if (!res.ok) throw upstreamImageError(await describeImageUpstreamHttpError(res));

			let result: OpenAiImageResult;
			try {
				const body = JSON.parse(await res.text()) as unknown;
				result = isChatCompletions ? parseOpenAiChatImageResult(body) : parseOpenAiImageResult(body);
			} catch (err) {
				const expected = isChatCompletions
					? 'choices[0].message content containing a Base64 image or HTTPS image URL'
					: 'data[0].b64_json or data[0].url';
				const detail = err instanceof Error ? err.message : 'Unknown response parsing error.';
				throw upstreamImageError(`Upstream response could not be parsed. Expected ${expected}. ${detail}`);
			}

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
			const imageRes = await fetch(imageUrl, { signal: ac.signal });
			if (!imageRes.ok) throw upstreamImageError(await describeImageUpstreamHttpError(imageRes));
			const contentType = imageRes.headers.get('content-type');
			if (!contentType?.toLowerCase().startsWith('image/')) {
				throw upstreamImageError(`Upstream image URL returned an unsupported content type: ${contentType ?? 'missing Content-Type'}.`);
			}
			const buf = Buffer.from(await imageRes.arrayBuffer());
			return await this.storeGeneratedImage(params, buf, contentType);
		} catch (err) {
			if (err instanceof ApiError) throw err;
			throw upstreamImageError(describeImageRequestFailure(err, ac.signal.aborted));
		} finally {
			clearTimeout(timeout);
		}
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
				const data = Buffer.from(await res.arrayBuffer());
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
