/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { ref } from 'vue';
import { apiUrl } from '@@/js/config.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { getAgentControlRuntimeToken, notifyAgentControlApiSuccess, notifyAgentControlAuthenticationFailure } from '@/utility/agent-control-embed.js';
export const pendingApiRequestsCount = ref(0);

// Default per-request timeout. After sleep/wake or a network switch a TCP half-open
// connection can leave fetch pending for minutes, so pages spin until a manual reload.
// Rejecting lets each UI surface its error/retry state instead.
// The default matches the usual reverse-proxy read timeout, past which the response is
// lost anyway. agents/* run synchronous LLM / image generation (backend LLM budget alone
// is 120s) and admin/* includes batch generation / remote probes, so they get a larger cap.
const REQUEST_TIMEOUT_MS = 1000 * 60;
const LONG_REQUEST_TIMEOUT_MS = 1000 * 300;

function requestTimeoutMs(endpoint: string): number {
	return endpoint.startsWith('agents/') || endpoint.startsWith('admin/') ? LONG_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
}

type ApiTimeoutError = {
	message: string;
	code: string;
	id: string;
	info: { endpoint: string; timeoutMs: number };
};

function apiTimeoutError(endpoint: string, timeoutMs: number): ApiTimeoutError {
	return {
		message: 'Request timed out',
		code: 'REQUEST_TIMEOUT',
		id: '96a1c4d4-8bd2-4f0a-9d7e-2b0f6a3c1d55',
		info: { endpoint, timeoutMs },
	};
}

/**
 * Wrap fetch with a per-request abort timer linked to the caller's signal (if any).
 * Returns the fetch promise (rejecting with an API-shaped error on timeout) plus
 * cleanup that must run once the request settles.
 */
function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, signal: AbortSignal | null | undefined, endpoint: string): {
	promise: Promise<Response>;
	settle: () => void;
} {
	const controller = new AbortController();
	let timedOut = false;
	const timer = window.setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);
	const onCallerAbort = () => controller.abort();
	if (signal != null) {
		if (signal.aborted) controller.abort();
		else signal.addEventListener('abort', onCallerAbort, { once: true });
	}
	const promise = window.fetch(url, { ...init, signal: controller.signal });
	const settle = () => {
		window.clearTimeout(timer);
		if (signal != null) signal.removeEventListener('abort', onCallerAbort);
	};
	promise.then(settle, settle);
	return {
		promise: promise.catch(err => {
			if (timedOut) throw apiTimeoutError(endpoint, timeoutMs);
			throw err;
		}),
		settle,
	};
}

let handlingSuspendedAccount = false;

async function handleSuspendedAccount(error: { code?: string; info?: unknown }): Promise<void> {
	if (!$i || error.code !== 'YOUR_ACCOUNT_SUSPENDED' || handlingSuspendedAccount) return;
	handlingSuspendedAccount = true;
	try {
		const [{ showSuspendedDialog }, { signout }] = await Promise.all([
			import('@/utility/show-suspended-dialog.js'),
			import('@/signout.js'),
		]);
		await showSuspendedDialog(error.info as { reason?: string | null; suspendedUntil?: string | null } | null);
		await signout();
	} finally {
		handlingSuspendedAccount = false;
	}
}

/** Use in catch() when misskeyApi rejects with `{ message, code, id, info? }` — avoid String(err) → "[object Object]". */
export function formatApiError(err: unknown): string {
	if (err != null && typeof err === 'object' && 'message' in err) {
		const o = err as { message?: unknown; code?: string; info?: { reason?: string; status?: number; detail?: string; attempts?: unknown[] } | null };
		if (typeof o.message === 'string') {
			// 已知错误码映射为用户友好的中文提示
			const head = o.code === 'AGENTS_LLM_FAILED'
				? i18n.ts._agents.llmRequestFailedHint
				: o.code === 'AGENTS_LLM_TIMEOUT'
					? i18n.ts._agents.llmTimeoutHint
					: o.message;
			// 附加脱敏诊断信息：错误码 · 原因 · HTTP状态 · 详情
			const parts: string[] = [];
			if (o.code) parts.push(o.code);
			const info = o.info;
			if (info != null && typeof info === 'object') {
				if (info.reason) parts.push(String(info.reason));
				if (info.status != null) parts.push(`HTTP ${info.status}`);
				if (info.detail) parts.push(String(info.detail));
			}
			const codeLine = parts.length > 0 ? `\n[${parts.join(' · ')}]` : '';
			const attemptLines = info != null && Array.isArray(info.attempts)
				? info.attempts.flatMap((raw, index) => {
					if (raw == null || typeof raw !== 'object') return [];
					const attempt = raw as { index?: unknown; code?: unknown; reason?: unknown; status?: unknown; detail?: unknown };
					const attemptParts: string[] = [];
					if (typeof attempt.code === 'string') attemptParts.push(attempt.code);
					if (typeof attempt.status === 'number') attemptParts.push(`HTTP ${attempt.status}`);
					if (typeof attempt.detail === 'string' && attempt.detail) attemptParts.push(attempt.detail);
					else if (typeof attempt.reason === 'string' && attempt.reason) attemptParts.push(attempt.reason);
					return attemptParts.length > 0 ? [`#${typeof attempt.index === 'number' ? attempt.index : index + 1}：${attemptParts.join(' · ')}`] : [];
				})
				: [];
			return head + codeLine + (attemptLines.length > 0 ? `\n${attemptLines.join('\n')}` : '');
		}
	}
	return String(err);
}

// Implements Misskey.api.ApiClient.request
export function misskeyApi<
	ResT = void,
	E extends keyof Misskey.Endpoints = keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'] = Misskey.Endpoints[E]['req'],
	_ResT = ResT extends void ? Misskey.api.SwitchCaseResponseType<E, P> : ResT,
>(
	endpoint: E,
	data: P & { i?: string | null; } = {} as any,
	token?: string | null | undefined,
	signal?: AbortSignal,
): Promise<_ResT> {
	if (endpoint.includes('://')) throw new Error('invalid endpoint');
	pendingApiRequestsCount.value++;

	const onFinally = () => {
		pendingApiRequestsCount.value--;
	};

	const promise = new Promise<_ResT>((resolve, reject) => {
		// Append a credential
		const runtimeToken = getAgentControlRuntimeToken();
		if (runtimeToken != null) {
			data.i = runtimeToken;
		} else if ($i) {
			data.i = $i.token;
		}
		if (token !== undefined) data.i = token;

		// Send request
		fetchWithTimeout(`${apiUrl}/${endpoint}`, {
			method: 'POST',
			body: JSON.stringify(data),
			credentials: 'omit',
			cache: 'no-cache',
			headers: {
				'Content-Type': 'application/json',
			},
		}, requestTimeoutMs(endpoint), signal, endpoint).promise.then(async (res) => {
			const body = res.status === 204 ? null : await res.json();

			if (res.status === 200) {
				notifyAgentControlApiSuccess(endpoint);
				resolve(body);
			} else if (res.status === 204) {
				notifyAgentControlApiSuccess(endpoint);
				resolve(undefined as _ResT); // void -> undefined
			} else {
				if (body?.error?.code === 'AUTHENTICATION_FAILED') {
					notifyAgentControlAuthenticationFailure(body.error.message ?? 'Authentication failed');
				}
				void handleSuspendedAccount(body.error);
				reject(body.error);
			}
		}).catch(reject);
	});

	promise.then(onFinally, onFinally);

	return promise;
}

// Implements Misskey.api.ApiClient.request
export function misskeyApiGet<
	ResT = void,
	E extends keyof Misskey.Endpoints = keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'] = Misskey.Endpoints[E]['req'],
	_ResT = ResT extends void ? Misskey.api.SwitchCaseResponseType<E, P> : ResT,
>(
	endpoint: E,
	data: P = {} as any,
): Promise<_ResT> {
	pendingApiRequestsCount.value++;

	const onFinally = () => {
		pendingApiRequestsCount.value--;
	};

	const query = new URLSearchParams(data as any);

	const promise = new Promise<_ResT>((resolve, reject) => {
		// Send request
		fetchWithTimeout(`${apiUrl}/${endpoint}?${query}`, {
			method: 'GET',
			credentials: 'omit',
			cache: 'default',
		}, requestTimeoutMs(endpoint), null, endpoint).promise.then(async (res) => {
			const body = res.status === 204 ? null : await res.json();

			if (res.status === 200) {
				notifyAgentControlApiSuccess(endpoint);
				resolve(body);
			} else if (res.status === 204) {
				notifyAgentControlApiSuccess(endpoint);
				resolve(undefined as _ResT); // void -> undefined
			} else {
				if (body?.error?.code === 'AUTHENTICATION_FAILED') {
					notifyAgentControlAuthenticationFailure(body.error.message ?? 'Authentication failed');
				}
				void handleSuspendedAccount(body.error);
				reject(body.error);
			}
		}).catch(reject);
	});

	promise.then(onFinally, onFinally);

	return promise;
}
