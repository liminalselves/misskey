/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import MkCaptcha from '@/components/MkCaptcha.vue';

vi.mock('@/store.js', () => ({ store: { s: { darkMode: false } } }));

type InitOptions = {
	success: (param: string) => void;
	fail?: (result: unknown) => void;
	getInstance: (instance: object) => void;
};

let inits: InitOptions[];

// Mimics a form: v-model holds the response, the button rebuilds the widget like a failed submit does.
function mountForm() {
	const response = ref<string | null>(null);
	const view = render(defineComponent(() => {
		const captcha = ref<{ reset: () => void } | null>(null);
		return () => h('div', [
			h(MkCaptcha, {
				ref: captcha,
				provider: 'aliyuncaptcha',
				sitekey: 'prefix',
				sceneId: 'scene',
				region: 'cn',
				modelValue: response.value,
				'onUpdate:modelValue': (v: string | null) => { response.value = v; },
			}),
			h('button', { 'data-reset': '', onClick: () => captcha.value?.reset() }),
		]);
	}), { global: { stubs: { MkEllipsis: true } } });
	return { response, ...view };
}

const triggers = (container: Element) => container.querySelectorAll<HTMLButtonElement>('._aliyunCaptchaTrigger');

beforeEach(() => {
	inits = [];
	(window as unknown as { initAliyunCaptcha: (options: InitOptions) => void }).initAliyunCaptcha = (options) => {
		inits.push(options);
		options.getInstance({});
	};
});

afterEach(() => {
	cleanup();
	delete (window as unknown as { initAliyunCaptcha?: unknown }).initAliyunCaptcha;
	delete (window as unknown as { hcaptcha?: unknown }).hcaptcha;
	document.getElementById('script-hcaptcha')?.remove();
});

describe('MkCaptcha aliyuncaptcha reset', () => {
	test('initializes once and reports the verified param', async () => {
		const { response, container } = mountForm();
		await nextTick();

		expect(inits).toHaveLength(1);
		expect(triggers(container)).toHaveLength(1);

		inits[0].success('param-1');
		await nextTick();

		expect(response.value).toBe('param-1');
		expect(triggers(container)[0].disabled).toBe(true);
	});

	test('reset rebuilds the widget so the SDK no longer shows a consumed pass', async () => {
		const { response, container } = mountForm();
		await nextTick();
		inits[0].success('param-1');
		await nextTick();

		await fireEvent.click(container.querySelector('[data-reset]')!);
		await nextTick();

		expect(response.value).toBeNull();
		expect(inits).toHaveLength(2);
		// The old widget is gone, the new one is unverified and clickable.
		expect(triggers(container)).toHaveLength(1);
		expect(triggers(container)[0].disabled).toBe(false);

		inits[1].success('param-2');
		await nextTick();
		expect(response.value).toBe('param-2');
	});

	test('callbacks from a torn down widget are ignored', async () => {
		const { response, container } = mountForm();
		await nextTick();
		await fireEvent.click(container.querySelector('[data-reset]')!);
		await nextTick();

		inits[0].success('stale-param');
		inits[0].fail?.('stale-failure');
		await nextTick();
		expect(response.value).toBeNull();

		inits[1].success('fresh-param');
		await nextTick();
		inits[0].fail?.('late-stale-failure');
		await nextTick();
		expect(response.value).toBe('fresh-param');
	});
});

describe('MkCaptcha script load error and recovery', () => {
	const stubHcaptcha = () => {
		(window as unknown as { hcaptcha: object }).hcaptcha = {
			render: vi.fn(() => 'widget-1'),
			remove: vi.fn(),
			execute: vi.fn(),
			reset: vi.fn(),
			getResponse: vi.fn(() => ''),
		};
	};

	test('clears loading spinner on script error and recovers when retried', async () => {
		const view = render(MkCaptcha, {
			props: { provider: 'hcaptcha', sitekey: 'site-key' },
			global: { stubs: { MkEllipsis: true } },
		});
		await nextTick();

		expect(view.container.querySelector('.ti-loader-2')).not.toBeNull();
		const firstScript = document.getElementById('script-hcaptcha') as HTMLScriptElement;
		expect(firstScript).not.toBeNull();

		firstScript.dispatchEvent(new Event('error'));
		await nextTick();

		expect(view.container.querySelector('.ti-loader-2')).toBeNull();
		const retryBtn = view.container.querySelector('button');
		expect(retryBtn).not.toBeNull();

		await fireEvent.click(retryBtn!);
		await nextTick();

		const retriedScript = document.getElementById('script-hcaptcha') as HTMLScriptElement;
		expect(retriedScript).not.toBeNull();
		expect(retriedScript).not.toBe(firstScript);
		expect(view.container.querySelector('.ti-loader-2')).not.toBeNull();

		stubHcaptcha();
		retriedScript.dispatchEvent(new Event('load'));
		await nextTick();

		expect(view.container.querySelector('.ti-loader-2')).toBeNull();
		expect(view.container.querySelector('.ti-alert-triangle')).toBeNull();
	});

	test('recovers on remount when an already-failed script element sits in head', async () => {
		const firstView = render(MkCaptcha, {
			props: { provider: 'hcaptcha', sitekey: 'site-key' },
			global: { stubs: { MkEllipsis: true } },
		});
		await nextTick();

		const failedScript = document.getElementById('script-hcaptcha') as HTMLScriptElement;
		expect(failedScript).not.toBeNull();
		// Even if unmounted before the network failure event fires, dataset.loadFailed must persist.
		firstView.unmount();
		failedScript.dispatchEvent(new Event('error'));
		expect(failedScript.dataset.loadFailed).toBe('true');

		const secondView = render(MkCaptcha, {
			props: { provider: 'hcaptcha', sitekey: 'site-key' },
			global: { stubs: { MkEllipsis: true } },
		});
		await nextTick();

		const freshScript = document.getElementById('script-hcaptcha') as HTMLScriptElement;
		expect(freshScript).not.toBeNull();
		expect(freshScript).not.toBe(failedScript);

		stubHcaptcha();
		freshScript.dispatchEvent(new Event('load'));
		await nextTick();

		expect(secondView.container.querySelector('.ti-loader-2')).toBeNull();
	});
});
