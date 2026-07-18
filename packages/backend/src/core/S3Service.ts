/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL } from 'node:url';
import * as http from 'node:http';
import * as https from 'node:https';
import { Injectable } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, PutObjectAclCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler, NodeHttpHandlerOptions } from '@smithy/node-http-handler';
import type { MiMeta } from '@/models/Meta.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { bindThis } from '@/decorators.js';
import type { DeleteObjectCommandInput, GetObjectCommandInput, PutObjectAclCommandInput, PutObjectCommandInput } from '@aws-sdk/client-s3';

function trimObjectStorageConfigValue(value: string | null | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === '' ? undefined : trimmed;
}

@Injectable()
export class S3Service {
	constructor(
		private httpRequestService: HttpRequestService,
	) {
	}

	@bindThis
	public getS3Client(meta: MiMeta): S3Client {
		const endpoint = trimObjectStorageConfigValue(meta.objectStorageEndpoint);
		const region = trimObjectStorageConfigValue(meta.objectStorageRegion);
		const accessKeyId = trimObjectStorageConfigValue(meta.objectStorageAccessKey);
		const secretAccessKey = trimObjectStorageConfigValue(meta.objectStorageSecretKey);

		const u = endpoint
			? `${meta.objectStorageUseSSL ? 'https' : 'http'}://${endpoint}`
			: `${meta.objectStorageUseSSL ? 'https' : 'http'}://example.net`; // dummy url to select http(s) agent

		const agent = this.httpRequestService.getAgentByUrl(new URL(u), !meta.objectStorageUseProxy, true);
		const handlerOption: NodeHttpHandlerOptions = {};
		if (meta.objectStorageUseSSL) {
			handlerOption.httpsAgent = agent as https.Agent;
		} else {
			handlerOption.httpAgent = agent as http.Agent;
		}

		return new S3Client({
			endpoint: endpoint ? u : undefined,
			credentials: (accessKeyId !== undefined && secretAccessKey !== undefined) ? {
				accessKeyId,
				secretAccessKey,
			} : undefined,
			region,
			tls: meta.objectStorageUseSSL,
			forcePathStyle: endpoint ? meta.objectStorageS3ForcePathStyle : false, // AWS with endPoint omitted
			requestHandler: new NodeHttpHandler(handlerOption),
			requestChecksumCalculation: 'WHEN_REQUIRED',
			responseChecksumValidation: 'WHEN_REQUIRED',
		});
	}

	@bindThis
	public async upload(meta: MiMeta, input: PutObjectCommandInput) {
		const client = this.getS3Client(meta);
		return new Upload({
			client,
			params: input,
			partSize: (client.config.endpoint && (await client.config.endpoint()).hostname === 'storage.googleapis.com')
				? 500 * 1024 * 1024
				: 8 * 1024 * 1024,
		}).done();
	}

	@bindThis
	public delete(meta: MiMeta, input: DeleteObjectCommandInput) {
		const client = this.getS3Client(meta);
		return client.send(new DeleteObjectCommand(input));
	}

	@bindThis
	public async getSignedDownloadUrl(meta: MiMeta, input: GetObjectCommandInput, expiresIn = 60) {
		const client = this.getS3Client(meta);
		return await getSignedUrl(client, new GetObjectCommand(input), { expiresIn });
	}

	@bindThis
	public setObjectAcl(meta: MiMeta, input: PutObjectAclCommandInput) {
		const client = this.getS3Client(meta);
		return client.send(new PutObjectAclCommand(input));
	}
}
