/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { Config } from '@/config.js';
import type { MiMeta, MiNativeClientAppInfo } from '@/models/Meta.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { MetaService } from '@/core/MetaService.js';
import { readBodyWithLimit } from '@/misc/read-body-with-limit.js';
import type Logger from '@/logger.js';
import {
	applyDownloadProxy,
	buildEffectiveNativeClientAppInfo,
	normalizeGitHubRepo,
	parseGitHubReleasesResponse,
	type EffectiveNativeClientAppInfo,
	type GitHubAppReleaseSnapshot,
	type GitHubReleaseRaw,
	type LatestAppReleaseEntry,
} from './app-release-helpers.js';

const REDIS_KEY_PREFIX = 'appRelease:github:';
const REDIS_TTL_SECONDS = 24 * 60 * 60;
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const MEMORY_CACHE_TTL_MS = 60 * 1000;
const GITHUB_REQUEST_TIMEOUT_MS = 15 * 1000;
const GITHUB_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
const GITHUB_ERROR_BODY_MAX_BYTES = 64 * 1024;

export type PublicAppLatestPlatformRelease = {
	version: string;
	tagName: string;
	name: string;
	publishedAt: string | null;
	releaseUrl: string;
	minVersion: string | null;
	notes: string;
	assetName: string;
	size: number;
	sha256: string | null;
	downloadUrl: string | null;
	rawDownloadUrl: string | null;
	downloadCount: number;
};

export type PublicAppReleaseAsset = {
	name: string;
	size: number;
	sha256: string | null;
	downloadUrl: string | null;
	rawDownloadUrl: string | null;
	downloadCount: number;
};

export type PublicAppReleaseEntry = {
	version: string;
	tagName: string;
	name: string;
	publishedAt: string | null;
	releaseUrl: string;
	minVersion: string | null;
	notes: string;
	isLatest: boolean;
	assets: {
		android?: PublicAppReleaseAsset;
		ios?: PublicAppReleaseAsset;
	};
};

export type PublicAppReleasesView = {
	repo: string;
	autoFetchGithub: boolean;
	syncedAt: string | null;
	syncError: string | null;
	announcement: string | null;
	minRequiredAppVersion: string | null;
	latest: {
		android: PublicAppLatestPlatformRelease | null;
		ios: PublicAppLatestPlatformRelease | null;
	};
	releases: PublicAppReleaseEntry[];
};

export type AppReleaseSyncResult = {
	ok: boolean;
	repo: string;
	autoFetchGithub: boolean;
	syncedAt: string | null;
	error: string | null;
	latestAndroidVersion: string | null;
	latestIosVersion: string | null;
	releaseCount: number;
};

async function drainResponseBody(res: { body?: unknown; arrayBuffer?: () => Promise<ArrayBuffer> }): Promise<void> {
	const body = res.body as {
		destroy?: () => void;
		cancel?: () => Promise<unknown>;
		resume?: () => void;
	} | null | undefined;
	if (body != null) {
		if (typeof body.destroy === 'function') {
			body.destroy();
			return;
		}
		if (typeof body.cancel === 'function') {
			await body.cancel().catch(() => {});
			return;
		}
		if (typeof body.resume === 'function') {
			body.resume();
			return;
		}
	}
	if (typeof res.arrayBuffer === 'function') {
		await res.arrayBuffer().catch(() => {});
	}
}

function extractAssetFilename(url: string | null, fallback: string): string {
	if (!url) return fallback;
	try {
		const last = new URL(url).pathname.split('/').pop();
		return last && last.length > 0 ? last : fallback;
	} catch {
		return fallback;
	}
}

@Injectable()
export class AppReleaseService implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown {
	private logger: Logger;
	private memoryCache = new Map<string, { snapshot: GitHubAppReleaseSnapshot; loadedAt: number }>();
	private inFlightSync: { force: boolean; promise: Promise<AppReleaseSyncResult> } | null = null;
	private syncTimer: NodeJS.Timeout | null = null;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.meta)
		private meta: MiMeta,

		private metaService: MetaService,
		private httpRequestService: HttpRequestService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('app-release');
	}

	@bindThis
	public onModuleInit(): void {
		if (process.env.NODE_ENV === 'test') return;

		this.syncTimer = setInterval(() => {
			void this.syncNow({ force: false }).catch(err => {
				this.logger.warn(`Scheduled GitHub release sync failed: ${err instanceof Error ? err.message : String(err)}`);
			});
		}, REFRESH_INTERVAL_MS);
		this.syncTimer.unref();

		void this.syncNow({ force: false }).catch(err => {
			this.logger.warn(`Initial GitHub release sync failed: ${err instanceof Error ? err.message : String(err)}`);
		});
	}

	@bindThis
	public onModuleDestroy(): void {
		this.clearTimer();
	}

	@bindThis
	public onApplicationShutdown(): void {
		this.clearTimer();
	}

	private clearTimer(): void {
		if (this.syncTimer) {
			clearInterval(this.syncTimer);
			this.syncTimer = null;
		}
	}

	private redisKey(repo: string): string {
		return `${REDIS_KEY_PREFIX}${repo}`;
	}

	private async getCachedSnapshot(repo: string, allowStaleMemory = false): Promise<GitHubAppReleaseSnapshot | null> {
		const mem = this.memoryCache.get(repo);
		if (mem && (allowStaleMemory || Date.now() - mem.loadedAt < MEMORY_CACHE_TTL_MS)) {
			return mem.snapshot;
		}

		try {
			const raw = await this.redisClient.get(this.redisKey(repo));
			if (!raw) return mem?.snapshot ?? null;
			const parsed = JSON.parse(raw) as GitHubAppReleaseSnapshot;
			if (parsed && typeof parsed === 'object' && Array.isArray(parsed.releases)) {
				this.memoryCache.set(repo, { snapshot: parsed, loadedAt: Date.now() });
				return parsed;
			}
		} catch (err) {
			this.logger.warn(`Failed to read GitHub release snapshot from Redis: ${err instanceof Error ? err.message : String(err)}`);
		}

		return mem?.snapshot ?? null;
	}

	private async saveSnapshot(snapshot: GitHubAppReleaseSnapshot): Promise<void> {
		this.memoryCache.set(snapshot.repo, { snapshot, loadedAt: Date.now() });
		try {
			await this.redisClient.set(
				this.redisKey(snapshot.repo),
				JSON.stringify(snapshot),
				'EX',
				REDIS_TTL_SECONDS,
			);
		} catch (err) {
			this.logger.warn(`Failed to persist GitHub release snapshot to Redis: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	@bindThis
	public async getEffectiveNativeClientAppInfo(stored?: MiNativeClientAppInfo | null): Promise<EffectiveNativeClientAppInfo> {
		const effectiveStored = stored ?? this.meta.nativeClientAppInfo ?? {};
		if (effectiveStored.autoFetchGithub === false) {
			return buildEffectiveNativeClientAppInfo(effectiveStored, null);
		}
		const repo = normalizeGitHubRepo(effectiveStored.githubRepo);
		const snapshot = await this.getCachedSnapshot(repo);
		return buildEffectiveNativeClientAppInfo(effectiveStored, snapshot);
	}

	@bindThis
	public async getPublicReleasesView(stored?: MiNativeClientAppInfo | null): Promise<PublicAppReleasesView> {
		const effectiveStored = stored ?? this.meta.nativeClientAppInfo ?? {};
		const autoFetchGithub = effectiveStored.autoFetchGithub !== false;
		const repo = normalizeGitHubRepo(effectiveStored.githubRepo);
		const proxyPrefix = effectiveStored.githubDownloadProxy ?? null;
		const announcement = effectiveStored.announcement ?? null;

		let snapshot: GitHubAppReleaseSnapshot | null = null;
		if (autoFetchGithub) {
			snapshot = await this.getCachedSnapshot(repo);
			if (snapshot == null) {
				await this.syncNow({ force: false }).catch(() => {});
				snapshot = await this.getCachedSnapshot(repo, true);
			}
		}

		if (autoFetchGithub && snapshot && (snapshot.releases.length > 0 || snapshot.latestAndroid != null || snapshot.latestIos != null)) {
			const minRequiredAppVersion = effectiveStored.minRequiredAppVersion?.trim()
				|| snapshot.latestAndroid?.minVersion
				|| snapshot.latestIos?.minVersion
				|| null;

			const mapLatest = (entry: LatestAppReleaseEntry | null): PublicAppLatestPlatformRelease | null => {
				if (!entry) return null;
				return {
					version: entry.version,
					tagName: entry.tagName,
					name: entry.name,
					publishedAt: entry.publishedAt,
					releaseUrl: entry.releaseUrl,
					minVersion: entry.minVersion,
					notes: entry.notes,
					assetName: entry.asset.name,
					size: entry.asset.size,
					sha256: entry.asset.sha256,
					downloadUrl: applyDownloadProxy(entry.asset.rawDownloadUrl, proxyPrefix),
					rawDownloadUrl: entry.asset.rawDownloadUrl,
					downloadCount: entry.asset.downloadCount,
				};
			};

			const mapReleaseAsset = (asset: { name: string; size: number; sha256: string | null; rawDownloadUrl: string; downloadCount: number }): PublicAppReleaseAsset => ({
				name: asset.name,
				size: asset.size,
				sha256: asset.sha256,
				downloadUrl: applyDownloadProxy(asset.rawDownloadUrl, proxyPrefix),
				rawDownloadUrl: asset.rawDownloadUrl,
				downloadCount: asset.downloadCount,
			});

			return {
				repo,
				autoFetchGithub: true,
				syncedAt: snapshot.syncedAt,
				syncError: snapshot.syncError,
				announcement,
				minRequiredAppVersion,
				latest: {
					android: mapLatest(snapshot.latestAndroid),
					ios: mapLatest(snapshot.latestIos),
				},
				releases: snapshot.releases.map(r => ({
					version: r.version,
					tagName: r.tagName,
					name: r.name,
					publishedAt: r.publishedAt,
					releaseUrl: r.releaseUrl,
					minVersion: r.minVersion,
					notes: r.notes,
					isLatest: r.version === snapshot.latestAndroid?.version || r.version === snapshot.latestIos?.version,
					assets: {
						...(r.assets.android ? { android: mapReleaseAsset(r.assets.android) } : {}),
						...(r.assets.ios ? { ios: mapReleaseAsset(r.assets.ios) } : {}),
					},
				})),
			};
		}

		// Fallback when autoFetchGithub is off or GitHub failed with empty cache
		const minRequiredAppVersion = effectiveStored.minRequiredAppVersion?.trim() || null;
		const changelog = Array.isArray(effectiveStored.changelog) ? effectiveStored.changelog : [];
		const androidVer = effectiveStored.latestAndroidVersion?.trim() || null;
		const androidUrl = effectiveStored.androidDownloadUrl?.trim() || null;
		const iosVer = effectiveStored.latestIosVersion?.trim() || null;
		const iosUrl = effectiveStored.iosDownloadUrl?.trim() || null;
		const fallbackReleaseUrl = `https://github.com/${repo}/releases`;

		const findChangelogNotes = (ver: string | null): string => {
			if (!ver) return '';
			const norm = ver.replace(/^v/, '');
			const hit = changelog.find(c => c.version.replace(/^v/, '') === norm);
			return hit?.content ?? '';
		};

		const buildManualLatest = (ver: string | null, url: string | null, defaultAsset: string): PublicAppLatestPlatformRelease | null => {
			if (!ver && !url) return null;
			const cleanVer = (ver ?? '').replace(/^v/, '');
			return {
				version: cleanVer,
				tagName: cleanVer ? `v${cleanVer}` : '',
				name: cleanVer ? `v${cleanVer}` : '',
				publishedAt: null,
				releaseUrl: fallbackReleaseUrl,
				minVersion: minRequiredAppVersion,
				notes: findChangelogNotes(ver),
				assetName: extractAssetFilename(url, defaultAsset),
				size: 0,
				sha256: null,
				downloadUrl: url,
				rawDownloadUrl: url,
				downloadCount: 0,
			};
		};

		const androidAssetName = extractAssetFilename(androidUrl, 'app.apk');
		const iosAssetName = extractAssetFilename(iosUrl, 'app.ipa');

		return {
			repo,
			autoFetchGithub,
			syncedAt: autoFetchGithub ? (snapshot?.syncedAt ?? null) : null,
			syncError: autoFetchGithub ? (snapshot?.syncError ?? null) : null,
			announcement,
			minRequiredAppVersion,
			latest: {
				android: buildManualLatest(androidVer, androidUrl, 'app.apk'),
				ios: buildManualLatest(iosVer, iosUrl, 'app.ipa'),
			},
			releases: changelog
				.filter(entry => entry && (entry.version.trim() !== '' || entry.content.trim() !== ''))
				.map((entry, idx) => {
					const cleanVer = entry.version.trim().replace(/^v/, '');
					const matchesAndroid = Boolean(androidUrl && androidVer && cleanVer === androidVer.replace(/^v/, ''));
					const matchesIos = Boolean(iosUrl && iosVer && cleanVer === iosVer.replace(/^v/, ''));
					return {
						version: cleanVer,
						tagName: cleanVer ? `v${cleanVer}` : '',
						name: entry.version.trim() || cleanVer,
						publishedAt: null,
						releaseUrl: fallbackReleaseUrl,
						minVersion: null,
						notes: entry.content,
						isLatest: idx === 0,
						assets: {
							...(matchesAndroid && androidUrl ? {
								android: {
									name: androidAssetName,
									size: 0,
									sha256: null,
									downloadUrl: androidUrl,
									rawDownloadUrl: androidUrl,
									downloadCount: 0,
								},
							} : {}),
							...(matchesIos && iosUrl ? {
								ios: {
									name: iosAssetName,
									size: 0,
									sha256: null,
									downloadUrl: iosUrl,
									rawDownloadUrl: iosUrl,
									downloadCount: 0,
								},
							} : {}),
						},
					};
				}),
		};
	}

	@bindThis
	public async onSettingsUpdated(): Promise<void> {
		try {
			await this.syncNow({ force: true });
		} catch (err) {
			this.logger.warn(`App release sync after settings update failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	@bindThis
	public async syncNow(opts: { force?: boolean } = {}): Promise<AppReleaseSyncResult> {
		const force = opts.force === true;
		if (this.inFlightSync) {
			if (!force || this.inFlightSync.force) {
				return this.inFlightSync.promise;
			}
			await this.inFlightSync.promise.catch(() => {});
			if (this.inFlightSync) {
				return this.inFlightSync.promise;
			}
		}

		const promise = this.executeSync(opts).finally(() => {
			if (this.inFlightSync?.promise === promise) {
				this.inFlightSync = null;
			}
		});
		this.inFlightSync = { force, promise };
		return promise;
	}

	private async executeSync(opts: { force?: boolean } = {}): Promise<AppReleaseSyncResult> {
		const force = opts.force === true;
		const currentMeta = await this.metaService.fetch(force).catch(() => this.meta);
		const stored = currentMeta?.nativeClientAppInfo ?? this.meta?.nativeClientAppInfo ?? {};
		const autoFetchGithub = stored.autoFetchGithub !== false;
		const repo = normalizeGitHubRepo(stored.githubRepo);

		if (!autoFetchGithub) {
			const cached = await this.getCachedSnapshot(repo);
			return {
				ok: true,
				repo,
				autoFetchGithub: false,
				syncedAt: cached?.syncedAt ?? null,
				error: null,
				latestAndroidVersion: stored.latestAndroidVersion ?? null,
				latestIosVersion: stored.latestIosVersion ?? null,
				releaseCount: Array.isArray(stored.changelog) ? stored.changelog.length : 0,
			};
		}

		const existing = await this.getCachedSnapshot(repo, true);
		if (
			!force
			&& existing
			&& existing.syncedAt != null
			&& !existing.syncError
			&& (Date.now() - Date.parse(existing.syncedAt)) < REFRESH_INTERVAL_MS
		) {
			return {
				ok: true,
				repo,
				autoFetchGithub: true,
				syncedAt: existing.syncedAt,
				error: null,
				latestAndroidVersion: existing.latestAndroid?.version ?? null,
				latestIosVersion: existing.latestIos?.version ?? null,
				releaseCount: existing.releases.length,
			};
		}

		return await this.performSync(repo, existing);
	}

	private async performSync(repo: string, existing: GitHubAppReleaseSnapshot | null): Promise<AppReleaseSyncResult> {
		const url = `https://api.github.com/repos/${repo}/releases?per_page=30`;
		const etag = existing?.etag ?? null;
		const githubToken = process.env.GITHUB_TOKEN?.trim();

		try {
			const res = await this.httpRequestService.send(
				url,
				{
					method: 'GET',
					headers: {
						Accept: 'application/vnd.github+json',
						...(etag ? { 'If-None-Match': etag } : {}),
						...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
					},
					timeout: GITHUB_REQUEST_TIMEOUT_MS,
					size: GITHUB_RESPONSE_MAX_BYTES,
				},
				{
					throwErrorWhenResponseNotOk: false,
				},
			);

			if (res.status === 304) {
				await drainResponseBody(res);
				const nowIso = new Date().toISOString();
				const updatedSnapshot: GitHubAppReleaseSnapshot = {
					repo,
					etag: res.headers.get('etag') ?? etag,
					syncedAt: nowIso,
					syncError: null,
					releases: existing?.releases ?? [],
					latestAndroid: existing?.latestAndroid ?? null,
					latestIos: existing?.latestIos ?? null,
				};
				await this.saveSnapshot(updatedSnapshot);
				return {
					ok: true,
					repo,
					autoFetchGithub: true,
					syncedAt: updatedSnapshot.syncedAt,
					error: null,
					latestAndroidVersion: updatedSnapshot.latestAndroid?.version ?? null,
					latestIosVersion: updatedSnapshot.latestIos?.version ?? null,
					releaseCount: updatedSnapshot.releases.length,
				};
			}

			if (!res.ok) {
				let detail = '';
				try {
					const errBuf = await readBodyWithLimit(res, GITHUB_ERROR_BODY_MAX_BYTES);
					const parsedErr = JSON.parse(errBuf.toString('utf8')) as { message?: unknown };
					if (typeof parsedErr?.message === 'string' && parsedErr.message.trim()) {
						detail = `: ${parsedErr.message.trim()}`;
					}
				} catch {
					// Ignore non-JSON error bodies
				}
				throw new Error(`GitHub API ${res.status}${detail}`);
			}

			const bodyBuf = await readBodyWithLimit(res, GITHUB_RESPONSE_MAX_BYTES);
			const rawJson = JSON.parse(bodyBuf.toString('utf8')) as unknown;
			if (!Array.isArray(rawJson)) {
				throw new Error('GitHub releases response is not an array');
			}

			const parsed = parseGitHubReleasesResponse(repo, rawJson as GitHubReleaseRaw[]);
			const nowIso = new Date().toISOString();
			const updatedSnapshot: GitHubAppReleaseSnapshot = {
				repo,
				etag: res.headers.get('etag') ?? null,
				syncedAt: nowIso,
				syncError: null,
				releases: parsed.releases,
				latestAndroid: parsed.latestAndroid,
				latestIos: parsed.latestIos,
			};
			await this.saveSnapshot(updatedSnapshot);

			return {
				ok: true,
				repo,
				autoFetchGithub: true,
				syncedAt: updatedSnapshot.syncedAt,
				error: null,
				latestAndroidVersion: updatedSnapshot.latestAndroid?.version ?? null,
				latestIosVersion: updatedSnapshot.latestIos?.version ?? null,
				releaseCount: updatedSnapshot.releases.length,
			};
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			this.logger.warn(`Failed to sync GitHub releases for ${repo}: ${errorMessage}`);

			const preservedSnapshot: GitHubAppReleaseSnapshot = {
				repo,
				etag: existing?.etag ?? null,
				syncedAt: existing?.syncedAt ?? null,
				syncError: errorMessage,
				releases: existing?.releases ?? [],
				latestAndroid: existing?.latestAndroid ?? null,
				latestIos: existing?.latestIos ?? null,
			};
			await this.saveSnapshot(preservedSnapshot);

			return {
				ok: false,
				repo,
				autoFetchGithub: true,
				syncedAt: preservedSnapshot.syncedAt,
				error: errorMessage,
				latestAndroidVersion: preservedSnapshot.latestAndroid?.version ?? null,
				latestIosVersion: preservedSnapshot.latestIos?.version ?? null,
				releaseCount: preservedSnapshot.releases.length,
			};
		}
	}
}
