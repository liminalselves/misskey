/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { resolve } from 'node:path';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Config } from '@/config.js';
import type { DriveFilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { StatusError } from '@/misc/status-error.js';
import { contentDisposition } from '@/misc/content-disposition.js';
import type Logger from '@/logger.js';
import { AppReleaseService } from '@/core/AppReleaseService.js';
import { DownloadService } from '@/core/DownloadService.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { FileInfoService } from '@/core/FileInfoService.js';
import { ImageProcessingService } from '@/core/ImageProcessingService.js';
import { VideoProcessingService } from '@/core/VideoProcessingService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { DriveMissingObjectService } from '@/core/DriveMissingObjectService.js';
import { bindThis } from '@/decorators.js';
import { handleRequestRedirectToOmitSearch } from '@/misc/fastify-hook-handlers.js';
import { FileServerDriveHandler } from './file/FileServerDriveHandler.js';
import { FileServerFileResolver } from './file/FileServerFileResolver.js';
import { FileServerProxyHandler } from './file/FileServerProxyHandler.js';
import { handleRangeRequest } from './file/FileServerUtils.js';
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginOptions } from 'fastify';

@Injectable()
export class FileServerService {
	private logger: Logger;
	private driveHandler: FileServerDriveHandler;
	private proxyHandler: FileServerProxyHandler;
	private fileResolver: FileServerFileResolver;

	private readonly assets: string;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private fileInfoService: FileInfoService,
		private downloadService: DownloadService,
		private imageProcessingService: ImageProcessingService,
		private videoProcessingService: VideoProcessingService,
		private internalStorageService: InternalStorageService,
		private loggerService: LoggerService,
		private driveMissingObjectService: DriveMissingObjectService,
		@Optional()
		private appReleaseService?: AppReleaseService,
	) {
		this.logger = this.loggerService.getLogger('server', 'gray');
		this.assets = resolve(this.config.rootDir, 'packages/backend/src/server/file/assets');
		this.fileResolver = new FileServerFileResolver(
			this.driveFilesRepository,
			this.fileInfoService,
			this.downloadService,
			this.internalStorageService,
		);
		this.driveHandler = new FileServerDriveHandler(
			this.config,
			this.fileResolver,
			this.assets,
			this.videoProcessingService,
		);
		this.proxyHandler = new FileServerProxyHandler(
			this.config,
			this.fileResolver,
			this.assets,
			this.imageProcessingService,
		);

		//this.createServer = this.createServer.bind(this);
	}

	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.addHook('onRequest', (request, reply, done) => {
			reply.header('Content-Security-Policy', 'default-src \'none\'; img-src \'self\'; media-src \'self\'; style-src \'unsafe-inline\'');
			if (process.env.NODE_ENV === 'development') {
				reply.header('Access-Control-Allow-Origin', '*');
			}
			done();
		});

		fastify.register((fastify, options, done) => {
			fastify.addHook('onRequest', handleRequestRedirectToOmitSearch);
			fastify.get('/files/app-default.jpg', (request, reply) => {
				const file = fs.createReadStream(`${this.assets}/dummy.png`);
				reply.header('Content-Type', 'image/jpeg');
				reply.header('Cache-Control', 'max-age=31536000, immutable');
				return reply.send(file);
			});

			fastify.get<{ Params: { version: string; filename: string } }>('/files/app-releases/:version/:filename', async (request, reply) => {
				return await this.handleAppReleaseDownload(request, reply);
			});

			fastify.get<{ Params: { key: string; } }>('/files/:key', async (request, reply) => {
				return await this.driveHandler.handle(request, reply)
					.catch(err => this.errorHandler(request, reply, err));
			});
			fastify.get<{ Params: { key: string; } }>('/files/:key/*', async (request, reply) => {
				return await reply.redirect(`${this.config.url}/files/${request.params.key}`, 301);
			});
			done();
		});

		fastify.get<{
			Params: { url: string; };
			Querystring: { url?: string; };
		}>('/proxy/:url*', async (request, reply) => {
			return await this.proxyHandler.handle(request, reply)
				.catch(err => {
					this.reportMissingObjectIfNotFound(request, err);
					return this.errorHandler(request, reply, err);
				});
		});

		done();
	}

	/**
	 * 代理拉取对象存储里的本地文件得到 404 时，交给核查服务确认是否真的丢失。
	 * 只传目标 URL，是否修复由服务独立验证；任何异常都不影响本次响应。
	 */
	@bindThis
	private reportMissingObjectIfNotFound(request: FastifyRequest<{ Params?: { [x: string]: any }; Querystring?: { [x: string]: any }; }>, err: unknown): void {
		if (!(err instanceof StatusError) || err.statusCode !== 404) return;

		const target = typeof request.query?.url === 'string'
			? request.query.url
			: typeof request.params?.url === 'string' ? `https://${request.params.url}` : null;
		if (target == null) return;

		this.driveMissingObjectService.reportByUrl(target).catch(() => {});
	}

	@bindThis
	private async handleAppReleaseDownload(
		request: FastifyRequest<{ Params: { version: string; filename: string } }>,
		reply: FastifyReply,
	) {
		if (!this.appReleaseService) {
			reply.code(404);
			return { error: 'Not found' };
		}

		try {
			const asset = await this.appReleaseService.resolveRelayedAssetForDownload(
				request.params.version,
				request.params.filename,
			);
			if (!asset) {
				reply.code(404);
				return { error: 'Not found' };
			}

			reply.header('Content-Type', asset.mimeType);
			reply.header('Cache-Control', 'public, max-age=31536000, immutable');
			reply.header('Content-Disposition', contentDisposition('attachment', asset.filename));
			return handleRangeRequest(reply, request.headers.range as string | undefined, asset.size, asset.filePath);
		} catch (err) {
			this.logger.error(`Failed to relay app release ${request.params.version}/${request.params.filename}: ${err instanceof Error ? err.message : String(err)}`);
			reply.code(502);
			return { error: 'Upstream download failed' };
		}
	}

	@bindThis
	private async errorHandler(request: FastifyRequest<{ Params?: { [x: string]: any }; Querystring?: { [x: string]: any }; }>, reply: FastifyReply, err?: any) {
		// 带上请求路径才能反查是哪个文件/远程地址出错（/files/:key 对应 drive_file 访问键，/proxy/ 后即目标 URL）
		this.logger.error(`${err} (${request.method} ${request.raw.url?.split('?')[0] ?? request.url})`);

		reply.header('Cache-Control', 'max-age=300');

		if (request.query && 'fallback' in request.query) {
			return reply.sendFile('/dummy.png', this.assets);
		}

		if (err instanceof StatusError && (err.statusCode === 302 || err.isClientError)) {
			reply.code(err.statusCode);
			return;
		}

		reply.code(500);
		return;
	}
}
