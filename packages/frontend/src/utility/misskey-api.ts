/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { ref } from 'vue';
import { apiUrl } from '@@/js/config.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
export const pendingApiRequestsCount = ref(0);

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
		const o = err as { message?: unknown; code?: string; info?: { reason?: string; status?: number; detail?: string } | null };
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
			return head + codeLine;
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
		if ($i) data.i = $i.token;
		if (token !== undefined) data.i = token;

		// Send request
		window.fetch(`${apiUrl}/${endpoint}`, {
			method: 'POST',
			body: JSON.stringify(data),
			credentials: 'omit',
			cache: 'no-cache',
			headers: {
				'Content-Type': 'application/json',
			},
			signal,
		}).then(async (res) => {
			const body = res.status === 204 ? null : await res.json();

			if (res.status === 200) {
				resolve(body);
			} else if (res.status === 204) {
				resolve(undefined as _ResT); // void -> undefined
			} else {
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
		window.fetch(`${apiUrl}/${endpoint}?${query}`, {
			method: 'GET',
			credentials: 'omit',
			cache: 'default',
		}).then(async (res) => {
			const body = res.status === 204 ? null : await res.json();

			if (res.status === 200) {
				resolve(body);
			} else if (res.status === 204) {
				resolve(undefined as _ResT); // void -> undefined
			} else {
				void handleSuspendedAccount(body.error);
				reject(body.error);
			}
		}).catch(reject);
	});

	promise.then(onFinally, onFinally);

	return promise;
}
