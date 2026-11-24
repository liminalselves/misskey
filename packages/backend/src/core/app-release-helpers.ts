/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiNativeClientAppInfo } from '@/models/Meta.js';

export const DEFAULT_APP_GITHUB_REPO = 'liminalselves/liminalselves_app';

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)$/;
const MIN_VERSION_COMMENT_RE = /<!--\s*min-version:\s*(v?\d+\.\d+\.\d+)\s*-->/i;
const GITHUB_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA256_DIGEST_RE = /^sha256:([0-9a-f]{64})$/i;

export type SemverTuple = [number, number, number];

export type GitHubReleaseAssetRaw = {
	name?: string | null;
	state?: string | null;
	size?: number | null;
	digest?: string | null;
	browser_download_url?: string | null;
	download_count?: number | null;
};

export type GitHubReleaseRaw = {
	tag_name?: string | null;
	name?: string | null;
	body?: string | null;
	draft?: boolean | null;
	prerelease?: boolean | null;
	published_at?: string | null;
	html_url?: string | null;
	assets?: GitHubReleaseAssetRaw[] | null;
};

export type AppReleaseAsset = {
	name: string;
	size: number;
	sha256: string | null;
	rawDownloadUrl: string;
	downloadCount: number;
};

export type ClassifiedAppAssets = {
	android?: AppReleaseAsset;
	ios?: AppReleaseAsset;
};

export type AppReleaseItem = {
	version: string;
	tagName: string;
	name: string;
	publishedAt: string | null;
	releaseUrl: string;
	minVersion: string | null;
	notes: string;
	assets: ClassifiedAppAssets;
	allAssetsUploaded: boolean;
};

export type LatestAppReleaseEntry = {
	version: string;
	tagName: string;
	name: string;
	publishedAt: string | null;
	releaseUrl: string;
	minVersion: string | null;
	notes: string;
	asset: AppReleaseAsset;
};

export type GitHubAppReleaseSnapshot = {
	repo: string;
	etag: string | null;
	syncedAt: string | null;
	syncError: string | null;
	releases: AppReleaseItem[];
	latestAndroid: LatestAppReleaseEntry | null;
	latestIos: LatestAppReleaseEntry | null;
};

export type EffectiveNativeClientAppInfo = {
	latestAndroidVersion: string | null;
	latestIosVersion: string | null;
	minRequiredAppVersion: string | null;
	androidDownloadUrl: string | null;
	iosDownloadUrl: string | null;
	changelog: Array<{ version: string; content: string }>;
	announcement: string | null;
};

/** Parse "v1.2.3" / "1.2.3" into [1, 2, 3]; returns null when it is not a plain x.y.z version. */
export function parseSemver(text: unknown): SemverTuple | null {
	const m = SEMVER_RE.exec(String(text ?? '').trim());
	if (!m) return null;
	return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function normalizeSemver(text: unknown): string | null {
	const parsed = parseSemver(text);
	return parsed ? `${parsed[0]}.${parsed[1]}.${parsed[2]}` : null;
}

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
	const pa = parseSemver(a);
	const pb = parseSemver(b);
	if (!pa || !pb) {
		throw new Error(`invalid version: ${!pa ? a : b}`);
	}
	for (let i = 0; i < 3; i++) {
		if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
	}
	return 0;
}

/** Extract `min-version` HTML comment and strip comments + GitHub auto-generated release note noise. */
export function parseGitHubReleaseBody(body: unknown): { notes: string; minVersion: string | null } {
	const text = String(body ?? '').replace(/\r\n/g, '\n');
	const minVersionRaw = MIN_VERSION_COMMENT_RE.exec(text)?.[1];
	const minVersion = minVersionRaw ? normalizeSemver(minVersionRaw) : null;

	const stripped = text
		.replace(/<!--[\s\S]*?-->\n?/g, '')
		.replace(/^##\s+What's Changed\s*$/gim, '')
		.replace(/^##\s+New Contributors\s*$/gim, '')
		.replace(/^\*\*Full Changelog\*\*:?.*$/gim, '')
		.replace(/^[-*]\s+.+?\s+by\s+@\S+\s+in\s+https?:\/\/\S+\s*$/gim, '')
		.replace(/^[-*]\s+@\S+\s+made their first contribution\s+in\s+https?:\/\/\S+\s*$/gim, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	return { notes: stripped, minVersion };
}

/** Filter uploaded assets and map `.apk` -> android and `.ipa` -> ios. */
export function classifyAppReleaseAssets(assets: readonly GitHubReleaseAssetRaw[] | null | undefined): ClassifiedAppAssets {
	const uploaded = (assets ?? []).filter(
		(a): a is GitHubReleaseAssetRaw & { name: string; browser_download_url: string } =>
			a != null
			&& a.state === 'uploaded'
			&& typeof a.name === 'string'
			&& a.name.length > 0
			&& typeof a.browser_download_url === 'string'
			&& a.browser_download_url.length > 0,
	);

	const mapAsset = (asset: GitHubReleaseAssetRaw & { name: string; browser_download_url: string }): AppReleaseAsset => ({
		name: asset.name,
		size: typeof asset.size === 'number' && Number.isFinite(asset.size) ? asset.size : 0,
		sha256: SHA256_DIGEST_RE.exec(asset.digest ?? '')?.[1]?.toLowerCase() ?? null,
		rawDownloadUrl: asset.browser_download_url,
		downloadCount: typeof asset.download_count === 'number' && Number.isFinite(asset.download_count) ? asset.download_count : 0,
	});

	const result: ClassifiedAppAssets = {};
	const androidAsset = uploaded.find(a => /\.apk$/i.test(a.name));
	if (androidAsset) {
		result.android = mapAsset(androidAsset);
	}
	const iosAsset = uploaded.find(a => /\.ipa$/i.test(a.name));
	if (iosAsset) {
		result.ios = mapAsset(iosAsset);
	}
	return result;
}

export function isValidGitHubRepo(repo: unknown): repo is string {
	if (typeof repo !== 'string' || !GITHUB_REPO_RE.test(repo)) return false;
	const [owner, name] = repo.split('/');
	return owner !== '.' && owner !== '..' && name !== '.' && name !== '..';
}

export function normalizeGitHubRepo(repo?: string | null): string {
	const trimmed = typeof repo === 'string' ? repo.trim() : '';
	if (!trimmed) return DEFAULT_APP_GITHUB_REPO;
	return isValidGitHubRepo(trimmed) ? trimmed : DEFAULT_APP_GITHUB_REPO;
}

export function isValidDownloadProxy(proxyPrefix: unknown): proxyPrefix is string {
	if (typeof proxyPrefix !== 'string') return false;
	const trimmed = proxyPrefix.trim();
	if (!trimmed) return false;
	try {
		const parsed = new URL(trimmed);
		return parsed.protocol === 'https:';
	} catch {
		return false;
	}
}

export function applyDownloadProxy(url: string, proxyPrefix?: string | null): string;
export function applyDownloadProxy(url: string | null | undefined, proxyPrefix?: string | null): string | null;
export function applyDownloadProxy(url: string | null | undefined, proxyPrefix?: string | null): string | null {
	if (!url) return null;
	const trimmedProxy = typeof proxyPrefix === 'string' ? proxyPrefix.trim() : '';
	if (!trimmedProxy || !isValidDownloadProxy(trimmedProxy)) return url;
	return `${trimmedProxy.replace(/\/+$/, '')}/${url}`;
}

export function parseGitHubReleasesResponse(repo: string, rawReleases: readonly GitHubReleaseRaw[]): {
	releases: AppReleaseItem[];
	latestAndroid: LatestAppReleaseEntry | null;
	latestIos: LatestAppReleaseEntry | null;
} {
	const releases: AppReleaseItem[] = [];

	for (const r of rawReleases) {
		if (!r || r.draft || r.prerelease) continue;
		const version = normalizeSemver(r.tag_name);
		if (!version) continue;

		const tagName = String(r.tag_name).trim();
		const name = (typeof r.name === 'string' && r.name.trim()) ? r.name.trim() : tagName;
		const publishedAt = typeof r.published_at === 'string' ? r.published_at : null;
		const releaseUrl = (typeof r.html_url === 'string' && r.html_url)
			? r.html_url
			: `https://github.com/${repo}/releases/tag/${encodeURIComponent(tagName)}`;
		const { notes, minVersion } = parseGitHubReleaseBody(r.body);
		const rawAssets = Array.isArray(r.assets) ? r.assets : [];
		const allAssetsUploaded = rawAssets.every(a => a?.state === 'uploaded');
		const assets = classifyAppReleaseAssets(rawAssets);

		releases.push({
			version,
			tagName,
			name,
			publishedAt,
			releaseUrl,
			minVersion,
			notes,
			assets,
			allAssetsUploaded,
		});
	}

	releases.sort((a, b) => compareSemver(b.version, a.version));

	let latestAndroid: LatestAppReleaseEntry | null = null;
	let latestIos: LatestAppReleaseEntry | null = null;

	for (const release of releases) {
		if (!release.allAssetsUploaded) continue;
		if (!latestAndroid && release.assets.android) {
			latestAndroid = {
				version: release.version,
				tagName: release.tagName,
				name: release.name,
				publishedAt: release.publishedAt,
				releaseUrl: release.releaseUrl,
				minVersion: release.minVersion,
				notes: release.notes,
				asset: release.assets.android,
			};
		}
		if (!latestIos && release.assets.ios) {
			latestIos = {
				version: release.version,
				tagName: release.tagName,
				name: release.name,
				publishedAt: release.publishedAt,
				releaseUrl: release.releaseUrl,
				minVersion: release.minVersion,
				notes: release.notes,
				asset: release.assets.ios,
			};
		}
		if (latestAndroid && latestIos) break;
	}

	return { releases, latestAndroid, latestIos };
}

function snapshotHasData(snapshot: GitHubAppReleaseSnapshot | null | undefined): snapshot is GitHubAppReleaseSnapshot {
	if (!snapshot) return false;
	return snapshot.latestAndroid != null || snapshot.latestIos != null || snapshot.releases.length > 0;
}

export function buildEffectiveNativeClientAppInfo(
	stored: MiNativeClientAppInfo | null | undefined,
	githubSnapshot: GitHubAppReleaseSnapshot | null | undefined,
): EffectiveNativeClientAppInfo {
	const s = stored ?? {};
	const storedChangelog = Array.isArray(s.changelog) ? s.changelog : [];

	if (s.autoFetchGithub !== false && snapshotHasData(githubSnapshot)) {
		const minRequiredStored = s.minRequiredAppVersion?.trim();
		const androidUrl = githubSnapshot.latestAndroid
			? applyDownloadProxy(githubSnapshot.latestAndroid.asset.rawDownloadUrl, s.githubDownloadProxy)
			: null;
		const iosUrl = githubSnapshot.latestIos
			? applyDownloadProxy(githubSnapshot.latestIos.asset.rawDownloadUrl, s.githubDownloadProxy)
			: null;

		return {
			latestAndroidVersion: githubSnapshot.latestAndroid?.version ?? s.latestAndroidVersion ?? null,
			latestIosVersion: githubSnapshot.latestIos?.version ?? s.latestIosVersion ?? null,
			minRequiredAppVersion: minRequiredStored || githubSnapshot.latestAndroid?.minVersion || githubSnapshot.latestIos?.minVersion || null,
			androidDownloadUrl: androidUrl ?? s.androidDownloadUrl ?? null,
			iosDownloadUrl: iosUrl ?? s.iosDownloadUrl ?? null,
			changelog: githubSnapshot.releases.length > 0
				? githubSnapshot.releases.map(r => ({ version: r.version, content: r.notes || r.name }))
				: storedChangelog,
			announcement: s.announcement ?? null,
		};
	}

	return {
		latestAndroidVersion: s.latestAndroidVersion ?? null,
		latestIosVersion: s.latestIosVersion ?? null,
		minRequiredAppVersion: s.minRequiredAppVersion ?? null,
		androidDownloadUrl: s.androidDownloadUrl ?? null,
		iosDownloadUrl: s.iosDownloadUrl ?? null,
		changelog: storedChangelog,
		announcement: s.announcement ?? null,
	};
}
