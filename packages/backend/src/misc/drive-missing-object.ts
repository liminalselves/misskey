/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 对象存储丢失对象的判定用纯函数。
 * 原则：任何无法确认的情况都返回 null / 'unknown'，调用方据此保持数据不动。
 */

import type { MiMeta } from '@/models/Meta.js';

export type ObjectProbe = 'present' | 'missing' | 'unknown';

/** 与 DriveService 上传时生成文件 URL 的前缀保持一致。 */
export function computeObjectStorageBaseUrl(meta: Pick<MiMeta, 'objectStorageBaseUrl' | 'objectStorageUseSSL' | 'objectStorageEndpoint' | 'objectStoragePort' | 'objectStorageBucket'>): string | null {
	const configured = meta.objectStorageBaseUrl?.trim();
	if (configured) return configured.replace(/\/+$/, '');
	if (!meta.objectStorageEndpoint || !meta.objectStorageBucket) return null;
	const scheme = meta.objectStorageUseSSL ? 'https' : 'http';
	const port = meta.objectStoragePort ? `:${meta.objectStoragePort}` : '';
	return `${scheme}://${meta.objectStorageEndpoint}${port}/${meta.objectStorageBucket}`;
}

function safeDecode(value: string): string | null {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

export type ObjectStorageMeta = Pick<MiMeta, 'objectStorageBaseUrl' | 'objectStorageUseSSL' | 'objectStorageEndpoint' | 'objectStoragePort' | 'objectStorageBucket' | 'objectStorageS3ForcePathStyle'>;

/**
 * 文件在对象存储里的位置。
 * current：属于当前配置的桶；legacy：URL 仍指向同一端点下的另一个桶/路径（桶改名或迁移后的遗留记录）。
 */
export type ObjectLocation = { bucket: string; key: string; scope: 'current' | 'legacy' };

const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,62}$/i;

function parseLegacyPathStyleLocation(url: string, meta: ObjectStorageMeta): { bucket: string; key: string } | null {
	if (!meta.objectStorageS3ForcePathStyle || !meta.objectStorageEndpoint) return null;

	let target: URL;
	let endpoint: URL;
	try {
		target = new URL(url);
		endpoint = new URL(`${meta.objectStorageUseSSL ? 'https' : 'http'}://${meta.objectStorageEndpoint}${meta.objectStoragePort ? `:${meta.objectStoragePort}` : ''}`);
	} catch {
		return null;
	}
	if (target.protocol !== 'http:' && target.protocol !== 'https:') return null;
	if (target.hostname.toLowerCase() !== endpoint.hostname.toLowerCase()) return null;
	if (target.port !== endpoint.port) return null;

	const path = safeDecode(target.pathname);
	if (path == null || !path.startsWith('/')) return null;
	const slash = path.indexOf('/', 1);
	if (slash < 0) return null;
	const bucket = path.slice(1, slash);
	const key = path.slice(slash + 1);
	if (!BUCKET_NAME_PATTERN.test(bucket)) return null;
	if (key === '' || key.split('/').some(seg => seg === '..' || seg === '.')) return null;
	// 与当前桶同名却没能按 current 解析，说明记录与配置不一致，不能当作 legacy 处理
	if (bucket === meta.objectStorageBucket) return null;
	return { bucket, key };
}

/**
 * 判定文件记录指向的对象位置；无法可靠判定时返回 null（调用方必须保持数据不动）。
 *
 * legacy 只在这些条件同时成立时才认：
 * - 使用路径风格访问（URL 路径里的第一段就是 SDK 请求里的 Bucket，二者才一一对应）；
 * - URL 的主机与端口和当前配置的端点一致，即用同一套端点与凭证就能访问到该地址；
 * - URL 路径 = /<桶>/<accessKey>，与记录的 accessKey 完全一致。
 */
export function resolveObjectLocation(url: string, accessKey: string, meta: ObjectStorageMeta): ObjectLocation | null {
	const baseUrl = computeObjectStorageBaseUrl(meta);
	if (baseUrl != null && meta.objectStorageBucket) {
		const key = objectKeyFromUrl(url, baseUrl);
		if (key != null) {
			return key === accessKey ? { bucket: meta.objectStorageBucket, key, scope: 'current' } : null;
		}
	}

	const legacy = parseLegacyPathStyleLocation(url, meta);
	if (legacy == null || legacy.key !== accessKey) return null;
	return { bucket: legacy.bucket, key: legacy.key, scope: 'legacy' };
}

/**
 * 从上报 URL 中提取候选对象 key（对应 drive_file 的 accessKey / thumbnailAccessKey / webpublicAccessKey），
 * 供服务端走已建唯一索引的列查库，避免对无索引的 url 列做全表扫描。
 */
export function extractCandidateObjectKey(url: string, meta: ObjectStorageMeta): string | null {
	const baseUrl = computeObjectStorageBaseUrl(meta);
	if (baseUrl != null && meta.objectStorageBucket) {
		const key = objectKeyFromUrl(url, baseUrl);
		if (key != null) return key;
	}
	return parseLegacyPathStyleLocation(url, meta)?.key ?? null;
}

/** 粗筛：这个 URL 的主机是否可能属于对象存储（避免为任意外链去查库）。 */
export function urlMayBelongToObjectStorage(url: string, meta: ObjectStorageMeta): boolean {
	let target: URL;
	try {
		target = new URL(url);
	} catch {
		return false;
	}
	const hosts = new Set<string>();
	const baseUrl = computeObjectStorageBaseUrl(meta);
	if (baseUrl != null) {
		try {
			hosts.add(new URL(baseUrl).hostname.toLowerCase());
		} catch { /* ignore */ }
	}
	if (meta.objectStorageEndpoint) {
		try {
			hosts.add(new URL(`https://${meta.objectStorageEndpoint}`).hostname.toLowerCase());
		} catch { /* ignore */ }
	}
	return hosts.has(target.hostname.toLowerCase());
}

/**
 * 从对象 URL 中取出相对于当前桶 baseUrl 的对象 key。
 * 只比较主机与路径、忽略协议（历史文件可能以 http 入库而当前配置为 https）；
 * 主机或路径前缀不一致说明文件属于别的桶/旧配置，返回 null。
 */
export function objectKeyFromUrl(url: string, baseUrl: string): string | null {
	let target: URL;
	let base: URL;
	try {
		target = new URL(url);
		base = new URL(baseUrl);
	} catch {
		return null;
	}
	if (target.protocol !== 'http:' && target.protocol !== 'https:') return null;
	if (target.hostname.toLowerCase() !== base.hostname.toLowerCase()) return null;
	// URL.port 在协议默认端口时为空串；显式端口必须完全一致，协议不参与比较
	if (target.port !== base.port) return null;

	const basePath = base.pathname.replace(/\/+$/, '');
	const targetPath = safeDecode(target.pathname);
	if (targetPath == null) return null;
	if (!targetPath.startsWith(`${basePath}/`)) return null;

	const key = targetPath.slice(basePath.length + 1);
	if (key === '' || key.startsWith('/') || key.split('/').some(seg => seg === '..' || seg === '.')) return null;
	return key;
}

/**
 * 判断 HEAD 失败属于「对象确实不存在」还是「不确定」。
 * 只有明确的 404 / NoSuchKey / NotFound 才算不存在；
 * NoSuchBucket、鉴权失败、5xx、超时、网络错误一律不确定。
 */
export function classifyObjectProbeError(err: unknown): Exclude<ObjectProbe, 'present'> {
	const e = err as { name?: unknown; Code?: unknown; code?: unknown; $metadata?: { httpStatusCode?: unknown } } | null;
	if (e == null || typeof e !== 'object') return 'unknown';

	const names = [e.name, e.Code, e.code].filter((v): v is string => typeof v === 'string');
	if (names.some(n => n === 'NoSuchBucket' || n === 'AccessDenied' || n === 'InvalidAccessKeyId' || n === 'SignatureDoesNotMatch')) {
		return 'unknown';
	}

	const status = e.$metadata?.httpStatusCode;
	if (status === 404) return 'missing';
	if (names.some(n => n === 'NoSuchKey' || n === 'NotFound')) return status == null || status === 404 ? 'missing' : 'unknown';
	return 'unknown';
}

/**
 * 解析前端/代理上报的 URL，得到可能的对象存储 URL。
 * 支持直链和 /proxy/...?url=<直链> 两种形态；其余一律返回 null。
 */
export function extractReportedObjectUrl(raw: string, siteUrl: string): string | null {
	if (raw.length === 0 || raw.length > 2048) return null;

	let u: URL;
	try {
		u = new URL(raw, siteUrl);
	} catch {
		return null;
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

	let site: URL;
	try {
		site = new URL(siteUrl);
	} catch {
		return null;
	}

	if (u.host === site.host && u.pathname.startsWith('/proxy/')) {
		const inner = u.searchParams.get('url');
		if (inner == null) return null;
		try {
			const innerUrl = new URL(inner);
			if (innerUrl.protocol !== 'http:' && innerUrl.protocol !== 'https:') return null;
			return innerUrl.toString();
		} catch {
			return null;
		}
	}

	// 站点自身的非代理路径（如 /files/...）不是对象存储直链
	if (u.host === site.host) return null;
	return u.toString();
}

/** 通知文案：只说明结果与原因，不暴露技术细节。allImages 为 true 时说「图片」，混有其他类型时说「文件」。 */
export function buildMissingObjectNotice(allImages: boolean): { title: string; text: string } {
	const noun = allImages ? '图片' : '文件';
	return {
		title: '网盘内容已被清理',
		text: `因相关审查原因，您网盘中的部分${noun}已被删除。`,
	};
}
