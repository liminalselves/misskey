/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { describe, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';
import type { AppReleaseService } from '@/core/AppReleaseService.js';
import { FileServerService } from '@/server/FileServerService.js';

function createRouteTestServer(appReleaseService?: Partial<AppReleaseService>, rootDir = tmpdir()) {
	const logger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	};
	const config = {
		url: 'https://misskey.example.com',
		rootDir,
	} as unknown as Config;

	const fileServerService = new FileServerService(
		config,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{ getLogger: () => logger } as never,
		{ reportByUrl: vi.fn() } as never,
		appReleaseService as AppReleaseService | undefined,
	);

	const fastify = Fastify();
	fileServerService.createServer(fastify, {}, () => {});
	return { fastify, logger };
}

describe('FileServerService app-releases route', () => {
	test('serves mirrored asset with attachment headers and range support', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'misskey-app-route-'));
		const filePath = join(dir, 'LiminalSelves_v1.1.1.apk');
		const payload = Buffer.from('0123456789abcdef', 'utf8');
		writeFileSync(filePath, payload);

		try {
			const { fastify } = createRouteTestServer({
				resolveRelayedAssetForDownload: vi.fn(async () => ({
					filePath,
					filename: 'LiminalSelves_v1.1.1.apk',
					size: payload.length,
					mimeType: 'application/vnd.android.package-archive',
				})),
				resolveFallbackDownloadUrl: vi.fn(async () => null),
			}, dir);

			try {
				const resFull = await fastify.inject({
					method: 'GET',
					url: '/files/app-releases/1.1.1/LiminalSelves_v1.1.1.apk',
				});
				expect(resFull.statusCode).toBe(200);
				expect(resFull.headers['content-type']).toBe('application/vnd.android.package-archive');
				expect(resFull.headers['content-disposition']).toContain('LiminalSelves_v1.1.1.apk');
				expect(resFull.rawPayload).toEqual(payload);

				const resRange = await fastify.inject({
					method: 'GET',
					url: '/files/app-releases/1.1.1/LiminalSelves_v1.1.1.apk',
					headers: { range: 'bytes=0-3' },
				});
				expect(resRange.statusCode).toBe(206);
				expect(resRange.headers['content-range']).toBe(`bytes 0-3/${payload.length}`);
				expect(resRange.rawPayload).toEqual(Buffer.from('0123', 'utf8'));
			} finally {
				await fastify.close();
			}
		} finally {
			if (fs.existsSync(dir)) {
				rmSync(dir, { recursive: true, force: true });
			}
		}
	});

	test('returns 404 for unknown asset, 302 fallback redirect on mirror failure when URL available, and 502 otherwise', async () => {
		const resolveRelayedAssetForDownload = vi.fn();
		const resolveFallbackDownloadUrl = vi.fn();
		const { fastify, logger } = createRouteTestServer({
			resolveRelayedAssetForDownload,
			resolveFallbackDownloadUrl,
		});

		try {
			resolveRelayedAssetForDownload.mockResolvedValueOnce(null);
			const res404 = await fastify.inject({
				method: 'GET',
				url: '/files/app-releases/1.1.1/missing.apk',
			});
			expect(res404.statusCode).toBe(404);
			expect(res404.json()).toEqual({ error: 'Not found' });

			resolveRelayedAssetForDownload.mockRejectedValueOnce(new Error('EACCES: permission denied'));
			resolveFallbackDownloadUrl.mockResolvedValueOnce('https://ghproxy.test/https://github.com/org/repo/releases/download/v1.1.1/app.apk');
			const res302 = await fastify.inject({
				method: 'GET',
				url: '/files/app-releases/1.1.1/app.apk',
			});
			expect(res302.statusCode).toBe(302);
			expect(res302.headers.location).toBe('https://ghproxy.test/https://github.com/org/repo/releases/download/v1.1.1/app.apk');
			expect(res302.headers['cache-control']).toBe('no-store');
			expect(logger.error).toHaveBeenCalledTimes(1);

			resolveRelayedAssetForDownload.mockRejectedValueOnce(new Error('upstream timeout'));
			resolveFallbackDownloadUrl.mockResolvedValueOnce(null);
			const res502 = await fastify.inject({
				method: 'GET',
				url: '/files/app-releases/1.1.1/app.apk',
			});
			expect(res502.statusCode).toBe(502);
			expect(res502.json()).toEqual({ error: 'Upstream download failed' });
		} finally {
			await fastify.close();
		}
	});
});
