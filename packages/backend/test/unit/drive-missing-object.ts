/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect } from 'vitest';
import {
	buildMissingObjectNotice,
	classifyObjectProbeError,
	computeObjectStorageBaseUrl,
	extractReportedObjectUrl,
	objectKeyFromUrl,
	resolveObjectLocation,
	urlMayBelongToObjectStorage,
} from '@/misc/drive-missing-object.js';

const BASE = 'http://oss.example.top/bucket-a/misskey';

describe('computeObjectStorageBaseUrl', () => {
	const meta = {
		objectStorageBaseUrl: null,
		objectStorageUseSSL: true,
		objectStorageEndpoint: 's3.example.com',
		objectStoragePort: null,
		objectStorageBucket: 'files',
	};

	test('prefers the configured base url and trims trailing slashes', () => {
		expect(computeObjectStorageBaseUrl({ ...meta, objectStorageBaseUrl: ' https://cdn.example.com/media/// ' })).toBe('https://cdn.example.com/media');
	});

	test('falls back to endpoint, port and bucket exactly like uploads do', () => {
		expect(computeObjectStorageBaseUrl(meta)).toBe('https://s3.example.com/files');
		expect(computeObjectStorageBaseUrl({ ...meta, objectStorageUseSSL: false, objectStoragePort: 9000 })).toBe('http://s3.example.com:9000/files');
	});

	test('returns null when nothing can be derived', () => {
		expect(computeObjectStorageBaseUrl({ ...meta, objectStorageEndpoint: null })).toBeNull();
		expect(computeObjectStorageBaseUrl({ ...meta, objectStorageBucket: null })).toBeNull();
	});
});

describe('objectKeyFromUrl', () => {
	test('extracts the key relative to the current bucket', () => {
		expect(objectKeyFromUrl('http://oss.example.top/bucket-a/misskey/abc.webp', BASE)).toBe('abc.webp');
		expect(objectKeyFromUrl('http://oss.example.top/bucket-a/misskey/dir/abc.webp', BASE)).toBe('dir/abc.webp');
	});

	test('ignores the protocol so a later http to https migration still matches', () => {
		expect(objectKeyFromUrl('http://oss.example.top/bucket-a/misskey/abc.webp', 'https://oss.example.top/bucket-a/misskey')).toBe('abc.webp');
	});

	test('rejects other hosts, other buckets and other prefixes', () => {
		expect(objectKeyFromUrl('http://other.example.top/bucket-a/misskey/abc.webp', BASE)).toBeNull();
		expect(objectKeyFromUrl('http://oss.example.top/bucket-b/misskey/abc.webp', BASE)).toBeNull();
		expect(objectKeyFromUrl('http://oss.example.top/bucket-a/other/abc.webp', BASE)).toBeNull();
		expect(objectKeyFromUrl('http://oss.example.top/bucket-a/misskeyX/abc.webp', BASE)).toBeNull();
	});

	test('rejects different explicit ports', () => {
		expect(objectKeyFromUrl('http://oss.example.top:9000/bucket-a/misskey/abc.webp', BASE)).toBeNull();
		expect(objectKeyFromUrl('http://oss.example.top:9000/bucket-a/misskey/abc.webp', 'http://oss.example.top:9000/bucket-a/misskey')).toBe('abc.webp');
	});

	test('rejects empty keys, traversal and undecodable paths', () => {
		expect(objectKeyFromUrl('http://oss.example.top/bucket-a/misskey/', BASE)).toBeNull();
		expect(objectKeyFromUrl('http://oss.example.top/bucket-a/misskey', BASE)).toBeNull();
		expect(objectKeyFromUrl('http://oss.example.top/bucket-a/misskey/%2e%2e/secret', BASE)).toBeNull();
		expect(objectKeyFromUrl('http://oss.example.top/bucket-a/misskey/%E0%A4%A', BASE)).toBeNull();
	});

	test('rejects non-http urls and garbage', () => {
		expect(objectKeyFromUrl('ftp://oss.example.top/bucket-a/misskey/abc.webp', BASE)).toBeNull();
		expect(objectKeyFromUrl('not a url', BASE)).toBeNull();
		expect(objectKeyFromUrl('http://oss.example.top/bucket-a/misskey/abc.webp', 'not a url')).toBeNull();
	});

	test('decodes percent-encoded keys', () => {
		expect(objectKeyFromUrl('http://oss.example.top/bucket-a/misskey/a%20b.webp', BASE)).toBe('a b.webp');
	});
});

describe('resolveObjectLocation', () => {
	const meta = {
		objectStorageBaseUrl: 'https://oss.example.top/bucket-a',
		objectStorageUseSSL: true,
		objectStorageEndpoint: 'oss.example.top',
		objectStoragePort: null,
		objectStorageBucket: 'bucket-a',
		objectStorageS3ForcePathStyle: true,
	};

	test('resolves files in the current bucket', () => {
		expect(resolveObjectLocation('http://oss.example.top/bucket-a/misskey/x.webp', 'misskey/x.webp', meta))
			.toEqual({ bucket: 'bucket-a', key: 'misskey/x.webp', scope: 'current' });
	});

	test('resolves files left in a previous bucket on the same endpoint', () => {
		expect(resolveObjectLocation('http://oss.example.top/old-bucket/misskey/x.webp', 'misskey/x.webp', meta))
			.toEqual({ bucket: 'old-bucket', key: 'misskey/x.webp', scope: 'legacy' });
	});

	test('does not guess legacy buckets without path-style access', () => {
		expect(resolveObjectLocation('http://oss.example.top/old-bucket/misskey/x.webp', 'misskey/x.webp', { ...meta, objectStorageS3ForcePathStyle: false })).toBeNull();
	});

	test('refuses legacy locations on another host or port', () => {
		expect(resolveObjectLocation('http://other.example.top/old-bucket/misskey/x.webp', 'misskey/x.webp', meta)).toBeNull();
		expect(resolveObjectLocation('http://oss.example.top:9000/old-bucket/misskey/x.webp', 'misskey/x.webp', meta)).toBeNull();
	});

	test('refuses when the recorded access key disagrees with the url', () => {
		expect(resolveObjectLocation('http://oss.example.top/bucket-a/misskey/x.webp', 'misskey/y.webp', meta)).toBeNull();
		expect(resolveObjectLocation('http://oss.example.top/old-bucket/misskey/x.webp', 'misskey/y.webp', meta)).toBeNull();
	});

	test('refuses traversal, empty keys, invalid bucket names and missing endpoint', () => {
		expect(resolveObjectLocation('http://oss.example.top/old-bucket/../x.webp', '../x.webp', meta)).toBeNull();
		expect(resolveObjectLocation('http://oss.example.top/old-bucket/', '', meta)).toBeNull();
		expect(resolveObjectLocation('http://oss.example.top/-bad/misskey/x.webp', 'misskey/x.webp', meta)).toBeNull();
		expect(resolveObjectLocation('http://oss.example.top/old-bucket/misskey/x.webp', 'misskey/x.webp', { ...meta, objectStorageEndpoint: null })).toBeNull();
	});

	test('an unparseable url is never resolved', () => {
		expect(resolveObjectLocation('not a url', 'x', meta)).toBeNull();
		expect(resolveObjectLocation('ftp://oss.example.top/old-bucket/x', 'x', meta)).toBeNull();
	});
});

describe('urlMayBelongToObjectStorage', () => {
	const meta = {
		objectStorageBaseUrl: 'https://cdn.example.com/bucket-a',
		objectStorageUseSSL: true,
		objectStorageEndpoint: 'oss.example.top',
		objectStoragePort: null,
		objectStorageBucket: 'bucket-a',
		objectStorageS3ForcePathStyle: true,
	};

	test('matches the public base host and the S3 endpoint host only', () => {
		expect(urlMayBelongToObjectStorage('https://cdn.example.com/x.webp', meta)).toBe(true);
		expect(urlMayBelongToObjectStorage('http://oss.example.top/old/x.webp', meta)).toBe(true);
		expect(urlMayBelongToObjectStorage('https://evil.example.org/x.webp', meta)).toBe(false);
		expect(urlMayBelongToObjectStorage('not a url', meta)).toBe(false);
	});
});

describe('classifyObjectProbeError', () => {
	test('only an explicit not-found counts as missing', () => {
		expect(classifyObjectProbeError({ name: 'NotFound', $metadata: { httpStatusCode: 404 } })).toBe('missing');
		expect(classifyObjectProbeError({ name: 'NoSuchKey' })).toBe('missing');
		expect(classifyObjectProbeError({ $metadata: { httpStatusCode: 404 } })).toBe('missing');
	});

	test('bucket, credential and permission problems are unknown, never missing', () => {
		expect(classifyObjectProbeError({ name: 'NoSuchBucket', $metadata: { httpStatusCode: 404 } })).toBe('unknown');
		expect(classifyObjectProbeError({ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })).toBe('unknown');
		expect(classifyObjectProbeError({ Code: 'InvalidAccessKeyId', $metadata: { httpStatusCode: 403 } })).toBe('unknown');
		expect(classifyObjectProbeError({ name: 'SignatureDoesNotMatch', $metadata: { httpStatusCode: 403 } })).toBe('unknown');
	});

	test('server errors, throttling, timeouts and network failures are unknown', () => {
		expect(classifyObjectProbeError({ name: 'InternalError', $metadata: { httpStatusCode: 500 } })).toBe('unknown');
		expect(classifyObjectProbeError({ name: 'ServiceUnavailable', $metadata: { httpStatusCode: 503 } })).toBe('unknown');
		expect(classifyObjectProbeError({ name: 'SlowDown', $metadata: { httpStatusCode: 429 } })).toBe('unknown');
		expect(classifyObjectProbeError({ name: 'TimeoutError' })).toBe('unknown');
		expect(classifyObjectProbeError({ name: 'AbortError' })).toBe('unknown');
		expect(classifyObjectProbeError({ code: 'ECONNRESET' })).toBe('unknown');
		expect(classifyObjectProbeError(new Error('socket hang up'))).toBe('unknown');
	});

	test('matches the shapes the real AWS SDK produces for HEAD', () => {
		// 本地假 S3 + 真实 SDK 实测：缺失=NotFound/404，403 与 5xx 的 name 均为 Unknown
		expect(classifyObjectProbeError({ name: 'NotFound', $metadata: { httpStatusCode: 404 } })).toBe('missing');
		expect(classifyObjectProbeError({ name: 'Unknown', $metadata: { httpStatusCode: 403 } })).toBe('unknown');
		expect(classifyObjectProbeError({ name: 'Unknown', $metadata: { httpStatusCode: 500 } })).toBe('unknown');
	});

	test('a NoSuchKey-looking name with a non-404 status is not trusted', () => {
		expect(classifyObjectProbeError({ name: 'NoSuchKey', $metadata: { httpStatusCode: 500 } })).toBe('unknown');
	});

	test('non-objects are unknown', () => {
		expect(classifyObjectProbeError(null)).toBe('unknown');
		expect(classifyObjectProbeError(undefined)).toBe('unknown');
		expect(classifyObjectProbeError('boom')).toBe('unknown');
	});
});

describe('extractReportedObjectUrl', () => {
	const SITE = 'https://site.example.com';

	test('accepts direct object storage urls', () => {
		expect(extractReportedObjectUrl('http://oss.example.top/bucket-a/misskey/abc.webp', SITE)).toBe('http://oss.example.top/bucket-a/misskey/abc.webp');
	});

	test('unwraps proxy urls', () => {
		const proxied = `${SITE}/proxy/image.webp?url=${encodeURIComponent('http://oss.example.top/bucket-a/misskey/abc.webp')}&static=1`;
		expect(extractReportedObjectUrl(proxied, SITE)).toBe('http://oss.example.top/bucket-a/misskey/abc.webp');
	});

	test('rejects the site itself, other schemes, empty and oversized input', () => {
		expect(extractReportedObjectUrl(`${SITE}/files/abc`, SITE)).toBeNull();
		expect(extractReportedObjectUrl('/files/abc', SITE)).toBeNull();
		expect(extractReportedObjectUrl('javascript:alert(1)', SITE)).toBeNull();
		expect(extractReportedObjectUrl('data:image/png;base64,AAAA', SITE)).toBeNull();
		expect(extractReportedObjectUrl('', SITE)).toBeNull();
		expect(extractReportedObjectUrl(`http://oss.example.top/${'a'.repeat(3000)}`, SITE)).toBeNull();
	});

	test('rejects a proxy url that wraps a non-http target or has no target', () => {
		expect(extractReportedObjectUrl(`${SITE}/proxy/x.webp?url=${encodeURIComponent('file:///etc/passwd')}`, SITE)).toBeNull();
		expect(extractReportedObjectUrl(`${SITE}/proxy/x.webp`, SITE)).toBeNull();
	});
});

describe('buildMissingObjectNotice', () => {
	test('uses the agreed wording and does not leak technical details', () => {
		const image = buildMissingObjectNotice('image/png');
		expect(image.text).toBe('因相关审查原因，您网盘中的部分图片已被删除。');
		expect(buildMissingObjectNotice('video/mp4').text).toBe('因相关审查原因，您网盘中的部分文件已被删除。');
		expect(`${image.title}${image.text}`).not.toMatch(/OSS|对象存储|404|丢失/);
	});
});
