/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import ipaddr from 'ipaddr.js';

const execFileAsync = promisify(execFile);

const WINDOWS_INTERNET_SETTINGS_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
const WINDOWS_REG_QUERY_TIMEOUT_MS = 1500;
const DYNAMIC_PROXY_SENTINELS = new Set(['system', 'auto', 'env']);

export type WindowsSystemProxyState = {
	enabled: boolean;
	proxyServer: string | null;
	proxyOverride: string[];
};

export type EnvProxyConfig = {
	httpProxy: string | null;
	httpsProxy: string | null;
	allProxy: string | null;
	bypassPatterns: string[];
	hasAnyProxyVar: boolean;
};

/**
 * Normalize explicit `config.proxy` from `.config/default.yml`.
 * Empty strings or sentinel values (`system`, `auto`, `env`) fall back to
 * environment variables / dev system proxy resolution.
 */
export function normalizeExplicitConfigProxy(raw: string | null | undefined): string | undefined {
	if (typeof raw !== 'string') return undefined;
	const trimmed = raw.trim();
	if (!trimmed) return undefined;
	if (DYNAMIC_PROXY_SENTINELS.has(trimmed.toLowerCase())) return undefined;
	return normalizeProxyUrl(trimmed) ?? undefined;
}

export function normalizeProxyUrl(raw: string | null | undefined): string | null {
	if (typeof raw !== 'string') return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;

	const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
		? trimmed
		: `http://${trimmed}`;

	try {
		const parsed = new URL(withScheme);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return null;
		}
		return parsed.toString();
	} catch {
		return null;
	}
}

export function parseProxyBypassList(
	...sources: Array<string | readonly string[] | null | undefined>
): string[] {
	const result: string[] = [];
	const seen = new Set<string>();

	for (const source of sources) {
		if (!source) continue;
		const tokens = Array.isArray(source)
			? source
			: String(source).split(/[,\s;]+/);
		for (const token of tokens) {
			const trimmed = String(token ?? '').trim();
			if (!trimmed) continue;
			const lower = trimmed.toLowerCase();
			if (seen.has(lower)) continue;
			seen.add(lower);
			result.push(trimmed);
		}
	}

	return result;
}

function stripBrackets(host: string): string {
	return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function splitPatternHostPort(pattern: string): { hostPattern: string; port: string | null } {
	const trimmed = pattern.trim();
	if (trimmed.startsWith('[')) {
		const closeIdx = trimmed.indexOf(']');
		if (closeIdx > 0) {
			const host = trimmed.slice(1, closeIdx);
			const rest = trimmed.slice(closeIdx + 1);
			const port = rest.startsWith(':') ? rest.slice(1) : null;
			return { hostPattern: host, port: port && /^\d+$/.test(port) ? port : null };
		}
	}

	const firstColon = trimmed.indexOf(':');
	const lastColon = trimmed.lastIndexOf(':');
	if (firstColon > 0 && firstColon === lastColon) {
		const maybePort = trimmed.slice(lastColon + 1);
		if (/^\d+$/.test(maybePort)) {
			return { hostPattern: trimmed.slice(0, lastColon), port: maybePort };
		}
	}

	return { hostPattern: trimmed, port: null };
}

function wildcardMatches(pattern: string, target: string): boolean {
	const escaped = pattern
		.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '.*');
	return new RegExp(`^${escaped}$`, 'i').test(target);
}

function effectivePort(url: URL): string {
	if (url.port) return url.port;
	return url.protocol === 'https:' ? '443' : '80';
}

export function shouldBypassProxy(url: URL, bypassPatterns: readonly string[]): boolean {
	if (bypassPatterns.length === 0) return false;

	const hostname = stripBrackets(url.hostname).toLowerCase();
	const port = effectivePort(url);
	const isIp = ipaddr.isValid(hostname);
	const parsedIp = isIp ? ipaddr.parse(hostname) : null;

	for (const rawPattern of bypassPatterns) {
		const pattern = rawPattern.trim();
		if (!pattern) continue;

		if (pattern === '*') return true;

		if (pattern.toLowerCase() === '<local>') {
			if (!hostname.includes('.') || hostname === '127.0.0.1' || hostname === '::1') {
				return true;
			}
			continue;
		}

		if (parsedIp && pattern.includes('/')) {
			try {
				const cidr = ipaddr.parseCIDR(pattern);
				if (cidr[0].kind() === parsedIp.kind() && parsedIp.match(cidr)) {
					return true;
				}
			} catch {
				// Ignore invalid CIDR patterns
			}
			continue;
		}

		const { hostPattern: rawHostPattern, port: patternPort } = splitPatternHostPort(pattern);
		if (patternPort && patternPort !== port) continue;

		const hostPattern = stripBrackets(rawHostPattern).toLowerCase();
		if (!hostPattern) continue;

		if (hostPattern.includes('*')) {
			if (wildcardMatches(hostPattern, hostname)) {
				return true;
			}
			continue;
		}

		if (hostPattern.startsWith('.')) {
			const suffix = hostPattern.slice(1);
			if (hostname === suffix || hostname.endsWith(hostPattern)) {
				return true;
			}
			continue;
		}

		if (hostname === hostPattern || (!isIp && hostname.endsWith(`.${hostPattern}`))) {
			return true;
		}
	}

	return false;
}

export function parseWindowsProxyServer(rawProxyServer: string, protocol: 'http:' | 'https:'): string | null {
	const trimmed = rawProxyServer.trim();
	if (!trimmed) return null;

	// WinINET uses either `host:port` or `http=host:port;https=host:port;socks=...`
	if (!trimmed.includes('=')) {
		return normalizeProxyUrl(trimmed);
	}

	const entries = new Map<string, string>();
	for (const part of trimmed.split(';')) {
		const eqIdx = part.indexOf('=');
		if (eqIdx <= 0) continue;
		const scheme = part.slice(0, eqIdx).trim().toLowerCase();
		const target = part.slice(eqIdx + 1).trim();
		if (scheme && target) {
			entries.set(scheme, target);
		}
	}

	const preferred = protocol === 'https:'
		? (entries.get('https') ?? entries.get('http'))
		: (entries.get('http') ?? entries.get('https'));

	return preferred ? normalizeProxyUrl(preferred) : null;
}

export function parseWindowsRegQueryOutput(stdout: string): WindowsSystemProxyState {
	let enabled = false;
	let proxyServer: string | null = null;
	let proxyOverrideRaw: string | null = null;

	for (const rawLine of stdout.split(/\r?\n/)) {
		const match = /^\s*([A-Za-z0-9_]+)\s+REG_[A-Z0-9_]+\s+(.*)$/.exec(rawLine);
		if (!match) continue;
		const [, name, value] = match;
		if (name === 'ProxyEnable') {
			const v = value.trim().toLowerCase();
			enabled = v === '0x1' || v === '1';
		} else if (name === 'ProxyServer') {
			const trimmed = value.trim();
			proxyServer = trimmed.length > 0 ? trimmed : null;
		} else if (name === 'ProxyOverride') {
			const trimmed = value.trim();
			proxyOverrideRaw = trimmed.length > 0 ? trimmed : null;
		}
	}

	return {
		enabled,
		proxyServer,
		proxyOverride: parseProxyBypassList(proxyOverrideRaw),
	};
}

export function isDevWindowsSystemProxyEligible(env: NodeJS.ProcessEnv = process.env): boolean {
	return process.platform === 'win32'
		&& env.NODE_ENV !== 'production'
		&& env.NODE_ENV !== 'test';
}

export function readWindowsSystemProxySync(): WindowsSystemProxyState {
	if (!isDevWindowsSystemProxyEligible()) {
		return { enabled: false, proxyServer: null, proxyOverride: [] };
	}

	try {
		const stdout = execFileSync(
			'reg',
			['query', WINDOWS_INTERNET_SETTINGS_KEY],
			{ encoding: 'utf8', timeout: WINDOWS_REG_QUERY_TIMEOUT_MS, windowsHide: true },
		);
		return parseWindowsRegQueryOutput(stdout);
	} catch {
		return { enabled: false, proxyServer: null, proxyOverride: [] };
	}
}

export async function readWindowsSystemProxyAsync(): Promise<WindowsSystemProxyState> {
	if (!isDevWindowsSystemProxyEligible()) {
		return { enabled: false, proxyServer: null, proxyOverride: [] };
	}

	try {
		const { stdout } = await execFileAsync(
			'reg',
			['query', WINDOWS_INTERNET_SETTINGS_KEY],
			{ encoding: 'utf8', timeout: WINDOWS_REG_QUERY_TIMEOUT_MS, windowsHide: true },
		);
		return parseWindowsRegQueryOutput(stdout);
	} catch {
		return { enabled: false, proxyServer: null, proxyOverride: [] };
	}
}

function readEnvString(env: NodeJS.ProcessEnv, upper: string, lower: string): string | undefined {
	if (Object.hasOwn(env, upper)) return env[upper];
	if (Object.hasOwn(env, lower)) return env[lower];
	return undefined;
}

export function resolveProxyConfigFromEnv(env: NodeJS.ProcessEnv = process.env): EnvProxyConfig {
	const rawHttps = readEnvString(env, 'HTTPS_PROXY', 'https_proxy');
	const rawHttp = readEnvString(env, 'HTTP_PROXY', 'http_proxy');
	const rawAll = readEnvString(env, 'ALL_PROXY', 'all_proxy');
	const rawNoProxy = readEnvString(env, 'NO_PROXY', 'no_proxy');

	const hasAnyProxyVar = rawHttps !== undefined || rawHttp !== undefined || rawAll !== undefined;

	return {
		httpProxy: normalizeProxyUrl(rawHttp),
		httpsProxy: normalizeProxyUrl(rawHttps),
		allProxy: normalizeProxyUrl(rawAll),
		bypassPatterns: parseProxyBypassList(rawNoProxy),
		hasAnyProxyVar,
	};
}

export function resolveOutboundProxyForUrl(
	url: URL,
	options: {
		configProxy?: string | null;
		configBypassHosts?: readonly string[] | null;
		env?: NodeJS.ProcessEnv;
		windowsSystemProxy?: WindowsSystemProxyState | null;
	} = {},
): string | null {
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		return null;
	}

	const protocol = url.protocol;
	const configBypass = parseProxyBypassList(options.configBypassHosts);
	const explicitProxy = normalizeExplicitConfigProxy(options.configProxy);

	if (explicitProxy) {
		if (shouldBypassProxy(url, configBypass)) return null;
		return explicitProxy;
	}

	const env = options.env ?? process.env;
	const envProxy = resolveProxyConfigFromEnv(env);
	if (envProxy.hasAnyProxyVar) {
		const selected = protocol === 'https:'
			? (envProxy.httpsProxy ?? envProxy.allProxy)
			: (envProxy.httpProxy ?? envProxy.allProxy);
		if (!selected) return null;
		const bypass = parseProxyBypassList(configBypass, envProxy.bypassPatterns);
		if (shouldBypassProxy(url, bypass)) return null;
		return selected;
	}

	const winProxy = options.windowsSystemProxy;
	if (winProxy?.enabled && winProxy.proxyServer) {
		const selected = parseWindowsProxyServer(winProxy.proxyServer, protocol);
		if (!selected) return null;
		const bypass = parseProxyBypassList(configBypass, envProxy.bypassPatterns, winProxy.proxyOverride);
		if (shouldBypassProxy(url, bypass)) return null;
		return selected;
	}

	return null;
}
