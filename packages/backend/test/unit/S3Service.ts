/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as http from 'node:http';
import {
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	GetObjectCommand,
	PutObjectCommand,
	PutObjectAclCommand,
	S3Client,
	UploadPartCommand,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Service } from '@/core/S3Service.js';
import { MiMeta } from '@/models/_.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';

describe('S3Service', () => {
	let s3Service: S3Service;
	const s3Mock = mockClient(S3Client);

	beforeAll(() => {
		s3Service = new S3Service({
			getAgentByUrl: () => new http.Agent(),
		} as unknown as HttpRequestService);
	});

	beforeEach(async () => {
		s3Mock.reset();
	});

	describe('upload', () => {
		test('upload a file', async () => {
			s3Mock.on(PutObjectCommand).resolves({});

			await s3Service.upload({ objectStorageRegion: 'us-east-1' } as MiMeta, {
				Bucket: 'fake',
				Key: 'fake',
				Body: 'x',
			});
		});

		test('upload a large file', async () => {
			s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: '1' });
			s3Mock.on(UploadPartCommand).resolves({ ETag: '1' });
			s3Mock.on(CompleteMultipartUploadCommand).resolves({ Bucket: 'fake', Key: 'fake' });

			await s3Service.upload({} as MiMeta, {
				Bucket: 'fake',
				Key: 'fake',
				Body: 'x'.repeat(8 * 1024 * 1024 + 1), // デフォルトpartSizeにしている 8 * 1024 * 1024 を越えるサイズ
			});
		});

		test('upload a file error', async () => {
			s3Mock.on(PutObjectCommand).rejects({ name: 'Fake Error' });

			await expect(s3Service.upload({ objectStorageRegion: 'us-east-1' } as MiMeta, {
				Bucket: 'fake',
				Key: 'fake',
				Body: 'x',
			})).rejects.toThrow(Error);
		});

		test('upload a large file error', async () => {
			s3Mock.on(UploadPartCommand).rejects();

			await expect(s3Service.upload({} as MiMeta, {
				Bucket: 'fake',
				Key: 'fake',
				Body: 'x'.repeat(8 * 1024 * 1024 + 1), // デフォルトpartSizeにしている 8 * 1024 * 1024 を越えるサイズ
			})).rejects.toThrow(Error);
		});
	});

	describe('setObjectAcl', () => {
		test('updates an object ACL', async () => {
			s3Mock.on(PutObjectAclCommand).resolves({});

			await s3Service.setObjectAcl({ objectStorageRegion: 'us-east-1' } as MiMeta, {
				Bucket: 'fake',
				Key: 'fake',
				ACL: 'private',
			});

			expect(s3Mock.commandCalls(PutObjectAclCommand)[0]?.args[0].input).toEqual({
				Bucket: 'fake',
				Key: 'fake',
				ACL: 'private',
			});
		});
	});

	describe('getSignedDownloadUrl', () => {
		test('trims object storage credentials before signing', async () => {
			const url = await s3Service.getSignedDownloadUrl({
				objectStorageEndpoint: ' example.com ',
				objectStorageAccessKey: ' test-access-key ',
				objectStorageSecretKey: ' fake-secret ',
				objectStorageRegion: ' cn-guangzhou ',
				objectStorageUseSSL: false,
				objectStorageUseProxy: false,
				objectStorageS3ForcePathStyle: true,
			} as MiMeta, {
				Bucket: 'fake',
				Key: 'fake.png',
			});

			const signedUrl = new URL(url);

			expect(signedUrl.host).toBe('example.com');
			expect(signedUrl.searchParams.get('X-Amz-Credential')).toContain('test-access-key/');
			expect(signedUrl.searchParams.get('X-Amz-Credential')).not.toContain(' test-access-key');
			expect(url).not.toContain('%20test-access-key');
			expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
		});
	});
});
