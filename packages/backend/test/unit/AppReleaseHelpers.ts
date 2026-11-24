/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { describe, expect, test, vi } from 'vitest';
import {
	DEFAULT_APP_GITHUB_REPO,
	applyDownloadProxy,
	buildEffectiveNativeClientAppInfo,
	classifyAppReleaseAssets,
	compareSemver,
	isValidGitHubRepo,
	normalizeGitHubRepo,
	parseGitHubReleaseBody,
	parseGitHubReleasesResponse,
	parseSemver,
} from '@/core/app-release-helpers.js';
import { AppReleaseService } from '@/core/AppReleaseService.js';

describe('app-release-helpers', () => {
	test('parseSemver and compareSemver handle v-prefixed and plain x.y.z versions', () => {
		expect(parseSemver('v1.2.3')).toEqual([1, 2, 3]);
		expect(parseSemver(' 2.10.0 ')).toEqual([2, 10, 0]);
		expect(parseSemver('v1.2.3-beta.1')).toBeNull();
		expect(parseSemver('1.2')).toBeNull();

		expect(compareSemver('v1.10.0', '1.2.0')).toBe(1);
		expect(compareSemver('1.2.0', 'v1.2.0')).toBe(0);
		expect(compareSemver('1.2.0', '1.2.1')).toBe(-1);
		expect(() => compareSemver('bad', '1.0.0')).toThrow();
	});

	test('parseGitHubReleaseBody extracts min-version and strips comments and GitHub noise', () => {
		const body = [
			'<!-- min-version: v1.4.0 -->',
			'<!-- internal maintainer note -->',
			'### 变更',
			'- 新增离线消息提醒',
			'',
			'### 修复',
			'- 修复深色模式闪烁',
			'',
			"## What's Changed",
			'- feat: offline push by @alice in https://github.com/liminalselves/liminalselves_app/pull/12',
			'* fix: dark mode by @bob in https://github.com/liminalselves/liminalselves_app/pull/13',
			'',
			'## New Contributors',
			'* @bob made their first contribution in https://github.com/liminalselves/liminalselves_app/pull/13',
			'',
			'**Full Changelog**: https://github.com/liminalselves/liminalselves_app/compare/v1.3.0...v1.4.1',
		].join('\r\n');

		const parsed = parseGitHubReleaseBody(body);
		expect(parsed.minVersion).toBe('1.4.0');
		expect(parsed.notes).toBe([
			'### 变更',
			'- 新增离线消息提醒',
			'',
			'### 修复',
			'- 修复深色模式闪烁',
		].join('\n'));
	});

	test('classifyAppReleaseAssets filters uploaded assets and extracts sha256 digest', () => {
		const assets = classifyAppReleaseAssets([
			{
				name: 'app-release.apk',
				state: 'starter',
				size: 100,
				digest: 'sha256:' + 'a'.repeat(64),
				browser_download_url: 'https://github.com/org/repo/releases/download/v1.0.0/uploading.apk',
				download_count: 1,
			},
			{
				name: 'liminalselves-v1.0.0.APK',
				state: 'uploaded',
				size: 42_000_000,
				digest: 'sha256:' + 'A'.repeat(64),
				browser_download_url: 'https://github.com/org/repo/releases/download/v1.0.0/liminalselves-v1.0.0.APK',
				download_count: 123,
			},
			{
				name: 'liminalselves-v1.0.0.ipa',
				state: 'uploaded',
				size: 38_000_000,
				digest: null,
				browser_download_url: 'https://github.com/org/repo/releases/download/v1.0.0/liminalselves-v1.0.0.ipa',
				download_count: 45,
			},
		]);

		expect(assets).toEqual({
			android: {
				name: 'liminalselves-v1.0.0.APK',
				size: 42_000_000,
				sha256: 'a'.repeat(64),
				rawDownloadUrl: 'https://github.com/org/repo/releases/download/v1.0.0/liminalselves-v1.0.0.APK',
				downloadCount: 123,
			},
			ios: {
				name: 'liminalselves-v1.0.0.ipa',
				size: 38_000_000,
				sha256: null,
				rawDownloadUrl: 'https://github.com/org/repo/releases/download/v1.0.0/liminalselves-v1.0.0.ipa',
				downloadCount: 45,
			},
		});
	});

	test('normalizeGitHubRepo and isValidGitHubRepo validate owner/repo format', () => {
		expect(isValidGitHubRepo('liminalselves/liminalselves_app')).toBe(true);
		expect(isValidGitHubRepo('Org.Name-1/Repo_2.app')).toBe(true);
		expect(isValidGitHubRepo('invalid')).toBe(false);
		expect(isValidGitHubRepo('a/b/c')).toBe(false);
		expect(isValidGitHubRepo('../repo')).toBe(false);
		expect(isValidGitHubRepo('owner/..')).toBe(false);

		expect(normalizeGitHubRepo('  custom/app-repo  ')).toBe('custom/app-repo');
		expect(normalizeGitHubRepo('')).toBe(DEFAULT_APP_GITHUB_REPO);
		expect(normalizeGitHubRepo('invalid')).toBe(DEFAULT_APP_GITHUB_REPO);
	});

	test('applyDownloadProxy prefixes only valid https proxy URLs', () => {
		const raw = 'https://github.com/liminalselves/liminalselves_app/releases/download/v1.0.0/app.apk';
		expect(applyDownloadProxy(raw, 'https://mirror.example.com/')).toBe(`https://mirror.example.com/${raw}`);
		expect(applyDownloadProxy(raw, 'https://mirror.example.com')).toBe(`https://mirror.example.com/${raw}`);
		expect(applyDownloadProxy(raw, 'http://mirror.example.com')).toBe(raw);
		expect(applyDownloadProxy(raw, '')).toBe(raw);
		expect(applyDownloadProxy(null, 'https://mirror.example.com')).toBeNull();
	});

	test('parseGitHubReleasesResponse skips incomplete releases, drafts, and prereleases when picking latest', () => {
		const parsed = parseGitHubReleasesResponse(DEFAULT_APP_GITHUB_REPO, [
			{
				tag_name: 'v2.0.0-rc.1',
				prerelease: true,
				assets: [{ name: 'app.apk', state: 'uploaded', size: 1, browser_download_url: 'https://example.com/rc.apk' }],
			},
			{
				tag_name: 'v1.5.0',
				draft: false,
				prerelease: false,
				name: 'Release 1.5.0',
				body: '<!-- min-version: v1.3.0 -->\n### 变更\n- 新版发布',
				assets: [
					{ name: 'app-1.5.0.apk', state: 'uploaded', size: 100, browser_download_url: 'https://example.com/1.5.0.apk', download_count: 5 },
					{ name: 'app-1.5.0.ipa', state: 'starter', size: 200, browser_download_url: 'https://example.com/1.5.0.ipa', download_count: 0 },
				],
			},
			{
				tag_name: 'v1.4.0',
				draft: false,
				prerelease: false,
				name: 'Release 1.4.0',
				body: '<!-- min-version: v1.2.0 -->\n### 变更\n- 稳定版',
				assets: [
					{ name: 'app-1.4.0.apk', state: 'uploaded', size: 90, browser_download_url: 'https://example.com/1.4.0.apk', download_count: 10 },
					{ name: 'app-1.4.0.ipa', state: 'uploaded', size: 180, browser_download_url: 'https://example.com/1.4.0.ipa', download_count: 8 },
				],
			},
		]);

		expect(parsed.releases.map(r => r.version)).toEqual(['1.5.0', '1.4.0']);
		expect(parsed.latestAndroid?.version).toBe('1.4.0');
		expect(parsed.latestIos?.version).toBe('1.4.0');
	});

	test('buildEffectiveNativeClientAppInfo applies GitHub snapshot, proxy, min-version override, and manual fallback', () => {
		const parsed = parseGitHubReleasesResponse(DEFAULT_APP_GITHUB_REPO, [
			{
				tag_name: 'v1.2.0',
				name: 'v1.2.0',
				body: '<!-- min-version: v1.1.0 -->\n### 变更\n- 功能更新',
				assets: [
					{ name: 'app.apk', state: 'uploaded', size: 100, browser_download_url: 'https://github.com/a/b/app.apk', download_count: 1 },
					{ name: 'app.ipa', state: 'uploaded', size: 120, browser_download_url: 'https://github.com/a/b/app.ipa', download_count: 2 },
				],
			},
		]);
		const snapshot = {
			repo: DEFAULT_APP_GITHUB_REPO,
			etag: '"etag-1"',
			syncedAt: '2026-11-24T00:00:00.000Z',
			syncError: null,
			...parsed,
		};

		const merged = buildEffectiveNativeClientAppInfo({
			autoFetchGithub: true,
			githubDownloadProxy: 'https://ghproxy.example.com/',
			minRequiredAppVersion: '',
			announcement: '维护公告',
			latestAndroidVersion: '0.9.0',
			androidDownloadUrl: 'https://manual.example.com/app.apk',
		}, snapshot);

		expect(merged).toEqual({
			latestAndroidVersion: '1.2.0',
			latestIosVersion: '1.2.0',
			minRequiredAppVersion: '1.1.0',
			androidDownloadUrl: 'https://ghproxy.example.com/https://github.com/a/b/app.apk',
			iosDownloadUrl: 'https://ghproxy.example.com/https://github.com/a/b/app.ipa',
			changelog: [{ version: '1.2.0', content: '### 变更\n- 功能更新' }],
			announcement: '维护公告',
		});

		const overriddenMin = buildEffectiveNativeClientAppInfo({
			autoFetchGithub: true,
			minRequiredAppVersion: '1.2.0',
		}, snapshot);
		expect(overriddenMin.minRequiredAppVersion).toBe('1.2.0');

		const disabled = buildEffectiveNativeClientAppInfo({
			autoFetchGithub: false,
			latestAndroidVersion: '0.9.0',
			androidDownloadUrl: 'https://manual.example.com/app.apk',
			changelog: [{ version: '0.9.0', content: 'manual' }],
			announcement: '手动公告',
		}, snapshot);
		expect(disabled).toEqual({
			latestAndroidVersion: '0.9.0',
			latestIosVersion: null,
			minRequiredAppVersion: null,
			androidDownloadUrl: 'https://manual.example.com/app.apk',
			iosDownloadUrl: null,
			changelog: [{ version: '0.9.0', content: 'manual' }],
			announcement: '手动公告',
		});
	});
});

function createHarness(initialMeta: Record<string, unknown> = {}) {
	const redisStore = new Map<string, string>();
	const redisClient = {
		get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
		set: vi.fn(async (key: string, val: string) => {
			redisStore.set(key, val);
			return 'OK';
		}),
	};
	const metaObj = {
		nativeClientAppInfo: { ...initialMeta },
	};
	const metaService = {
		fetch: vi.fn(async () => metaObj),
	};
	const send = vi.fn();
	const httpRequestService = { send };
	const loggerService = {
		getLogger: () => ({
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		}),
	};

	const service = new AppReleaseService(
		{} as never,
		redisClient as never,
		metaObj as never,
		metaService as never,
		httpRequestService as never,
		loggerService as never,
	);

	return { service, redisStore, redisClient, metaObj, send };
}

function mockJsonResponse(status: number, data: unknown, headers: Record<string, string> = {}) {
	const buf = Buffer.from(JSON.stringify(data), 'utf8');
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 200 ? 'OK' : 'Error',
		headers: new Headers(headers),
		body: null,
		arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
	};
}

describe('AppReleaseService', () => {
	test('syncs releases, skips incomplete releases for latest, handles 304 ETag and preserves stale cache on error', async () => {
		const { service, send, redisClient } = createHarness({
			githubDownloadProxy: 'https://proxy.example.com/',
			announcement: '欢迎使用官方客户端',
		});

		// 1. Initial 200 OK sync: v2.0.0 has an uploading asset, v1.9.0 is complete
		send.mockResolvedValueOnce(mockJsonResponse(200, [
			{
				tag_name: 'v2.0.0',
				name: 'v2.0.0',
				body: '<!-- min-version: v2.0.0 -->\n### 变更\n- 大版本',
				published_at: '2026-11-24T01:00:00Z',
				html_url: 'https://github.com/liminalselves/liminalselves_app/releases/tag/v2.0.0',
				assets: [
					{ name: 'app.apk', state: 'uploaded', size: 100, browser_download_url: 'https://github.com/a/b/v2.apk', download_count: 1 },
					{ name: 'app.ipa', state: 'starter', size: 200, browser_download_url: 'https://github.com/a/b/v2.ipa', download_count: 0 },
				],
			},
			{
				tag_name: 'v1.9.0',
				name: 'v1.9.0',
				body: '<!-- min-version: v1.5.0 -->\n### 修复\n- 稳定性修复',
				published_at: '2026-11-20T01:00:00Z',
				html_url: 'https://github.com/liminalselves/liminalselves_app/releases/tag/v1.9.0',
				assets: [
					{ name: 'app.apk', state: 'uploaded', size: 95, digest: 'sha256:' + 'b'.repeat(64), browser_download_url: 'https://github.com/a/b/v1.9.apk', download_count: 50 },
					{ name: 'app.ipa', state: 'uploaded', size: 110, digest: 'sha256:' + 'c'.repeat(64), browser_download_url: 'https://github.com/a/b/v1.9.ipa', download_count: 25 },
				],
			},
		], { etag: '"v1-etag"' }));

		const res1 = await service.syncNow({ force: true });
		expect(res1.ok).toBe(true);
		expect(res1.latestAndroidVersion).toBe('1.9.0');
		expect(res1.latestIosVersion).toBe('1.9.0');
		expect(res1.releaseCount).toBe(2);
		expect(redisClient.set).toHaveBeenCalledWith(
			`appRelease:github:${DEFAULT_APP_GITHUB_REPO}`,
			expect.any(String),
			'EX',
			86400,
		);

		const effective1 = await service.getEffectiveNativeClientAppInfo();
		expect(effective1.latestAndroidVersion).toBe('1.9.0');
		expect(effective1.minRequiredAppVersion).toBe('1.5.0');
		expect(effective1.androidDownloadUrl).toBe('https://proxy.example.com/https://github.com/a/b/v1.9.apk');

		// 2. Subsequent sync gets 304 Not Modified and destroys body stream
		const destroy = vi.fn();
		send.mockResolvedValueOnce({
			ok: false,
			status: 304,
			statusText: 'Not Modified',
			headers: new Headers({ etag: '"v1-etag"' }),
			body: { destroy },
		});

		const res2 = await service.syncNow({ force: true });
		expect(send.mock.calls[1]![1].headers['If-None-Match']).toBe('"v1-etag"');
		expect(destroy).toHaveBeenCalledTimes(1);
		expect(res2.ok).toBe(true);
		expect(res2.latestAndroidVersion).toBe('1.9.0');
		expect(res2.releaseCount).toBe(2);

		// 3. Subsequent sync fails with 403 rate limit: records syncError, preserves cached releases
		send.mockResolvedValueOnce(mockJsonResponse(403, { message: 'API rate limit exceeded' }));
		const res3 = await service.syncNow({ force: true });
		expect(res3.ok).toBe(false);
		expect(res3.error).toContain('403');
		expect(res3.error).toContain('API rate limit exceeded');
		expect(res3.latestAndroidVersion).toBe('1.9.0');
		expect(res3.releaseCount).toBe(2);

		const publicView = await service.getPublicReleasesView();
		expect(publicView.syncError).toContain('403');
		expect(publicView.latest.android?.downloadUrl).toBe('https://proxy.example.com/https://github.com/a/b/v1.9.apk');
		expect(publicView.latest.android?.sha256).toBe('b'.repeat(64));
		expect(publicView.releases).toHaveLength(2);
		expect(publicView.releases[1]?.isLatest).toBe(true);
		expect(publicView.releases[0]?.isLatest).toBe(false);
	});

	test('deduplicates concurrent syncs via single-flight and falls back to stored metadata when autoFetchGithub is false', async () => {
		const { service, send, metaObj } = createHarness({
			autoFetchGithub: true,
			latestAndroidVersion: '0.8.0',
			androidDownloadUrl: 'https://manual.example.com/0.8.0.apk',
			changelog: [{ version: '0.8.0', content: '手动记录' }],
			announcement: '手动模式公告',
		});

		let resolveFetch!: (val: unknown) => void;
		send.mockImplementationOnce(() => new Promise(r => { resolveFetch = r; }));

		const p1 = service.syncNow({ force: true });
		const p2 = service.syncNow({ force: true });
		await vi.waitFor(() => {
			expect(send).toHaveBeenCalledTimes(1);
		});

		resolveFetch(mockJsonResponse(200, []));
		const [r1, r2] = await Promise.all([p1, p2]);
		expect(r1.ok).toBe(true);
		expect(r2.ok).toBe(true);
		expect(send).toHaveBeenCalledTimes(1);

		metaObj.nativeClientAppInfo = {
			...metaObj.nativeClientAppInfo,
			autoFetchGithub: false,
		};
		const view = await service.getPublicReleasesView(metaObj.nativeClientAppInfo);
		expect(view.autoFetchGithub).toBe(false);
		expect(view.latest.android?.version).toBe('0.8.0');
		expect(view.latest.android?.downloadUrl).toBe('https://manual.example.com/0.8.0.apk');
		expect(view.releases).toHaveLength(1);
		expect(view.releases[0]?.notes).toBe('手动记录');
	});
});
