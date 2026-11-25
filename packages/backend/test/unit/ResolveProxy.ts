/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test } from 'vitest';
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';
import type { Config } from '@/config.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import {
	normalizeExplicitConfigProxy,
	normalizeProxyUrl,
	parseProxyBypassList,
	parseWindowsProxyServer,
	parseWindowsRegQueryOutput,
	resolveOutboundProxyForUrl,
	shouldBypassProxy,
} from '@/misc/resolve-proxy.js';

const PROXY_ENV_KEYS = [
	'HTTP_PROXY',
	'http_proxy',
	'HTTPS_PROXY',
	'https_proxy',
	'ALL_PROXY',
	'all_proxy',
	'NO_PROXY',
	'no_proxy',
] as const;

const savedEnv = new Map<string, string | undefined>();
for (const key of PROXY_ENV_KEYS) {
	savedEnv.set(key, process.env[key]);
}

function clearProxyEnv() {
	for (const key of PROXY_ENV_KEYS) {
		delete process.env[key];
	}
}

afterEach(() => {
	for (const key of PROXY_ENV_KEYS) {
		const original = savedEnv.get(key);
		if (original === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = original;
		}
	}
});

describe('resolve-proxy helpers', () => {
	test('normalizeExplicitConfigProxy handles empty and dynamic sentinel values', () => {
		expect(normalizeExplicitConfigProxy(undefined)).toBeUndefined();
		expect(normalizeExplicitConfigProxy('')).toBeUndefined();
		expect(normalizeExplicitConfigProxy('   ')).toBeUndefined();
		expect(normalizeExplicitConfigProxy('system')).toBeUndefined();
		expect(normalizeExplicitConfigProxy('AUTO')).toBeUndefined();
		expect(normalizeExplicitConfigProxy('Env')).toBeUndefined();
		expect(normalizeExplicitConfigProxy('127.0.0.1:7897')).toBe('http://127.0.0.1:7897/');
		expect(normalizeExplicitConfigProxy('http://127.0.0.1:3128')).toBe('http://127.0.0.1:3128/');
	});

	test('normalizeProxyUrl rejects non-http(s) protocols', () => {
		expect(normalizeProxyUrl('socks5://127.0.0.1:1080')).toBeNull();
		expect(normalizeProxyUrl('https://proxy.example.com:8443')).toBe('https://proxy.example.com:8443/');
	});

	test('parseProxyBypassList & shouldBypassProxy support wildcards, domains, CIDRs, ports, and <local>', () => {
		const bypass = parseProxyBypassList(
			'localhost, .internal.example, 127.*, 10.0.0.0/8, api.example.com:8443, <local>',
			['oss.liminalselves.top'],
		);

		expect(shouldBypassProxy(new URL('https://localhost/api'), bypass)).toBe(true);
		expect(shouldBypassProxy(new URL('https://sub.internal.example/v1'), bypass)).toBe(true);
		expect(shouldBypassProxy(new URL('https://internal.example/v1'), bypass)).toBe(true);
		expect(shouldBypassProxy(new URL('http://127.0.0.1:3000/'), bypass)).toBe(true);
		expect(shouldBypassProxy(new URL('http://10.20.30.40/'), bypass)).toBe(true);
		expect(shouldBypassProxy(new URL('https://api.example.com:8443/'), bypass)).toBe(true);
		expect(shouldBypassProxy(new URL('https://api.example.com:443/'), bypass)).toBe(false);
		expect(shouldBypassProxy(new URL('http://intranet/status'), bypass)).toBe(true);
		expect(shouldBypassProxy(new URL('https://oss.liminalselves.top/file.png'), bypass)).toBe(true);
		expect(shouldBypassProxy(new URL('https://api.github.com/repos'), bypass)).toBe(false);
		expect(shouldBypassProxy(new URL('https://example.com/'), ['*'])).toBe(true);
	});

	test('parseWindowsProxyServer & parseWindowsRegQueryOutput parse WinINET formats', () => {
		const disabled = parseWindowsRegQueryOutput(`
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x0
    ProxyServer    REG_SZ    127.0.0.1:7897
    ProxyOverride    REG_SZ    localhost;127.*;<local>
`);
		expect(disabled.enabled).toBe(false);
		expect(disabled.proxyServer).toBe('127.0.0.1:7897');
		expect(disabled.proxyOverride).toEqual(['localhost', '127.*', '<local>']);

		const enabled = parseWindowsRegQueryOutput(`
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x1
    ProxyServer    REG_SZ    http=127.0.0.1:7897;https=127.0.0.1:7898;socks=127.0.0.1:7899
    ProxyOverride    REG_SZ    *.local;<local>
`);
		expect(enabled.enabled).toBe(true);
		expect(parseWindowsProxyServer(enabled.proxyServer!, 'http:')).toBe('http://127.0.0.1:7897/');
		expect(parseWindowsProxyServer(enabled.proxyServer!, 'https:')).toBe('http://127.0.0.1:7898/');
		expect(parseWindowsProxyServer('127.0.0.1:7897', 'https:')).toBe('http://127.0.0.1:7897/');
		expect(parseWindowsProxyServer('socks=127.0.0.1:7899', 'https:')).toBeNull();
	});

	test('resolveOutboundProxyForUrl follows precedence: explicit config > env vars > windows system proxy', () => {
		const target = new URL('https://api.github.com/repos');
		const winEnabled = { enabled: true, proxyServer: '127.0.0.1:7897', proxyOverride: ['localhost', '<local>'] };

		// 1. Explicit config.proxy wins
		expect(resolveOutboundProxyForUrl(target, {
			configProxy: 'http://127.0.0.1:3128',
			env: { HTTPS_PROXY: 'http://127.0.0.1:8888' },
			windowsSystemProxy: winEnabled,
		})).toBe('http://127.0.0.1:3128/');

		// 2. Env vars win over Windows system proxy when configProxy is unset or 'system'
		expect(resolveOutboundProxyForUrl(target, {
			configProxy: 'system',
			env: { HTTPS_PROXY: 'http://127.0.0.1:8888', NO_PROXY: 'github.com' },
			windowsSystemProxy: winEnabled,
		})).toBeNull();

		expect(resolveOutboundProxyForUrl(new URL('https://example.org/'), {
			configProxy: undefined,
			env: { HTTPS_PROXY: 'http://127.0.0.1:8888', NO_PROXY: 'github.com' },
			windowsSystemProxy: winEnabled,
		})).toBe('http://127.0.0.1:8888/');

		// 3. Explicit empty HTTPS_PROXY disables fallback to Windows system proxy
		expect(resolveOutboundProxyForUrl(target, {
			configProxy: undefined,
			env: { HTTPS_PROXY: '' },
			windowsSystemProxy: winEnabled,
		})).toBeNull();

		// 4. Windows system proxy is used when configProxy and env vars are unset
		expect(resolveOutboundProxyForUrl(target, {
			configProxy: undefined,
			env: {},
			windowsSystemProxy: winEnabled,
		})).toBe('http://127.0.0.1:7897/');

		expect(resolveOutboundProxyForUrl(new URL('http://localhost:3000/'), {
			configProxy: undefined,
			env: {},
			windowsSystemProxy: winEnabled,
		})).toBeNull();

		// 5. Disabled Windows proxy yields direct connection
		expect(resolveOutboundProxyForUrl(target, {
			configProxy: undefined,
			env: {},
			windowsSystemProxy: { enabled: false, proxyServer: '127.0.0.1:7897', proxyOverride: [] },
		})).toBeNull();
	});
});

describe('HttpRequestService dynamic env proxy resolution', () => {
	test('switches agents dynamically according to HTTPS_PROXY and NO_PROXY when config.proxy is unset', () => {
		clearProxyEnv();
		const config = {
			proxy: undefined,
			proxyBypassHosts: ['oss.liminalselves.top'],
		} as unknown as Config;

		const service = new HttpRequestService(config);

		expect(service.getAgentByUrl(new URL('https://api.github.com/'))).not.toBeInstanceOf(HttpsProxyAgent);

		process.env.HTTPS_PROXY = 'http://127.0.0.1:7897';
		process.env.HTTP_PROXY = 'http://127.0.0.1:7898';
		process.env.NO_PROXY = 'localhost,.internal.test';

		const httpsAgent = service.getAgentByUrl(new URL('https://api.github.com/'));
		const httpAgent = service.getAgentByUrl(new URL('http://example.com/'));
		expect(httpsAgent).toBeInstanceOf(HttpsProxyAgent);
		expect(httpAgent).toBeInstanceOf(HttpProxyAgent);
		expect(service.httpsAgent).toBe(httpsAgent);
		expect(service.httpAgent).toBe(httpAgent);

		// Bypass via NO_PROXY and config.proxyBypassHosts
		expect(service.getAgentByUrl(new URL('https://sub.internal.test/'))).not.toBeInstanceOf(HttpsProxyAgent);
		expect(service.getAgentByUrl(new URL('https://oss.liminalselves.top/a.png'))).not.toBeInstanceOf(HttpsProxyAgent);

		// Clearing env vars immediately restores direct agents
		clearProxyEnv();
		expect(service.getAgentByUrl(new URL('https://api.github.com/'))).not.toBeInstanceOf(HttpsProxyAgent);
		expect(service.getAgentByUrl(new URL('http://example.com/'))).not.toBeInstanceOf(HttpProxyAgent);
	});
});
