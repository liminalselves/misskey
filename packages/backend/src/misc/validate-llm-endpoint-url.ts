/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import dns from 'node:dns/promises';
import net from 'node:net';

export type UnsafeLlmUrlReason =
	| 'empty'
	| 'invalid_url'
	| 'not_https'
	| 'missing_host'
	| 'blocked_host'
	| 'userinfo_not_allowed'
	| 'dns_failed'
	| 'dns_empty'
	| 'resolved_private';

export class UnsafeLlmUrlError extends Error {
	public override readonly name = 'UnsafeLlmUrlError';
	constructor(public readonly reason: UnsafeLlmUrlReason) {
		super(reason);
	}
}

/** 管理画面・ログ用の説明文（英語） */
export function describeUnsafeLlmUrlReason(reason: UnsafeLlmUrlReason): string {
	switch (reason) {
		case 'empty':
			return 'URL is empty.';
		case 'invalid_url':
			return 'Could not parse as URL. Use a hostname and path such as https://api.example.com/v1 or api.example.com/v1';
		case 'not_https':
			return 'Only https:// URLs are allowed (not http).';
		case 'missing_host':
			return 'URL has no hostname.';
		case 'blocked_host':
			return 'This hostname is not allowed.';
		case 'userinfo_not_allowed':
			return 'URL must not contain username or password (use API key in settings instead).';
		case 'dns_failed':
			return 'DNS lookup for the hostname failed. Check spelling and network.';
		case 'dns_empty':
			return 'DNS returned no addresses for this hostname.';
		case 'resolved_private':
			return 'Hostname resolves to a private or local IP address. Use a public endpoint or a tunnel (e.g. cloud URL), not localhost/LAN.';
		default:
			return 'URL failed security validation.';
	}
}

function isPrivateOrReservedIpv4(parts: number[]): boolean {
	const [a, b] = parts;
	if (a === 10) return true;
	if (a === 127) return true;
	if (a === 0) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 169 && b === 254) return true;
	if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
	return false;
}

function isUnsafeIp(ip: string): boolean {
	if (net.isIPv4(ip)) {
		const parts = ip.split('.').map(x => parseInt(x, 10));
		if (parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true;
		return isPrivateOrReservedIpv4(parts);
	}
	if (net.isIPv6(ip)) {
		const lower = ip.toLowerCase();
		if (lower === '::1') return true;
		if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
		if (lower.startsWith('fe80:')) return true; // link-local
		if (lower.startsWith('::ffff:')) {
			const v4 = lower.slice(7);
			if (net.isIPv4(v4)) {
				const parts = v4.split('.').map(x => parseInt(x, 10));
				return isPrivateOrReservedIpv4(parts);
			}
		}
		return false;
	}
	return true;
}

const BLOCKED_HOSTNAMES = new Set([
	'localhost',
	'metadata.google.internal',
	'metadata',
]);

/**
 * 用户常省略协议；无 scheme 时补 https://，以便 `api.openai.com/v1` 等能通过 `new URL()`。
 */
export function normalizeLlmHttpsBaseUrlInput(raw: string): string {
	const s = raw.trim();
	if (!s) return '';
	if (s.startsWith('//')) {
		return `https:${s}`;
	}
	// 已有 scheme（https:, http:, 等）
	if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(s)) {
		return s;
	}
	return `https://${s}`;
}

/** 写入 meta 用：去掉末尾多余 `/`（根路径除外保留 origin） */
export function hrefForStoredLlmBaseUrl(u: URL): string {
	let h = u.href;
	// https://host/ → https://host ；https://host/v1/ 保留路径末尾斜杠由 pathname 决定
	if (u.pathname === '/' && u.search === '' && h.endsWith('/')) {
		h = h.replace(/\/$/, '');
	}
	return h;
}

/**
 * 把配置的 LLM Base URL 变成完整的 chat/completions 端点：
 * - 已以 completions 结尾（含 completion 单数等拼写变体）→ 视为完整端点，原样使用；
 * - 否则在末尾直接追加 `/chat/completions`。不猜测 `/v1` 等版本段——
 *   上游可能是 /v4 或任意前缀，版本段由配置方自己写全。
 */
export function normalizeChatCompletionsUrl(baseRaw: string): string {
	const base = baseRaw.trim().replace(/\/+$/, '');
	if (/completions?$/i.test(base)) return base;
	return `${base}/chat/completions`;
}

/**
 * 校验 OpenAI 兼容 API Base URL，降低 SSRF 风险（强制 https，禁止常见内网与元数据地址）。
 * @throws UnsafeLlmUrlError 校验失败时
 */
export async function assertSafeLlmHttpsUrl(raw: string): Promise<URL> {
	const prepared = normalizeLlmHttpsBaseUrlInput(raw);
	if (!prepared) {
		throw new UnsafeLlmUrlError('empty');
	}
	let u: URL;
	try {
		u = new URL(prepared);
	} catch {
		throw new UnsafeLlmUrlError('invalid_url');
	}
	if (u.protocol !== 'https:') {
		throw new UnsafeLlmUrlError('not_https');
	}
	if (!u.hostname) {
		throw new UnsafeLlmUrlError('missing_host');
	}
	const hostLower = u.hostname.toLowerCase();
	if (BLOCKED_HOSTNAMES.has(hostLower)) {
		throw new UnsafeLlmUrlError('blocked_host');
	}
	// 禁止 userinfo 嵌入凭据
	if (u.username || u.password) {
		throw new UnsafeLlmUrlError('userinfo_not_allowed');
	}

	let lookups: { address: string }[];
	try {
		lookups = await dns.lookup(u.hostname, { all: true });
	} catch {
		throw new UnsafeLlmUrlError('dns_failed');
	}
	if (lookups.length === 0) {
		throw new UnsafeLlmUrlError('dns_empty');
	}
	for (const { address } of lookups) {
		if (isUnsafeIp(address)) {
			throw new UnsafeLlmUrlError('resolved_private');
		}
	}
	return u;
}
