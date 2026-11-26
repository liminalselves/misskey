/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as dns from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as stream from 'node:stream';
import ipaddr from 'ipaddr.js';
import CacheableLookup from 'cacheable-lookup';
import fetch from 'node-fetch';
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';
import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { StatusError } from '@/misc/status-error.js';
import { bindThis } from '@/decorators.js';
import { validateContentTypeSetAsActivityPub } from '@/core/activitypub/misc/validator.js';
import { assertActivityMatchesUrl, FetchAllowSoftFailMask } from '@/core/activitypub/misc/check-against-url.js';
import type { IObject } from '@/core/activitypub/type.js';
import type { BodyInit, Response } from 'node-fetch';
import type { URL } from 'node:url';
import {
	isDevWindowsSystemProxyEligible,
	normalizeExplicitConfigProxy,
	parseWindowsProxyServer,
	readWindowsSystemProxyAsync,
	readWindowsSystemProxySync,
	resolveOutboundProxyForUrl,
	resolveProxyConfigFromEnv,
	type WindowsSystemProxyState,
} from '@/misc/resolve-proxy.js';

const WINDOWS_PROXY_REFRESH_TTL_MS = 5000;

export function createResilientDnsLookup(
	cache: Pick<CacheableLookup, 'lookup'>,
	fallbackLookup: typeof dns.lookup = dns.lookup,
): net.LookupFunction {
	return ((
		hostname: string,
		optionsOrCallback: dns.LookupOptions | number | ((err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void),
		maybeCallback?: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void,
	) => {
		const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
		const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
		if (!callback) return;

		cache.lookup(hostname, options as never, (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => {
			if (err && (process.env.NODE_ENV !== 'production' || err.code === 'ECONNREFUSED')) {
				fallbackLookup(hostname, options as never, callback as never);
				return;
			}
			callback(err, address, family);
		});
	}) as unknown as net.LookupFunction;
}

export type HttpRequestSendOptions = {
	throwErrorWhenResponseNotOk: boolean;
	validators?: ((res: Response) => void)[];
};

class HttpRequestServiceAgent extends http.Agent {
	constructor(
		private config: Config,
		options?: http.AgentOptions,
	) {
		super(options);
	}

	@bindThis
	public createConnection(options: http.ClientRequestArgs, callback?: (err: Error | null, stream: stream.Duplex) => void): stream.Duplex {
		const socket = super.createConnection(options, callback);

		if (socket == null) {
			throw new Error('Failed to create socket');
		}

		socket.on('connect', () => {
			if (socket instanceof net.Socket && process.env.NODE_ENV === 'production') {
				const address = socket.remoteAddress;
				if (address && ipaddr.isValid(address)) {
					if (this.isPrivateIp(address)) {
						socket.destroy(new Error(`Blocked address: ${address}`));
					}
				}
			}
		});

		return socket;
	}

	@bindThis
	private isPrivateIp(ip: string): boolean {
		const parsedIp = ipaddr.parse(ip);

		for (const net of this.config.allowedPrivateNetworks ?? []) {
			const cidr = ipaddr.parseCIDR(net);
			if (cidr[0].kind() === parsedIp.kind() && parsedIp.match(ipaddr.parseCIDR(net))) {
				return false;
			}
		}

		return parsedIp.range() !== 'unicast';
	}
}

class HttpsRequestServiceAgent extends https.Agent {
	constructor(
		private config: Config,
		options?: https.AgentOptions,
	) {
		super(options);
	}

	@bindThis
	public createConnection(options: http.ClientRequestArgs, callback?: (err: Error | null, stream: stream.Duplex) => void): stream.Duplex {
		const socket = super.createConnection(options, callback);

		if (socket == null) {
			throw new Error('Failed to create socket');
		}

		socket.on('connect', () => {
			if (socket instanceof net.Socket && process.env.NODE_ENV === 'production') {
				const address = socket.remoteAddress;
				if (address && ipaddr.isValid(address)) {
					if (this.isPrivateIp(address)) {
						socket.destroy(new Error(`Blocked address: ${address}`));
					}
				}
			}
		});

		return socket;
	}

	@bindThis
	private isPrivateIp(ip: string): boolean {
		const parsedIp = ipaddr.parse(ip);

		for (const net of this.config.allowedPrivateNetworks ?? []) {
			const cidr = ipaddr.parseCIDR(net);
			if (cidr[0].kind() === parsedIp.kind() && parsedIp.match(ipaddr.parseCIDR(net))) {
				return false;
			}
		}

		return parsedIp.range() !== 'unicast';
	}
}

@Injectable()
export class HttpRequestService {
	/**
	 * Get http non-proxy agent (without local address filtering)
	 */
	private readonly httpNative: http.Agent;

	/**
	 * Get https non-proxy agent (without local address filtering)
	 */
	private readonly httpsNative: https.Agent;

	/**
	 * Get http non-proxy agent
	 */
	private readonly http: http.Agent;

	/**
	 * Get https non-proxy agent
	 */
	private readonly https: https.Agent;

	private readonly agentOption: http.AgentOptions;

	private readonly maxSockets: number;

	private readonly httpProxyAgents = new Map<string, http.Agent>();

	private readonly httpsProxyAgents = new Map<string, https.Agent>();

	private windowsSystemProxy: WindowsSystemProxyState | null = null;

	private windowsSystemProxyCheckedAt = 0;

	private windowsSystemProxyRefreshPromise: Promise<void> | null = null;

	/**
	 * Get http proxy or non-proxy agent
	 */
	public get httpAgent(): http.Agent {
		const proxyUrl = this.resolveDefaultProxyUrl('http:');
		return proxyUrl ? this.getOrCreateHttpProxyAgent(proxyUrl) : this.http;
	}

	/**
	 * Get https proxy or non-proxy agent
	 */
	public get httpsAgent(): https.Agent {
		const proxyUrl = this.resolveDefaultProxyUrl('https:');
		return proxyUrl ? this.getOrCreateHttpsProxyAgent(proxyUrl) : this.https;
	}

	constructor(
		@Inject(DI.config)
		private config: Config,
	) {
		const cache = new CacheableLookup({
			maxTtl: 3600,	// 1hours
			errorTtl: 30,	// 30secs
			lookup: false,	// nativeのdns.lookupにfallbackしない
		});

		this.agentOption = {
			keepAlive: true,
			keepAliveMsecs: 30 * 1000,
			lookup: createResilientDnsLookup(cache),
			localAddress: config.outgoingAddress,
		};

		this.httpNative = new http.Agent(this.agentOption);

		this.httpsNative = new https.Agent(this.agentOption);

		this.http = new HttpRequestServiceAgent(config, this.agentOption);

		this.https = new HttpsRequestServiceAgent(config, this.agentOption);

		this.maxSockets = Math.max(256, config.deliverJobConcurrency ?? 128);

		if (this.shouldUseWindowsSystemProxyFallback()) {
			this.windowsSystemProxy = readWindowsSystemProxySync();
			this.windowsSystemProxyCheckedAt = Date.now();
		}
	}

	private shouldUseWindowsSystemProxyFallback(): boolean {
		if (!isDevWindowsSystemProxyEligible()) return false;
		if (normalizeExplicitConfigProxy(this.config.proxy)) return false;
		return !resolveProxyConfigFromEnv().hasAnyProxyVar;
	}

	private maybeRefreshWindowsSystemProxy(): void {
		if (!this.shouldUseWindowsSystemProxyFallback()) return;
		if (this.windowsSystemProxyRefreshPromise) return;
		if (Date.now() - this.windowsSystemProxyCheckedAt < WINDOWS_PROXY_REFRESH_TTL_MS) return;

		this.windowsSystemProxyRefreshPromise = readWindowsSystemProxyAsync()
			.then((state) => {
				this.windowsSystemProxy = state;
				this.windowsSystemProxyCheckedAt = Date.now();
			})
			.catch(() => {
				this.windowsSystemProxyCheckedAt = Date.now();
			})
			.finally(() => {
				this.windowsSystemProxyRefreshPromise = null;
			});
	}

	private getOrCreateHttpProxyAgent(proxyUrl: string): http.Agent {
		let agent = this.httpProxyAgents.get(proxyUrl);
		if (!agent) {
			agent = new HttpProxyAgent({
				keepAlive: true,
				keepAliveMsecs: 30 * 1000,
				maxSockets: this.maxSockets,
				maxFreeSockets: 256,
				scheduling: 'lifo',
				proxy: proxyUrl,
				localAddress: this.config.outgoingAddress,
			});
			this.httpProxyAgents.set(proxyUrl, agent);
		}
		return agent;
	}

	private getOrCreateHttpsProxyAgent(proxyUrl: string): https.Agent {
		let agent = this.httpsProxyAgents.get(proxyUrl);
		if (!agent) {
			agent = new HttpsProxyAgent({
				keepAlive: true,
				keepAliveMsecs: 30 * 1000,
				maxSockets: this.maxSockets,
				maxFreeSockets: 256,
				scheduling: 'lifo',
				proxy: proxyUrl,
				localAddress: this.config.outgoingAddress,
			});
			this.httpsProxyAgents.set(proxyUrl, agent);
		}
		return agent;
	}

	private resolveDefaultProxyUrl(protocol: 'http:' | 'https:'): string | null {
		const explicit = normalizeExplicitConfigProxy(this.config.proxy);
		if (explicit) return explicit;

		const envProxy = resolveProxyConfigFromEnv();
		if (envProxy.hasAnyProxyVar) {
			return protocol === 'https:'
				? (envProxy.httpsProxy ?? envProxy.allProxy)
				: (envProxy.httpProxy ?? envProxy.allProxy);
		}

		this.maybeRefreshWindowsSystemProxy();
		if (this.windowsSystemProxy?.enabled && this.windowsSystemProxy.proxyServer) {
			return parseWindowsProxyServer(this.windowsSystemProxy.proxyServer, protocol);
		}

		return null;
	}

	private resolveEffectiveProxyUrl(url: URL): string | null {
		this.maybeRefreshWindowsSystemProxy();
		return resolveOutboundProxyForUrl(url, {
			configProxy: this.config.proxy,
			configBypassHosts: this.config.proxyBypassHosts,
			windowsSystemProxy: this.windowsSystemProxy,
		});
	}

	/**
	 * Get agent by URL
	 * @param url URL
	 * @param bypassProxy Always bypass proxy
	 * @param isLocalAddressAllowed
	 */
	@bindThis
	public getAgentByUrl(url: URL, bypassProxy = false, isLocalAddressAllowed = false): http.Agent | https.Agent {
		const proxyUrl = bypassProxy ? null : this.resolveEffectiveProxyUrl(url);
		if (proxyUrl) {
			return url.protocol === 'http:'
				? this.getOrCreateHttpProxyAgent(proxyUrl)
				: this.getOrCreateHttpsProxyAgent(proxyUrl);
		}

		if (isLocalAddressAllowed) {
			return url.protocol === 'http:' ? this.httpNative : this.httpsNative;
		}
		return url.protocol === 'http:' ? this.http : this.https;
	}

	/**
	 * Get agent for http by URL
	 * @param url URL
	 * @param isLocalAddressAllowed
	 */
	@bindThis
	public getAgentForHttp(url: URL, isLocalAddressAllowed = false): http.Agent {
		return this.getAgentByUrl(url, false, isLocalAddressAllowed) as http.Agent;
	}

	/**
	 * Get agent for https by URL
	 * @param url URL
	 * @param isLocalAddressAllowed
	 */
	@bindThis
	public getAgentForHttps(url: URL, isLocalAddressAllowed = false): https.Agent {
		return this.getAgentByUrl(url, false, isLocalAddressAllowed) as https.Agent;
	}

	@bindThis
	public async getActivityJson(url: string, isLocalAddressAllowed = false, allowSoftfail: FetchAllowSoftFailMask = FetchAllowSoftFailMask.Strict): Promise<IObject> {
		const res = await this.send(url, {
			method: 'GET',
			headers: {
				Accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
			},
			timeout: 5000,
			size: 1024 * 256,
			isLocalAddressAllowed: isLocalAddressAllowed,
		}, {
			throwErrorWhenResponseNotOk: true,
			validators: [validateContentTypeSetAsActivityPub],
		});

		const finalUrl = res.url; // redirects may have been involved
		const activity = await res.json() as IObject;

		assertActivityMatchesUrl(url, activity, finalUrl, allowSoftfail);

		return activity;
	}

	@bindThis
	public async getJson<T = unknown>(url: string, accept = 'application/json, */*', headers?: Record<string, string>, isLocalAddressAllowed = false): Promise<T> {
		const res = await this.send(url, {
			method: 'GET',
			headers: Object.assign({
				Accept: accept,
			}, headers ?? {}),
			timeout: 5000,
			size: 1024 * 256,
			isLocalAddressAllowed: isLocalAddressAllowed,
		});

		return await res.json() as T;
	}

	@bindThis
	public async getHtml(url: string, accept = 'text/html, */*', headers?: Record<string, string>, isLocalAddressAllowed = false): Promise<string> {
		const res = await this.send(url, {
			method: 'GET',
			headers: Object.assign({
				Accept: accept,
			}, headers ?? {}),
			timeout: 5000,
			isLocalAddressAllowed: isLocalAddressAllowed,
		});

		return await res.text();
	}

	@bindThis
	public async send(
		url: string,
		args: {
			method?: string,
			body?: BodyInit,
			headers?: Record<string, string>,
			timeout?: number,
			size?: number,
			isLocalAddressAllowed?: boolean,
		} = {},
		extra: HttpRequestSendOptions = {
			throwErrorWhenResponseNotOk: true,
			validators: [],
		},
	): Promise<Response> {
		const timeout = args.timeout ?? 5000;

		const controller = new AbortController();
		setTimeout(() => {
			controller.abort();
		}, timeout);

		const isLocalAddressAllowed = args.isLocalAddressAllowed ?? false;

		const res = await fetch(url, {
			method: args.method ?? 'GET',
			headers: {
				'User-Agent': this.config.userAgent,
				...(args.headers ?? {}),
			},
			body: args.body,
			size: args.size ?? 10 * 1024 * 1024,
			agent: (url) => this.getAgentByUrl(url, false, isLocalAddressAllowed),
			signal: controller.signal,
		});

		if (!res.ok && extra.throwErrorWhenResponseNotOk) {
			throw new StatusError(`${res.status} ${res.statusText}`, res.status, res.statusText);
		}

		if (res.ok) {
			for (const validator of (extra.validators ?? [])) {
				validator(res);
			}
		}

		return res;
	}
}
